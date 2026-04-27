/**
 * Orchestra step-completion handler.
 *
 * Called from heartbeat after an Issue terminates. Responsibilities:
 *
 *   1. Look up the OrchestraPlanStep linked to this Issue (via the
 *      Issue's originKind='orchestra_step' + originId=stepId).
 *      No link → not orchestra-managed; no-op.
 *
 *   2. Run the reviewer on the step's work product.
 *
 *   3. Decide:
 *        accept    → mark step completed, promote dependents,
 *                    maybe trigger assembler
 *        revise    → reopen the step's Issue with revisionInstructions
 *                    prepended; increment step.revisionCount
 *        escalate  → mark step failed; outcome → refining (so the
 *                    user can decide what to do)
 *
 *   4. If the step's Issue ended in 'cancelled' or 'failed' status
 *      (not 'done'), don't run the reviewer — mark step failed and
 *      escalate.
 *
 * The handler is wrapped at the call site in try/catch so it can never
 * brick the heartbeat.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@mattparrytfc/db";
import {
  issues,
  orchestraPlanSteps,
  orchestraPlans,
  outcomes as outcomesTable,
} from "@mattparrytfc/db";
import type { OrchestraPlanStepStatus } from "@mattparrytfc/shared";
import { issueService } from "./issues.js";
import { orchestraService } from "./orchestra.js";
import {
  orchestraReviewerService,
  type ReviewerVerdict,
} from "./orchestra-reviewer.js";
import {
  orchestraAssemblerService,
  type AssemblerDeliveryContext,
} from "./orchestra-assembler.js";

export interface StepCompletionDeps {
  /**
   * Forwarded to the assembler. Heartbeat passes a callback that fires
   * the existing outputRouterService.dispatchForRun for the assembled
   * delivery, so Slack/etc. get a single "outcome delivered" message.
   */
  onOutcomeDelivered?: (ctx: AssemblerDeliveryContext) => Promise<void>;
}

