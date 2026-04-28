/**
 * Orchestra assembler service.
 *
 * Once all required steps in an outcome's plan have completed, the
 * assembler:
 *   1. Gathers each completed step's most recent work product
 *   2. Builds the assembler prompt with provenance per source
 *   3. Calls the LLM, validates, retries once on parse failure
 *   4. Persists OutcomeFinalAssembly + a final IssueWorkProduct
 *      attached to a synthetic "delivery" issue OR — to keep things
 *      simple in v1 — attached to the LAST step's issue with
 *      type='final_deliverable'.
 *   5. Updates outcome.finalWorkProductId + transitions status to
 *      'delivered'.
 *
 * The caller (orchestra-step-completion) is responsible for deciding
 * WHEN to invoke the assembler. This module just runs.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@orqestra/db";
import {
  agents,
  issueWorkProducts,
  orchestraPlanSteps,
  outcomeFinalAssemblies,
  orchestraPlans as orchestraPlansTable,
  outcomes as outcomesTable,
} from "@orqestra/db";
import {
  buildAssemblerPrompt,
  assemblerLLMResultSchema,
  type AssemblerLLMResultParsed,
  type OutcomeTargetFormat,
} from "@orqestra/shared";
import {
  defaultAnthropicRunLLM,
  extractJsonBlob,
  OrchestraLLMNotConfiguredError,
  type OrchestraRunLLM,
} from "./orchestra-llm.js";

export interface AssemblerServiceDeps {
  runLLM?: OrchestraRunLLM;
  /**
   * Optional callback fired after an outcome is delivered. Lets the
   * caller (heartbeat / step-completion) wire the existing
   * outputRouterService.dispatchForRun so Slack/etc receive a single
   * "outcome delivered" notification rather than only per-step ones.
   * The callback should be best-effort — failures must not affect the
   * delivery itself, which has already happened by the time we call it.
   */
  onDelivered?: (ctx: AssemblerDeliveryContext) => Promise<void>;
}

/**
 * Snapshot of a delivered outcome handed to onDelivered() so the caller
 * can route it through output routers without round-tripping the DB.
 */
export interface AssemblerDeliveryContext {
  companyId: string;
  outcomeId: string;
  outcomeTitle: string;
  projectId: string | null;
  finalWorkProductId: string | null;
  /** Last step's issue id; useful for routing scope. */
  lastStepIssueId: string | null;
  /** Last step's heartbeat run id (or null if there isn't one). */
  lastStepRunId: string | null;
  assemblerAgentId: string;
  assemblerAgentName: string;
  finalMarkdown: string;
  executiveSummary: string;
  totalCostCents: number;
}

