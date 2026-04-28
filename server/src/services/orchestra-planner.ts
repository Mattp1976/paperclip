/**
 * Orchestra planner service.
 *
 * Takes an Outcome, builds the planner prompt, calls the LLM, parses
 * + validates the JSON result, and persists it as a versioned
 * OrchestraPlan with steps. On parse failure we retry once with a
 * "repair" prompt that includes the original error.
 *
 * Side effects:
 *   - emits orchestra events (plan.started, plan.created or
 *     plan.requires_clarification, plan.failed)
 *   - transitions outcome status: draft → planning →
 *     awaiting_clarification | ready_to_execute | failed
 *
 * If the planner returns missingInputs, we transition to
 * awaiting_clarification and surface those to the user via the outcome
 * detail. They can then update the outcome brief and re-call /plan.
 *
 * Agent assignment: in v1 we set step.recommendedAgentId to the first
 * available company agent whose role hint matches recommendedAgentType.
 * The full agent-router (rankAgentsForTask-style) ships separately.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "@orqestra/db";
import { agents, outcomes } from "@orqestra/db";
import {
  buildPlannerPrompt,
  buildPlannerRepairPrompt,
  plannerLLMResultSchema,
  type PlannerLLMResultParsed,
  type OutcomeStatus,
  type OrchestraPlanStepType,
  type OrchestraStepAcceptanceCriterion,
} from "@orqestra/shared";
import { unprocessable, notFound } from "../errors.js";
import { orchestraService } from "./orchestra.js";
import {
  defaultRunLLM,
  extractJsonBlob,
  OrchestraLLMNotConfiguredError,
  type OrchestraRunLLM,
} from "./orchestra-llm.js";

export interface PlannerServiceDeps {
  /**
   * LLM caller. Defaults to the Anthropic Messages API via fetch.
   * Tests / alt providers can pass their own.
   */
  runLLM?: OrchestraRunLLM;
}

