/**
 * Orchestra service — outcome lifecycle, status transitions, cost roll-up.
 *
 * This is the layer that turns a high-level user outcome into executable
 * work. It owns the Outcome / OrchestraPlan / OrchestraPlanStep tables,
 * delegates planning to `orchestra-planner`, and creates Issues that the
 * existing heartbeat will run.
 *
 * Boundaries:
 *   - Does NOT execute work itself — Issues are run by the existing
 *     heartbeat service.
 *   - Does NOT bypass safety: budget, approval and permission checks all
 *     route through their existing services.
 *   - DOES emit activity_log events tagged with the orchestra event types
 *     so the timeline UI can reconstruct what happened.
 *
 * Status transitions (allowed forward moves; cancelled/failed reachable
 * from anywhere):
 *   draft → planning → (awaiting_clarification | ready_to_execute)
 *   ready_to_execute → executing → reviewing → refining? → assembling → delivered
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@mattparrytfc/db";
import {
  agents,
  costEvents,
  issues,
  outcomes,
  orchestraPlans,
  orchestraPlanSteps,
  orchestraReviews,
  outcomeFinalAssemblies,
  activityLog,
} from "@mattparrytfc/db";
import type {
  Outcome,
  OutcomeDetail,
  OutcomeListItem,
  OutcomeStatus,
  OutcomePriority,
  OutcomeRiskLevel,
  OutcomeTargetFormat,
  OutcomeExecutionMode,
  OrchestraPlan,
  OrchestraPlanStatus,
  OrchestraPlanStep,
  OrchestraPlanStepStatus,
  OrchestraPlanStepType,
  OrchestraPlanRiskItem,
  OrchestraPlanRequiredInput,
  OrchestraReview,
  OrchestraReviewStatus,
  OutcomeFinalAssembly,
  OutcomeAssemblyStatus,
  OrchestraStepAcceptanceCriterion,
  OrchestraEventType,
  CreateOutcomeRequest,
} from "@mattparrytfc/shared";
import { unprocessable, notFound } from "../errors.js";
import { issueService } from "./issues.js";

type OutcomeRow = typeof outcomes.$inferSelect;
type PlanRow = typeof orchestraPlans.$inferSelect;
type StepRow = typeof orchestraPlanSteps.$inferSelect;
type ReviewRow = typeof orchestraReviews.$inferSelect;
type AssemblyRow = typeof outcomeFinalAssemblies.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────
// Row → domain mappers
// ─────────────────────────────────────────────────────────────────────────

function toOutcome(row: OutcomeRow): Outcome {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId ?? null,
    createdByUserId: row.createdByUserId ?? null,
    title: row.title,
    brief: row.brief,
    status: row.status as OutcomeStatus,
    priority: row.priority as OutcomePriority,
    riskLevel: (row.riskLevel as OutcomeRiskLevel | null) ?? null,
    budgetLimitCents: row.budgetLimitCents ?? null,
    deadline: row.deadline ?? null,
    targetFormat: row.targetFormat as OutcomeTargetFormat,
    executionMode: row.executionMode as OutcomeExecutionMode,
    orchestratorAgentId: row.orchestratorAgentId ?? null,
    finalWorkProductId: row.finalWorkProductId ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPlan(row: PlanRow): OrchestraPlan {
  return {
    id: row.id,
    outcomeId: row.outcomeId,
    companyId: row.companyId,
    version: row.version,
    status: row.status as OrchestraPlanStatus,
    summary: row.summary,
    assumptions: (row.assumptions as string[]) ?? [],
    risks: (row.risks as OrchestraPlanRiskItem[]) ?? [],
    requiredInputs: (row.requiredInputs as OrchestraPlanRequiredInput[]) ?? [],
    estimatedCostCents: row.estimatedCostCents ?? null,
    estimatedDurationMinutes: row.estimatedDurationMinutes ?? null,
    confidenceScore: row.confidenceScore ?? null,
    createdByAgentId: row.createdByAgentId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toStep(row: StepRow): OrchestraPlanStep {
  return {
    id: row.id,
    planId: row.planId,
    outcomeId: row.outcomeId,
    companyId: row.companyId,
    parentStepId: row.parentStepId ?? null,
    ordinal: row.ordinal,
    title: row.title,
    description: row.description,
    stepType: row.stepType as OrchestraPlanStepType,
    status: row.status as OrchestraPlanStepStatus,
    recommendedAgentId: row.recommendedAgentId ?? null,
    assignedAgentId: row.assignedAgentId ?? null,
    issueId: row.issueId ?? null,
    dependsOnStepIds: (row.dependsOnStepIds as string[]) ?? [],
    acceptanceCriteria:
      (row.acceptanceCriteria as OrchestraStepAcceptanceCriterion[]) ?? [],
    reviewCriteria: (row.reviewCriteria as string[]) ?? [],
    outputRequirement: row.outputRequirement ?? null,
    revisionCount: row.revisionCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toReview(row: ReviewRow): OrchestraReview {
  return {
    id: row.id,
    outcomeId: row.outcomeId,
    planId: row.planId,
    stepId: row.stepId ?? null,
    reviewedWorkProductId: row.reviewedWorkProductId ?? null,
    reviewerAgentId: row.reviewerAgentId,
    status: row.status as OrchestraReviewStatus,
    score: row.score ?? null,
    comments: row.comments ?? null,
    revisionInstructions: row.revisionInstructions ?? null,
    gaps: (row.gaps as string[]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAssembly(row: AssemblyRow): OutcomeFinalAssembly {
  return {
    id: row.id,
    outcomeId: row.outcomeId,
    planId: row.planId,
    assemblerAgentId: row.assemblerAgentId,
    status: row.status as OutcomeAssemblyStatus,
    sourceWorkProductIds: (row.sourceWorkProductIds as string[]) ?? [],
    structure:
      (row.structure as Array<{
        heading: string;
        sourceWorkProductIds: string[];
      }> | null) ?? null,
    finalMarkdown: row.finalMarkdown ?? null,
    finalSummary: row.finalSummary ?? null,
    unresolvedLimitations: (row.unresolvedLimitations as string[]) ?? [],
    recommendedNextActions: (row.recommendedNextActions as string[]) ?? [],
    finalWorkProductId: row.finalWorkProductId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Status transition table
// ─────────────────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<OutcomeStatus, OutcomeStatus[]> = {
  draft: ["planning", "cancelled"],
  planning: ["awaiting_clarification", "ready_to_execute", "failed", "cancelled"],
  awaiting_clarification: ["planning", "ready_to_execute", "cancelled"],
  ready_to_execute: ["executing", "cancelled"],
  executing: ["reviewing", "refining", "failed", "cancelled"],
  reviewing: ["refining", "assembling", "failed", "cancelled"],
  refining: ["executing", "reviewing", "failed", "cancelled"],
  assembling: ["delivered", "failed", "cancelled"],
  delivered: [],
  failed: [],
  cancelled: [],
};

function assertTransitionAllowed(from: OutcomeStatus, to: OutcomeStatus): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw unprocessable(`Cannot transition outcome from ${from} → ${to}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────

export interface OrchestraServiceDeps {
  /**
   * Hook called after we create issues for a plan's executable steps.
   * Lets the caller wake the heartbeat scheduler immediately rather than
   * waiting for the next tick.
   */
  notifyHeartbeat?: (issueIds: string[]) => void;
}