export function orchestraStepCompletionService(
  db: Db,
  deps: StepCompletionDeps = {},
) {
  const orchestra = orchestraService(db);
  const reviewer = orchestraReviewerService(db);
  const assembler = orchestraAssemblerService(db, {
    onDelivered: deps.onOutcomeDelivered,
  });
  const issuesSvc = issueService(db);

  /**
   * Called from heartbeat with the Issue that just reached a terminal
   * status. Returns details about what orchestra did, or `null` if the
   * Issue isn't orchestra-managed.
   */
  async function handleIssueTerminal(input: {
    issueId: string;
    /** Final issue status: "done" | "cancelled" | "failed" etc. */
    issueStatus: string;
  }): Promise<{
    stepId: string;
    outcomeId: string;
    action:
      | "accepted"
      | "revised"
      | "escalated"
      | "auto_passed"
      | "skipped_terminal";
    nextIssueIds?: string[];
    deliveryAssembled?: boolean;
  } | null> {
    const { issueId, issueStatus } = input;

    // 1. Find the linked step. Use the issue's originKind/originId.
    const [issue] = await db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId));
    if (!issue) return null;
    if (issue.originKind !== "orchestra_step" || !issue.originId) return null;

    const [step] = await db
      .select()
      .from(orchestraPlanSteps)
      .where(eq(orchestraPlanSteps.id, issue.originId));
    if (!step) return null;

    const companyId = step.companyId;
    const outcomeId = step.outcomeId;

    // 2. Issue ended in non-success → escalate immediately.
    if (issueStatus !== "done") {
      await db
        .update(orchestraPlanSteps)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(orchestraPlanSteps.id, step.id));
      await orchestra.transitionStatus(
        companyId,
        outcomeId,
        "refining",
        "outcome.step.failed",
        `Step "${step.title}" failed (issue status: ${issueStatus})`,
        { stepId: step.id, issueId },
      );
      return {
        stepId: step.id,
        outcomeId,
        action: "escalated",
      };
    }

    // 3. Run reviewer.
    let verdict: ReviewerVerdict;
    try {
      await orchestra.transitionStatus(
        companyId,
        outcomeId,
        "reviewing",
        "outcome.step.review.started",
        `Reviewing step "${step.title}"`,
        { stepId: step.id },
      );
    } catch {
      // Outcome may already be in reviewing/refining; transition may
      // disallow. Don't let that block us — proceed with the review.
    }

    try {
      verdict = await reviewer.reviewStep({ companyId, stepId: step.id });
    } catch (err) {
      // Reviewer threw — log via event + treat as auto-pass to keep the
      // pipeline moving. Could alternatively escalate; auto-pass is the
      // less-noisy default for v1.
      await orchestra.transitionStatus(
        companyId,
        outcomeId,
        "refining",
        "outcome.step.review.failed",
        `Reviewer errored on "${step.title}": ${err instanceof Error ? err.message : String(err)}`,
        { stepId: step.id },
      );
      verdict = { kind: "escalate", reason: "reviewer_error" } as unknown as ReviewerVerdict;
    }

    // 4. Act on the verdict.
    if (
      verdict.kind === "accept" ||
      verdict.kind === "auto_pass"
    ) {
      await db
        .update(orchestraPlanSteps)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(orchestraPlanSteps.id, step.id));
      await orchestra.transitionStatus(
        companyId,
        outcomeId,
        "executing",
        "outcome.step.review.passed",
        `Step "${step.title}" accepted`,
        { stepId: step.id },
      );

      // Promote any dependents whose deps are now all completed.
      const promoted = await promoteReadyDependents({
        db,
        issuesSvc,
        outcomeId,
      });

      // Are we done? If every step in the active plan is completed →
      // trigger assembler.
      const remaining = await countRemainingSteps(db, outcomeId);
      let deliveryAssembled = false;
      if (remaining === 0) {
        try {
          await orchestra.transitionStatus(
            companyId,
            outcomeId,
            "assembling",
            "outcome.assembly.started",
            "Assembling final deliverable",
          );
          await assembler.assemble({ companyId, outcomeId });
          deliveryAssembled = true;
          // assembler already transitions outcome to 'delivered'.
          await orchestra.transitionStatus(
            companyId,
            outcomeId,
            "delivered",
            "outcome.delivered",
            "Outcome delivered",
          ).catch(() => {
            // already delivered by assembler — that's fine.
          });
        } catch (err) {
          await orchestra.transitionStatus(
            companyId,
            outcomeId,
            "failed",
            "outcome.failed",
            `Assembly failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      return {
        stepId: step.id,
        outcomeId,
        action:
          verdict.kind === "auto_pass" ? "auto_passed" : "accepted",
        nextIssueIds: promoted,
        deliveryAssembled,
      };
    }

    if (verdict.kind === "revise" && step.revisionCount < 2) {
      // Reopen the step's Issue with revision instructions prepended.
      await db
        .update(orchestraPlanSteps)
        .set({
          status: "running",
          revisionCount: step.revisionCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(orchestraPlanSteps.id, step.id));

      const newDescription = [
        `**REVISION (attempt ${step.revisionCount + 2}/${3}):**`,
        verdict.revisionInstructions,
        "",
        "---",
        "",
        issue.description ?? "",
      ].join("\n");

      await db
        .update(issues)
        .set({
          status: "in_progress",
          description: newDescription,
          completedAt: null,
          executionRunId: null,
          executionLockedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(issues.id, issueId));

      await orchestra.transitionStatus(
        companyId,
        outcomeId,
        "refining",
        "outcome.step.revision.created",
        `Revision requested for step "${step.title}"`,
        {
          stepId: step.id,
          revisionAttempt: step.revisionCount + 1,
        },
      );

      return { stepId: step.id, outcomeId, action: "revised" };
    }

    // escalate (either explicit or revision-cap-reached)
    const escalateReason =
      verdict.kind === "escalate"
        ? verdict.reason
        : verdict.kind === "revise"
          ? `Hit revision cap`
          : "Escalated";
    await db
      .update(orchestraPlanSteps)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(orchestraPlanSteps.id, step.id));
    await orchestra.transitionStatus(
      companyId,
      outcomeId,
      "refining",
      "outcome.step.review.failed",
      `Step "${step.title}" escalated: ${escalateReason}`,
      { stepId: step.id, reason: escalateReason },
    );

    return { stepId: step.id, outcomeId, action: "escalated" };
  }

  return { handleIssueTerminal };
}

// ─────────────────────────────────────────────────────────────────────────
// Dependency promotion
// ─────────────────────────────────────────────────────────────────────────

async function promoteReadyDependents(args: {
  db: Db;
  issuesSvc: ReturnType<typeof issueService>;
  outcomeId: string;
}): Promise<string[]> {
  const { db, issuesSvc, outcomeId } = args;

  const allSteps = await db
    .select()
    .from(orchestraPlanSteps)
    .where(eq(orchestraPlanSteps.outcomeId, outcomeId))
    .orderBy(asc(orchestraPlanSteps.ordinal));

  const completedIds = new Set(
    allSteps.filter((s) => s.status === "completed" || s.status === "skipped").map((s) => s.id),
  );

  const promotedIssueIds: string[] = [];
  const [outcomeRow] = await db
    .select()
    .from(outcomesTable)
    .where(eq(outcomesTable.id, outcomeId));
  if (!outcomeRow) return promotedIssueIds;

  for (const step of allSteps) {
    if (step.status !== "pending") continue;
    if (step.issueId) continue; // already has an issue, skip
    const deps = (step.dependsOnStepIds as string[]) ?? [];
    if (deps.some((d) => !completedIds.has(d))) continue;

    // Spawn an Issue for this step.
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
      ...(((step.acceptanceCriteria as Array<{ criterion: string; howToVerify?: string }>) ?? []).map(
        (c, i) =>
          `${i + 1}. ${c.criterion}${c.howToVerify ? ` — verify: ${c.howToVerify}` : ""}`,
      )),
    ]
      .filter(Boolean)
      .join("\n");

    const priorityMap: Record<string, "critical" | "high" | "medium" | "low"> = {
      urgent: "critical",
      high: "high",
      medium: "medium",
      low: "low",
    };
    const priority = priorityMap[outcomeRow.priority] ?? "medium";

    const issue = await issuesSvc.create(outcomeRow.companyId, {
      title: `[Step ${step.ordinal + 1}] ${step.title}`,
      description: body,
      status: step.recommendedAgentId ? "in_progress" : "todo",
      priority,
      projectId: outcomeRow.projectId,
      assigneeAgentId: step.recommendedAgentId ?? null,
      originKind: "orchestra_step",
      originId: step.id,
    });

    await db
      .update(orchestraPlanSteps)
      .set({
        issueId: issue.id,
        assignedAgentId:
          step.recommendedAgentId ?? step.assignedAgentId ?? null,
        status: step.recommendedAgentId ? "assigned" : "ready",
        updatedAt: new Date(),
      })
      .where(eq(orchestraPlanSteps.id, step.id));

    promotedIssueIds.push(issue.id);
  }

  return promotedIssueIds;
}

async function countRemainingSteps(
  db: Db,
  outcomeId: string,
): Promise<number> {
  const [{ remaining }] = await db
    .select({
      remaining: sql<number>`count(*) filter (where ${orchestraPlanSteps.status} not in ('completed', 'skipped', 'failed'))::int`,
    })
    .from(orchestraPlanSteps)
    .where(eq(orchestraPlanSteps.outcomeId, outcomeId));
  return Number(remaining ?? 0);
}