export function orchestraPlannerService(
  db: Db,
  deps: PlannerServiceDeps = {},
) {
  const orchestra = orchestraService(db);
  const runLLM = deps.runLLM ?? defaultRunLLM;

  return {
    /**
     * Generate a plan for an outcome. Idempotent in the sense that you
     * can call it repeatedly — each call creates a NEW plan version
     * (existing plans flip to 'superseded' inside persistPlan).
     */
    generatePlan: async (input: {
      companyId: string;
      outcomeId: string;
    }): Promise<{
      planId: string;
      requiresClarification: boolean;
      missingInputs: PlannerLLMResultParsed["missingInputs"];
    }> => {
      const { companyId, outcomeId } = input;

      const [outcomeRow] = await db
        .select()
        .from(outcomes)
        .where(
          and(eq(outcomes.companyId, companyId), eq(outcomes.id, outcomeId)),
        );
      if (!outcomeRow) throw notFound("Outcome not found");

      const currentStatus = outcomeRow.status as OutcomeStatus;
      if (
        currentStatus !== "draft" &&
        currentStatus !== "awaiting_clarification" &&
        currentStatus !== "planning"
      ) {
        throw unprocessable(
          `Cannot plan an outcome in status ${currentStatus}`,
        );
      }

      // Move to planning + emit event
      if (currentStatus !== "planning") {
        await orchestra.transitionStatus(
          companyId,
          outcomeId,
          "planning",
          "outcome.plan.started",
          "Planning started",
        );
      } else {
        // Already planning (re-attempt) — still emit a started event for the timeline.
        await db
          .update(outcomes)
          .set({ updatedAt: new Date() })
          .where(eq(outcomes.id, outcomeId));
      }

      // Fetch available agents to pass into the prompt + later for assignment.
      const agentRows = await db
        .select({
          id: agents.id,
          name: agents.name,
          role: agents.role,
          title: agents.title,
          capabilities: agents.capabilities,
        })
        .from(agents)
        .where(eq(agents.companyId, companyId));

      const availableAgents = agentRows.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        title: a.title ?? "",
        capabilitiesShort: shortenCapabilities(a.capabilities),
      }));

      const prompt = buildPlannerPrompt({
        outcomeTitle: outcomeRow.title,
        outcomeBrief: outcomeRow.brief,
        targetFormat: outcomeRow.targetFormat as PlanTargetFormat,
        priority: outcomeRow.priority as PlanPriority,
        deadline: outcomeRow.deadline?.toISOString() ?? null,
        budgetLimitCents: outcomeRow.budgetLimitCents ?? null,
        availableAgents,
        templateId: extractTemplateId(outcomeRow.metadata),
      });

      let parsed: PlannerLLMResultParsed;
      try {
        parsed = await callPlannerWithRetry(runLLM, prompt);
      } catch (err) {
        await orchestra.transitionStatus(
          companyId,
          outcomeId,
          "failed",
          "outcome.plan.failed",
          err instanceof OrchestraLLMNotConfiguredError
            ? "Planner not configured: ANTHROPIC_API_KEY missing"
            : `Plan generation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }

      // Map recommendedAgentType (free-form text) to an agent id where we can.
      const stepsWithAgentIds = parsed.steps.map((s, ordinal) => ({
        title: s.title,
        description: s.description,
        stepType: s.stepType as OrchestraPlanStepType,
        ordinal,
        dependsOnStepOrdinals: s.dependencies,
        recommendedAgentId:
          matchAgent(s.recommendedAgentType, agentRows) ?? null,
        acceptanceCriteria: s.acceptanceCriteria as OrchestraStepAcceptanceCriterion[],
        reviewCriteria: s.reviewCriteria,
        outputRequirement: s.outputRequirement,
      }));

      const { plan } = await orchestra.persistPlan({
        companyId,
        outcomeId,
        summary: parsed.outcomeSummary,
        assumptions: parsed.assumptions,
        risks: [], // planner schema includes risks via riskLevel; structured risk list comes in v2.
        requiredInputs: parsed.missingInputs,
        estimatedCostCents: parsed.estimatedCostCents,
        estimatedDurationMinutes: parsed.estimatedDurationMinutes,
        confidenceScore: parsed.confidenceScore,
        createdByAgentId: outcomeRow.orchestratorAgentId ?? null,
        steps: stepsWithAgentIds,
      });

      // Update outcome riskLevel from planner's read.
      await db
        .update(outcomes)
        .set({
          riskLevel: parsed.riskLevel,
          updatedAt: new Date(),
        })
        .where(eq(outcomes.id, outcomeId));

      const requiresClarification = parsed.missingInputs.some(
        (m) => m.required,
      );

      if (requiresClarification) {
        await orchestra.transitionStatus(
          companyId,
          outcomeId,
          "awaiting_clarification",
          "outcome.plan.requires_clarification",
          `Plan v${plan.version} drafted; waiting on clarifying input`,
          { missingInputs: parsed.missingInputs },
        );
      } else {
        await orchestra.transitionStatus(
          companyId,
          outcomeId,
          "ready_to_execute",
          "outcome.plan.created",
          `Plan v${plan.version} drafted with ${parsed.steps.length} step(s)`,
          {
            planId: plan.id,
            stepCount: parsed.steps.length,
            confidenceScore: parsed.confidenceScore,
          },
        );
      }

      return {
        planId: plan.id,
        requiresClarification,
        missingInputs: parsed.missingInputs,
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

type PlanTargetFormat = Parameters<typeof buildPlannerPrompt>[0]["targetFormat"];
type PlanPriority = Parameters<typeof buildPlannerPrompt>[0]["priority"];

async function callPlannerWithRetry(
  runLLM: OrchestraRunLLM,
  prompt: string,
): Promise<PlannerLLMResultParsed> {
  // First attempt
  const first = await runLLM({
    prompt,
    expectJson: true,
    maxOutputTokens: 6000,
  });
  const firstResult = tryParse(first.text);
  if (firstResult.ok) return firstResult.value;

  // Retry once with a repair prompt
  const repairPrompt = buildPlannerRepairPrompt(
    prompt,
    first.text,
    firstResult.error,
  );
  const second = await runLLM({
    prompt: repairPrompt,
    expectJson: true,
    maxOutputTokens: 6000,
  });
  const secondResult = tryParse(second.text);
  if (secondResult.ok) return secondResult.value;

  throw new Error(
    `Planner returned invalid JSON after repair attempt. Last error: ${secondResult.error}`,
  );
}

function tryParse(
  text: string,
):
  | { ok: true; value: PlannerLLMResultParsed }
  | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(extractJsonBlob(text));
  } catch (err) {
    return {
      ok: false,
      error: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const parsed = plannerLLMResultSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.toString().slice(0, 800) };
  }
  return { ok: true, value: parsed.data };
}

function shortenCapabilities(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.length > 240 ? `${input.slice(0, 237)}…` : input;
}

function extractTemplateId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const tid = (metadata as Record<string, unknown>).templateId;
  return typeof tid === "string" ? tid : null;
}

function matchAgent(
  hint: string,
  agentRows: Array<{ id: string; name: string; role: string; title: string | null }>,
): string | null {
  const lower = hint.toLowerCase();

  // Exact id match
  const byId = agentRows.find((a) => a.id === hint);
  if (byId) return byId.id;

  // Role match (e.g. "ceo", "manager", "specialist")
  const byRole = agentRows.find((a) => a.role.toLowerCase() === lower);
  if (byRole) return byRole.id;

  // Role + ":" + title hint (e.g. "specialist:research")
  const colonIdx = lower.indexOf(":");
  if (colonIdx !== -1) {
    const role = lower.slice(0, colonIdx);
    const titleHint = lower.slice(colonIdx + 1).trim();
    const byRoleTitle = agentRows.find(
      (a) =>
        a.role.toLowerCase() === role &&
        (a.title ?? "").toLowerCase().includes(titleHint),
    );
    if (byRoleTitle) return byRoleTitle.id;
  }

  // Loose name match
  const byName = agentRows.find((a) =>
    a.name.toLowerCase().includes(lower),
  );
  if (byName) return byName.id;

  return null;
}