export function orchestraService(db: Db, deps: OrchestraServiceDeps = {}) {
  const issuesSvc = issueService(db);

  async function emitEvent(
    companyId: string,
    outcomeId: string,
    type: OrchestraEventType,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(activityLog).values({
      companyId,
      actorType: "system",
      actorId: "orchestra",
      action: type,
      entityType: "outcome",
      entityId: outcomeId,
      details: { message, ...(data ?? {}), outcomeId } as Record<string, unknown>,
    });
  }

  async function loadOutcomeRow(
    companyId: string,
    outcomeId: string,
  ): Promise<OutcomeRow> {
    const [row] = await db
      .select()
      .from(outcomes)
      .where(and(eq(outcomes.companyId, companyId), eq(outcomes.id, outcomeId)));
    if (!row) throw notFound(`Outcome ${outcomeId} not found`);
    return row;
  }

  async function rollUpCostCents(outcomeId: string): Promise<number> {
    // Sum CostEvent rows tied to issues that are tied to this outcome's steps.
    const [{ total }] = await db
      .select({
        total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
      })
      .from(costEvents)
      .innerJoin(
        orchestraPlanSteps,
        eq(orchestraPlanSteps.issueId, costEvents.issueId),
      )
      .where(eq(orchestraPlanSteps.outcomeId, outcomeId));
    return Number(total ?? 0);
  }

  async function loadDetail(
    companyId: string,
    outcomeId: string,
  ): Promise<OutcomeDetail> {
    const outcomeRow = await loadOutcomeRow(companyId, outcomeId);
    const outcome = toOutcome(outcomeRow);

    const planRows = await db
      .select()
      .from(orchestraPlans)
      .where(eq(orchestraPlans.outcomeId, outcomeId))
      .orderBy(asc(orchestraPlans.version));
    const plans = planRows.map(toPlan);
    const activePlan =
      plans.find((p) => p.status === "executing") ??
      plans.find((p) => p.status === "approved") ??
      plans[plans.length - 1] ??
      null;

    const stepRows = activePlan
      ? await db
          .select()
          .from(orchestraPlanSteps)
          .where(eq(orchestraPlanSteps.planId, activePlan.id))
          .orderBy(asc(orchestraPlanSteps.ordinal))
      : [];
    const steps = stepRows.map(toStep);

    const reviewRows = await db
      .select()
      .from(orchestraReviews)
      .where(eq(orchestraReviews.outcomeId, outcomeId));
    const reviews = reviewRows.map(toReview);

    const [assemblyRow] = await db
      .select()
      .from(outcomeFinalAssemblies)
      .where(eq(outcomeFinalAssemblies.outcomeId, outcomeId));
    const finalAssembly = assemblyRow ? toAssembly(assemblyRow) : null;

    const costSoFarCents = await rollUpCostCents(outcomeId);

    return {
      ...outcome,
      costSoFarCents,
      plan: activePlan,
      steps,
      reviews,
      finalAssembly,
      history: { plans },
    };
  }

  return {
    // ─── CRUD ──────────────────────────────────────────────────────────

    create: async (
      companyId: string,
      input: CreateOutcomeRequest,
      createdByUserId: string | null,
    ): Promise<Outcome> => {
      const [row] = await db
        .insert(outcomes)
        .values({
          companyId,
          projectId: input.projectId ?? null,
          createdByUserId,
          title: input.title,
          brief: input.brief,
          status: "draft",
          priority: input.priority ?? "medium",
          targetFormat: input.targetFormat ?? "report",
          executionMode: input.executionMode ?? "review_plan_first",
          budgetLimitCents: input.budgetLimitCents ?? null,
          deadline: input.deadline ? new Date(input.deadline) : null,
          metadata: input.metadata ?? null,
        })
        .returning();
      const outcome = toOutcome(row);
      await emitEvent(
        companyId,
        outcome.id,
        "outcome.created",
        `Created outcome: ${outcome.title}`,
        { templateId: input.templateId ?? null },
      );
      return outcome;
    },

    list: async (companyId: string): Promise<OutcomeListItem[]> => {
      const rows = await db
        .select()
        .from(outcomes)
        .where(eq(outcomes.companyId, companyId))
        .orderBy(asc(outcomes.createdAt));

      const items: OutcomeListItem[] = [];
      for (const row of rows) {
        const stepRows = await db
          .select({
            status: orchestraPlanSteps.status,
            assignedAgentId: orchestraPlanSteps.assignedAgentId,
          })
          .from(orchestraPlanSteps)
          .where(eq(orchestraPlanSteps.outcomeId, row.id));
        const stepsTotal = stepRows.length;
        const stepsCompleted = stepRows.filter(
          (s) => s.status === "completed" || s.status === "skipped",
        ).length;
        const assignedAgentIds = Array.from(
          new Set(
            stepRows
              .map((s) => s.assignedAgentId)
              .filter((v): v is string => !!v),
          ),
        );
        const costSoFarCents = await rollUpCostCents(row.id);

        items.push({
          id: row.id,
          title: row.title,
          brief: row.brief,
          status: row.status as OutcomeStatus,
          priority: row.priority as OutcomePriority,
          riskLevel: (row.riskLevel as OutcomeRiskLevel | null) ?? null,
          targetFormat: row.targetFormat as OutcomeTargetFormat,
          deadline: row.deadline ?? null,
          budgetLimitCents: row.budgetLimitCents ?? null,
          costSoFarCents,
          stepsCompleted,
          stepsTotal,
          finalWorkProductId: row.finalWorkProductId ?? null,
          assignedAgentIds,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      }
      return items;
    },

    getDetail: loadDetail,

    cancel: async (
      companyId: string,
      outcomeId: string,
      reason?: string,
    ): Promise<Outcome> => {
      const row = await loadOutcomeRow(companyId, outcomeId);
      const current = row.status as OutcomeStatus;
      assertTransitionAllowed(current, "cancelled");
      const [updated] = await db
        .update(outcomes)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(outcomes.id, outcomeId))
        .returning();
      await emitEvent(
        companyId,
        outcomeId,
        "outcome.cancelled",
        reason ?? "Outcome cancelled",
      );
      // TODO Phase 5: cancel any in-flight Issues belonging to this outcome.
      return toOutcome(updated);
    },

    // ─── Status transitions used by planner / executor / reviewer ─────

    transitionStatus: async (
      companyId: string,
      outcomeId: string,
      to: OutcomeStatus,
      eventType: OrchestraEventType,
      message: string,
      data?: Record<string, unknown>,
    ): Promise<Outcome> => {
      const row = await loadOutcomeRow(companyId, outcomeId);
      const from = row.status as OutcomeStatus;
      assertTransitionAllowed(from, to);
      const [updated] = await db
        .update(outcomes)
        .set({ status: to, updatedAt: new Date() })
        .where(eq(outcomes.id, outcomeId))
        .returning();
      await emitEvent(companyId, outcomeId, eventType, message, data);
      return toOutcome(updated);
    },

    // ─── Plan persistence ──────────────────────────────────────────────

    persistPlan: async (input: {
      companyId: string;
      outcomeId: string;
      summary: string;
      assumptions: string[];
      risks: OrchestraPlanRiskItem[];
      requiredInputs: OrchestraPlanRequiredInput[];
      estimatedCostCents: number | null;
      estimatedDurationMinutes: number | null;
      confidenceScore: number | null;
      createdByAgentId: string | null;
      steps: Array<{
        title: string;
        description: string;
        stepType: OrchestraPlanStepType;
        ordinal: number;
        dependsOnStepOrdinals: number[];
        recommendedAgentId: string | null;
        acceptanceCriteria: OrchestraStepAcceptanceCriterion[];
        reviewCriteria: string[];
        outputRequirement: string | null;
      }>;
    }): Promise<{ plan: OrchestraPlan; steps: OrchestraPlanStep[] }> => {
      const {
        companyId,
        outcomeId,
        steps: stepInputs,
        ...planFields
      } = input;

      // Determine next version + supersede prior plans.
      return db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: orchestraPlans.id, version: orchestraPlans.version })
          .from(orchestraPlans)
          .where(eq(orchestraPlans.outcomeId, outcomeId));
        const nextVersion = existing.length
          ? Math.max(...existing.map((e) => e.version)) + 1
          : 1;
        if (existing.length) {
          await tx
            .update(orchestraPlans)
            .set({ status: "superseded", updatedAt: new Date() })
            .where(eq(orchestraPlans.outcomeId, outcomeId));
        }

        const [planRow] = await tx
          .insert(orchestraPlans)
          .values({
            outcomeId,
            companyId,
            version: nextVersion,
            status: "draft",
            summary: planFields.summary,
            assumptions: planFields.assumptions as unknown as object,
            risks: planFields.risks as unknown as object,
            requiredInputs: planFields.requiredInputs as unknown as object,
            estimatedCostCents: planFields.estimatedCostCents,
            estimatedDurationMinutes: planFields.estimatedDurationMinutes,
            confidenceScore: planFields.confidenceScore,
            createdByAgentId: planFields.createdByAgentId,
          })
          .returning();

        // Insert steps with placeholder dependsOnStepIds, then resolve in
        // a second pass once we know the generated UUIDs.
        const stepRowsInserted: StepRow[] = [];
        for (const s of stepInputs) {
          const [row] = await tx
            .insert(orchestraPlanSteps)
            .values({
              planId: planRow.id,
              outcomeId,
              companyId,
              ordinal: s.ordinal,
              title: s.title,
              description: s.description,
              stepType: s.stepType,
              status: "pending",
              recommendedAgentId: s.recommendedAgentId,
              acceptanceCriteria:
                s.acceptanceCriteria as unknown as object,
              reviewCriteria: s.reviewCriteria as unknown as object,
              outputRequirement: s.outputRequirement,
              dependsOnStepIds: [] as unknown as object,
            })
            .returning();
          stepRowsInserted.push(row);
        }

        const ordinalToId = new Map<number, string>(
          stepRowsInserted.map((r) => [r.ordinal, r.id]),
        );
        for (let i = 0; i < stepInputs.length; i++) {
          const s = stepInputs[i];
          const row = stepRowsInserted[i];
          const depIds = s.dependsOnStepOrdinals
            .map((ord) => ordinalToId.get(ord))
            .filter((v): v is string => !!v);
          if (depIds.length) {
            await tx
              .update(orchestraPlanSteps)
              .set({ dependsOnStepIds: depIds as unknown as object })
              .where(eq(orchestraPlanSteps.id, row.id));
            row.dependsOnStepIds = depIds as unknown as object;
          }
        }

        return {
          plan: toPlan(planRow),
          steps: stepRowsInserted.map(toStep),
        };
      });
    },

    // ─── Approve plan + execute (creates Issues) ──────────────────────

    approvePlan: async (input: {
      companyId: string;
      outcomeId: string;
      planId: string;
    }): Promise<{ plan: OrchestraPlan; issueIds: string[] }> => {
      const { companyId, outcomeId, planId } = input;
      const outcomeRow = await loadOutcomeRow(companyId, outcomeId);
      const [planRow] = await db
        .select()
        .from(orchestraPlans)
        .where(
          and(
            eq(orchestraPlans.id, planId),
            eq(orchestraPlans.outcomeId, outcomeId),
          ),
        );
      if (!planRow) throw notFound("Plan not found");
      if (planRow.status !== "draft" && planRow.status !== "approved") {
        throw unprocessable(
          `Cannot approve plan in status ${planRow.status}`,
        );
      }

      const [approvedPlan] = await db
        .update(orchestraPlans)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(orchestraPlans.id, planId))
        .returning();

      await emitEvent(
        companyId,
        outcomeId,
        "outcome.plan.approved",
        `Plan v${planRow.version} approved`,
      );

      // Move outcome from planning/awaiting_clarification → ready_to_execute
      const currentStatus = outcomeRow.status as OutcomeStatus;
      if (currentStatus !== "executing") {
        await db
          .update(outcomes)
          .set({ status: "ready_to_execute", updatedAt: new Date() })
          .where(eq(outcomes.id, outcomeId));
      }

      // Spawn issues for top-level (no-dependency) steps; the rest become
      // ready as their dependencies complete (handled in Phase 5).
      const issueIds: string[] = [];
      const stepRows = await db
        .select()
        .from(orchestraPlanSteps)
        .where(eq(orchestraPlanSteps.planId, planId))
        .orderBy(asc(orchestraPlanSteps.ordinal));

      for (const step of stepRows) {
        const stepDeps = (step.dependsOnStepIds as string[]) ?? [];
        if (stepDeps.length === 0) {
          const issueId = await createIssueForStep({
            db,
            issuesSvc,
            companyId,
            outcomeRow,
            step,
            planVersion: approvedPlan.version,
          });
          await db
            .update(orchestraPlanSteps)
            .set({
              issueId,
              assignedAgentId:
                step.recommendedAgentId ?? step.assignedAgentId ?? null,
              status: step.recommendedAgentId ? "assigned" : "ready",
              updatedAt: new Date(),
            })
            .where(eq(orchestraPlanSteps.id, step.id));
          issueIds.push(issueId);
        } else {
          await db
            .update(orchestraPlanSteps)
            .set({ status: "pending", updatedAt: new Date() })
            .where(eq(orchestraPlanSteps.id, step.id));
        }
      }

      // Mark plan executing + outcome executing
      await db
        .update(orchestraPlans)
        .set({ status: "executing", updatedAt: new Date() })
        .where(eq(orchestraPlans.id, planId));
      await db
        .update(outcomes)
        .set({ status: "executing", updatedAt: new Date() })
        .where(eq(outcomes.id, outcomeId));
      await emitEvent(
        companyId,
        outcomeId,
        "outcome.execution.started",
        `Started execution: ${issueIds.length} initial step(s) assigned`,
        { initialIssueIds: issueIds },
      );

      if (issueIds.length && deps.notifyHeartbeat) {
        try {
          deps.notifyHeartbeat(issueIds);
        } catch {
          // notification is best-effort
        }
      }

      return { plan: toPlan(approvedPlan), issueIds };
    },

    // ─── Helpers exposed for routes ───────────────────────────────────

    listEvents: async (
      companyId: string,
      outcomeId: string,
    ): Promise<
      Array<{
        id: string;
        kind: string;
        summary: string;
        data: Record<string, unknown> | null;
        occurredAt: Date;
      }>
    > => {
      const rows = await db
        .select()
        .from(activityLog)
        .where(
          and(
            eq(activityLog.companyId, companyId),
            eq(activityLog.entityType, "outcome"),
            eq(activityLog.entityId, outcomeId),
          ),
        )
        .orderBy(asc(activityLog.createdAt));
      return rows.map((r) => {
        const details = (r.details as Record<string, unknown> | null) ?? null;
        const summary =
          (details && typeof details.message === "string" && details.message) ||
          r.action;
        return {
          id: r.id,
          kind: r.action,
          summary,
          data: details,
          occurredAt: r.createdAt,
        };
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Issue creation helper
// ─────────────────────────────────────────────────────────────────────────

async function createIssueForStep(args: {
  db: Db;
  issuesSvc: ReturnType<typeof issueService>;
  companyId: string;
  outcomeRow: OutcomeRow;
  step: StepRow;
  planVersion: number;
}): Promise<string> {
  const { issuesSvc, companyId, outcomeRow, step, planVersion } = args;
  // Build a body that gives the executing agent the full context.
  const body = [
    `**Outcome:** ${outcomeRow.title}`,
    "",
    `**Brief:**`,
    outcomeRow.brief,
    "",
    `**This step:** ${step.title}`,
    "",
    step.description,
    "",
    step.outputRequirement
      ? `**Expected output:** ${step.outputRequirement}`
      : "",
    "",
    "**Acceptance criteria (a reviewer agent will check these):**",
    ...((step.acceptanceCriteria as OrchestraStepAcceptanceCriterion[]) ?? []).map(
      (c, i) =>
        `${i + 1}. ${c.criterion}${c.howToVerify ? ` — verify: ${c.howToVerify}` : ""}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");

  // Outcome priorities: urgent | high | medium | low.
  // Issue priorities: critical | high | medium | low. Map "urgent" → "critical".
  const issuePriority =
    outcomeRow.priority === "urgent"
      ? "critical"
      : (outcomeRow.priority as "high" | "medium" | "low");

  const issue = await issuesSvc.create(companyId, {
    title: `[Step ${step.ordinal + 1}] ${step.title}`,
    description: body,
    status: step.recommendedAgentId ? "in_progress" : "todo",
    priority: issuePriority,
    projectId: outcomeRow.projectId,
    assigneeAgentId: step.recommendedAgentId ?? null,
    originKind: "orchestra_step",
    originId: step.id,
  });
  return issue.id;
}
