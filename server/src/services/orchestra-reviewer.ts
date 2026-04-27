/**
 * Orchestra reviewer service.
 *
 * After a step's Issue terminates, the reviewer reads the produced work
 * product, checks it against the step's acceptance criteria via an LLM
 * call, and decides one of:
 *   - accept   → step marked completed, dependents promoted
 *   - revise   → step's revisionCount++ and Issue is reopened with the
 *                reviewer's revisionInstructions prepended; capped at
 *                MAX_REVISIONS (default 2) per step
 *   - escalate → step marked failed; outcome may transition to refining
 *                so the user can decide what to do
 *
 * The actual orchestration (which order to fire reviewer in, when to
 * trigger assembly, when to promote dependents) lives in
 * orchestra-step-completion.ts. This module is a pure "given a step +
 * its work product, produce a review verdict and persist it".
 *
 * If no acceptance criteria are set, the reviewer auto-passes (we don't
 * waste an LLM call on undefined criteria).
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@orqestra/db";
import {
  agents,
  issueWorkProducts,
  orchestraPlanSteps,
  orchestraReviews,
  outcomes as outcomesTable,
} from "@orqestra/db";
import {
  buildReviewerPrompt,
  reviewerLLMResultSchema,
  type ReviewerLLMResultParsed,
  type OrchestraStepAcceptanceCriterion,
} from "@orqestra/shared";
import {
  defaultAnthropicRunLLM,
  extractJsonBlob,
  OrchestraLLMNotConfiguredError,
  type OrchestraRunLLM,
} from "./orchestra-llm.js";

export const MAX_STEP_REVISIONS = 2;

export type ReviewerVerdict =
  | { kind: "accept"; review: ReviewerLLMResultParsed; reviewId: string }
  | {
      kind: "revise";
      review: ReviewerLLMResultParsed;
      reviewId: string;
      revisionInstructions: string;
    }
  | {
      kind: "escalate";
      review: ReviewerLLMResultParsed;
      reviewId: string;
      reason: string;
    }
  | { kind: "auto_pass"; reason: string };

export interface ReviewerServiceDeps {
  runLLM?: OrchestraRunLLM;
}

export function orchestraReviewerService(
  db: Db,
  deps: ReviewerServiceDeps = {},
) {
  const runLLM = deps.runLLM ?? defaultAnthropicRunLLM;

  return {
    /**
     * Review the most recent work product for a step's Issue.
     * Returns a verdict and persists an OrchestraReview row.
     *
     * Caller is responsible for acting on the verdict (promoting
     * dependents, reopening the issue with revision instructions, etc).
     */
    reviewStep: async (input: {
      companyId: string;
      stepId: string;
    }): Promise<ReviewerVerdict> => {
      const { companyId, stepId } = input;

      const [step] = await db
        .select()
        .from(orchestraPlanSteps)
        .where(
          and(
            eq(orchestraPlanSteps.id, stepId),
            eq(orchestraPlanSteps.companyId, companyId),
          ),
        );
      if (!step) throw new Error(`Step ${stepId} not found`);
      if (!step.issueId) throw new Error(`Step ${stepId} has no linked issue`);

      const acceptanceCriteria =
        (step.acceptanceCriteria as OrchestraStepAcceptanceCriterion[]) ?? [];
      const reviewCriteria = (step.reviewCriteria as string[]) ?? [];

      // No criteria → auto-pass. Cheaper and avoids a misleading review row.
      if (acceptanceCriteria.length === 0 && reviewCriteria.length === 0) {
        return { kind: "auto_pass", reason: "No criteria configured" };
      }

      // Most recent primary work product on the step's issue.
      const [workProduct] = await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.issueId, step.issueId))
        .orderBy(desc(issueWorkProducts.createdAt))
        .limit(1);

      const workProductBody = workProduct?.summary?.trim()
        ? workProduct.summary
        : "(No work product body recorded.)";

      const [outcomeRow] = await db
        .select()
        .from(outcomesTable)
        .where(eq(outcomesTable.id, step.outcomeId));
      if (!outcomeRow) throw new Error(`Outcome ${step.outcomeId} not found`);

      // Pick a reviewer agent: the outcome's orchestrator if set, else the
      // company CEO, else any manager, else any agent.
      const reviewerAgentId = await pickReviewerAgent(
        db,
        companyId,
        outcomeRow.orchestratorAgentId,
      );
      if (!reviewerAgentId) {
        return {
          kind: "auto_pass",
          reason: "No agent available to review; skipping",
        };
      }

      const prompt = buildReviewerPrompt({
        outcomeTitle: outcomeRow.title,
        outcomeBrief: outcomeRow.brief,
        stepTitle: step.title,
        stepDescription: step.description,
        acceptanceCriteria,
        reviewCriteria,
        outputRequirement: step.outputRequirement,
        workProductBody,
        revisionAttempt: step.revisionCount + 1,
        maxRevisions: MAX_STEP_REVISIONS,
      });

      let parsed: ReviewerLLMResultParsed;
      try {
        const llmResp = await runLLM({
          prompt,
          expectJson: true,
          maxOutputTokens: 1500,
        });
        parsed = parseReviewerResult(llmResp.text);
      } catch (err) {
        if (err instanceof OrchestraLLMNotConfiguredError) {
          // No LLM configured → don't block; auto-pass with a note.
          return {
            kind: "auto_pass",
            reason: "Reviewer LLM not configured; auto-passing",
          };
        }
        throw err;
      }

      const [reviewRow] = await db
        .insert(orchestraReviews)
        .values({
          outcomeId: step.outcomeId,
          planId: step.planId,
          stepId: step.id,
          reviewedWorkProductId: workProduct?.id ?? null,
          reviewerAgentId,
          status: parsed.pass ? "passed" : "needs_revision",
          score: Math.round(parsed.score),
          comments: parsed.comments,
          revisionInstructions: parsed.revisionInstructions || null,
          gaps: parsed.gaps as unknown as object,
        })
        .returning();

      // Decide downstream action.
      if (parsed.pass || parsed.recommendedNextAction === "accept") {
        return { kind: "accept", review: parsed, reviewId: reviewRow.id };
      }
      if (parsed.recommendedNextAction === "escalate") {
        return {
          kind: "escalate",
          review: parsed,
          reviewId: reviewRow.id,
          reason: parsed.comments || "Reviewer escalated",
        };
      }

      // recommendedNextAction === "revise"
      if (step.revisionCount >= MAX_STEP_REVISIONS) {
        return {
          kind: "escalate",
          review: parsed,
          reviewId: reviewRow.id,
          reason: `Hit max revisions (${MAX_STEP_REVISIONS})`,
        };
      }

      return {
        kind: "revise",
        review: parsed,
        reviewId: reviewRow.id,
        revisionInstructions: parsed.revisionInstructions || parsed.comments,
      };
    },
  };
}

function parseReviewerResult(raw: string): ReviewerLLMResultParsed {
  let json: unknown;
  try {
    json = JSON.parse(extractJsonBlob(raw));
  } catch (err) {
    throw new Error(
      `Reviewer JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = reviewerLLMResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Reviewer JSON validation failed: ${parsed.error.toString().slice(0, 600)}`);
  }
  return parsed.data;
}

async function pickReviewerAgent(
  db: Db,
  companyId: string,
  preferred: string | null,
): Promise<string | null> {
  if (preferred) return preferred;
  const candidates = await db
    .select({ id: agents.id, role: agents.role })
    .from(agents)
    .where(eq(agents.companyId, companyId));
  const ceo = candidates.find((a) => a.role === "ceo");
  if (ceo) return ceo.id;
  const manager = candidates.find((a) => a.role === "manager");
  if (manager) return manager.id;
  return candidates[0]?.id ?? null;
}