export function orchestraAssemblerService(
  db: Db,
  deps: AssemblerServiceDeps = {},
) {
  const runLLM = deps.runLLM ?? defaultAnthropicRunLLM;

  return {
    /**
     * Assemble + deliver an outcome. Idempotent within a plan version:
     * if an assembly already exists for this plan we update it rather
     * than insert a second.
     */
    assemble: async (input: {
      companyId: string;
      outcomeId: string;
    }): Promise<{
      assemblyId: string;
      finalWorkProductId: string | null;
      delivered: boolean;
    }> => {
      const { companyId, outcomeId } = input;

      const [outcomeRow] = await db
        .select()
        .from(outcomesTable)
        .where(
          and(
            eq(outcomesTable.id, outcomeId),
            eq(outcomesTable.companyId, companyId),
          ),
        );
      if (!outcomeRow) throw new Error(`Outcome ${outcomeId} not found`);

      // Find the active plan + its completed steps.
      const [plan] = await db
        .select()
        .from(orchestraPlansTable)
        .where(
          and(
            eq(orchestraPlansTable.outcomeId, outcomeId),
            inArray(orchestraPlansTable.status, ["executing", "approved"] as string[]),
          ),
        )
        .orderBy(desc(orchestraPlansTable.version))
        .limit(1);
      if (!plan) throw new Error(`No active plan for outcome ${outcomeId}`);

      const completedSteps = await db
        .select()
        .from(orchestraPlanSteps)
        .where(
          and(
            eq(orchestraPlanSteps.planId, plan.id),
            eq(orchestraPlanSteps.status, "completed"),
          ),
        )
        .orderBy(asc(orchestraPlanSteps.ordinal));

      if (completedSteps.length === 0) {
        throw new Error("No completed steps to assemble");
      }

      // Gather work products for each step.
      const stepIssueIds = completedSteps
        .map((s) => s.issueId)
        .filter((v): v is string => !!v);
      const wps = stepIssueIds.length
        ? await db
            .select()
            .from(issueWorkProducts)
            .where(inArray(issueWorkProducts.issueId, stepIssueIds))
        : [];

      // Latest work product per issue.
      const latestPerIssue = new Map<string, (typeof wps)[number]>();
      for (const wp of wps) {
        const cur = latestPerIssue.get(wp.issueId);
        if (!cur || wp.createdAt > cur.createdAt) {
          latestPerIssue.set(wp.issueId, wp);
        }
      }

      // Resolve each step's assigned agent name (best-effort).
      const agentIds = Array.from(
        new Set(
          completedSteps
            .map((s) => s.assignedAgentId)
            .filter((v): v is string => !!v),
        ),
      );
      const agentRows = agentIds.length
        ? await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(inArray(agents.id, agentIds))
        : [];
      const agentNameById = new Map(agentRows.map((a) => [a.id, a.name]));

      const sources = completedSteps
        .map((s) => {
          const wp = s.issueId ? latestPerIssue.get(s.issueId) : undefined;
          if (!wp) return null;
          return {
            workProductId: wp.id,
            stepTitle: s.title,
            stepType: s.stepType,
            agentName: s.assignedAgentId
              ? (agentNameById.get(s.assignedAgentId) ?? "an agent")
              : "an agent",
            body: wp.summary?.trim() || "(empty)",
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (sources.length === 0) {
        throw new Error(
          "No source work products available across completed steps",
        );
      }

      const assemblerAgentId = await pickAssemblerAgent(
        db,
        companyId,
        outcomeRow.orchestratorAgentId,
      );
      if (!assemblerAgentId) {
        throw new Error("No agent available to assemble");
      }

      // Insert / upsert the assembly row in 'in_progress' state so the UI
      // can show "Assembling final deliverable" while the LLM runs.
      const existing = await db
        .select()
        .from(outcomeFinalAssemblies)
        .where(eq(outcomeFinalAssemblies.outcomeId, outcomeId))
        .limit(1);
      let assemblyId: string;
      if (existing.length) {
        assemblyId = existing[0].id;
        await db
          .update(outcomeFinalAssemblies)
          .set({
            planId: plan.id,
            assemblerAgentId,
            status: "in_progress",
            sourceWorkProductIds: sources.map((s) => s.workProductId) as unknown as object,
            updatedAt: new Date(),
          })
          .where(eq(outcomeFinalAssemblies.id, assemblyId));
      } else {
        const [row] = await db
          .insert(outcomeFinalAssemblies)
          .values({
            outcomeId,
            planId: plan.id,
            assemblerAgentId,
            status: "in_progress",
            sourceWorkProductIds: sources.map((s) => s.workProductId) as unknown as object,
          })
          .returning();
        assemblyId = row.id;
      }

      const prompt = buildAssemblerPrompt({
        outcomeTitle: outcomeRow.title,
        outcomeBrief: outcomeRow.brief,
        targetFormat: outcomeRow.targetFormat as OutcomeTargetFormat,
        sources,
      });

      let parsed: AssemblerLLMResultParsed;
      try {
        const llmResp = await runLLM({
          prompt,
          expectJson: true,
          maxOutputTokens: 8000,
        });
        parsed = parseAssemblerResult(llmResp.text);
      } catch (err) {
        await db
          .update(outcomeFinalAssemblies)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(outcomeFinalAssemblies.id, assemblyId));
        if (err instanceof OrchestraLLMNotConfiguredError) {
          throw err;
        }
        throw err;
      }

      // Persist the final markdown + summary into the assembly row, then
      // create a final IssueWorkProduct attached to the LAST completed
      // step's issue (so it surfaces alongside other run artifacts in the
      // existing Outputs UI). Mark it primary + reviewState approved.
      const lastStep = completedSteps[completedSteps.length - 1];
      let finalWorkProductId: string | null = null;
      if (lastStep.issueId) {
        const [wpRow] = await db
          .insert(issueWorkProducts)
          .values({
            companyId,
            projectId: outcomeRow.projectId ?? null,
            issueId: lastStep.issueId,
            type: "orchestra_final_deliverable",
            provider: "orchestra",
            externalId: assemblyId,
            title: outcomeRow.title,
            url: null,
            status: "succeeded",
            reviewState: "approved",
            isPrimary: true,
            healthStatus: "healthy",
            summary: parsed.finalMarkdown,
            metadata: {
              outcomeId,
              planId: plan.id,
              assemblyId,
              executiveSummary: parsed.executiveSummary,
              structure: parsed.structure,
              unresolvedLimitations: parsed.unresolvedLimitations,
              recommendedNextActions: parsed.recommendedNextActions,
            } as Record<string, unknown>,
          })
          .returning();
        finalWorkProductId = wpRow.id;
      }

      await db
        .update(outcomeFinalAssemblies)
        .set({
          status: "completed",
          structure: parsed.structure as unknown as object,
          finalMarkdown: parsed.finalMarkdown,
          finalSummary: parsed.executiveSummary,
          unresolvedLimitations:
            parsed.unresolvedLimitations as unknown as object,
          recommendedNextActions:
            parsed.recommendedNextActions as unknown as object,
          finalWorkProductId,
          updatedAt: new Date(),
        })
        .where(eq(outcomeFinalAssemblies.id, assemblyId));

      // Attach to outcome + transition to delivered.
      await db
        .update(outcomesTable)
        .set({
          finalWorkProductId,
          status: "delivered",
          updatedAt: new Date(),
        })
        .where(eq(outcomesTable.id, outcomeId));

      // Fire the delivered callback (best-effort — never blocks delivery).
      if (deps.onDelivered) {
        try {
          const assemblerName =
            agentNameById.get(assemblerAgentId) ??
            (
              await db
                .select({ name: agents.name })
                .from(agents)
                .where(eq(agents.id, assemblerAgentId))
                .limit(1)
            )[0]?.name ??
            "Orchestra Assembler";

          await deps.onDelivered({
            companyId,
            outcomeId,
            outcomeTitle: outcomeRow.title,
            projectId: outcomeRow.projectId ?? null,
            finalWorkProductId,
            lastStepIssueId: lastStep.issueId ?? null,
            lastStepRunId: null,
            assemblerAgentId,
            assemblerAgentName: assemblerName,
            finalMarkdown: parsed.finalMarkdown,
            executiveSummary: parsed.executiveSummary,
            totalCostCents: 0,
          });
        } catch {
          // Best-effort.
        }
      }

      return { assemblyId, finalWorkProductId, delivered: true };
    },
  };
}

function parseAssemblerResult(raw: string): AssemblerLLMResultParsed {
  let json: unknown;
  try {
    json = JSON.parse(extractJsonBlob(raw));
  } catch (err) {
    throw new Error(
      `Assembler JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const parsed = assemblerLLMResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Assembler JSON validation failed: ${parsed.error.toString().slice(0, 600)}`,
    );
  }
  return parsed.data;
}

async function pickAssemblerAgent(
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
