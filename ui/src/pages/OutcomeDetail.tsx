/**
 * OutcomeDetail — mission-control view for one outcome.
 *
 * Shows brief, status, the active plan with steps + assignments, the
 * timeline of events, cost so far, the final deliverable when ready.
 *
 * v1 actions:
 *   - "Generate plan" (when no plan or status awaiting_clarification)
 *   - "Approve plan" (when plan is draft)
 *   - "Cancel outcome" (anytime before delivered)
 *
 * Reviewer + Assembler surfaces (revision history, source-by-source
 * provenance under the final markdown) come in next session.
 */
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "@/lib/router";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Clock,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  OutcomeDetail as OutcomeDetailType,
  OutcomePriority,
  OutcomeRiskLevel,
  OutcomeStatus,
  OrchestraPlanStep,
  OrchestraPlanStepStatus,
} from "@orqestra/shared";
import { orchestraApi } from "../api/orchestra";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { SoftCard } from "../components/SoftCard";
import { friendlyCost, relativeTime, cn } from "@/lib/utils";

const STATUS_LABEL: Record<OutcomeStatus, string> = {
  draft: "Draft",
  planning: "Planning the work",
  awaiting_clarification: "Waiting for your input",
  ready_to_execute: "Plan ready to approve",
  executing: "Work in progress",
  reviewing: "Reviewing quality",
  refining: "Refining output",
  assembling: "Assembling final deliverable",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STEP_STATUS_LABEL: Record<OrchestraPlanStepStatus, string> = {
  pending: "Waiting on dependencies",
  ready: "Ready",
  assigned: "Assigned",
  running: "In progress",
  blocked: "Blocked",
  completed: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

const STEP_STATUS_TONE: Record<OrchestraPlanStepStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  ready: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  assigned: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  running: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  blocked: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  skipped: "bg-muted text-muted-foreground",
};

export function OutcomeDetail() {
  const { outcomeId } = useParams<{ outcomeId: string }>();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: queryKeys.outcomes.detail(outcomeId ?? "_"),
    queryFn: () => orchestraApi.get(outcomeId!),
    enabled: !!outcomeId,
    refetchInterval: 8000, // Poll while work is in flight.
  });

  const eventsQuery = useQuery({
    queryKey: queryKeys.outcomes.events(outcomeId ?? "_"),
    queryFn: () => orchestraApi.events(outcomeId!),
    enabled: !!outcomeId,
    refetchInterval: 8000,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Outcomes", href: `/outcomes` },
      { label: detailQuery.data?.title ?? "Outcome" },
    ]);
  }, [setBreadcrumbs, detailQuery.data?.title]);

  const planMutation = useMutation({
    mutationFn: () => orchestraApi.generatePlan(outcomeId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.outcomes.detail(outcomeId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.outcomes.events(outcomeId!),
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (planId: string) =>
      orchestraApi.approvePlan(outcomeId!, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.outcomes.detail(outcomeId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.outcomes.events(outcomeId!),
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => orchestraApi.cancel(outcomeId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.outcomes.detail(outcomeId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.outcomes.list("_"),
      });
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="px-4 max-w-5xl mx-auto">
        <PageSkeleton />
      </div>
    );
  }
  if (!detailQuery.data) {
    return (
      <div className="px-4">
        <EmptyState
          icon={AlertCircle}
          message="Outcome not found"
          action="Back to Outcomes"
          onAction={() => navigate(`/outcomes`)}
        />
      </div>
    );
  }
  const outcome = detailQuery.data;

  const canPlan =
    outcome.status === "draft" ||
    outcome.status === "awaiting_clarification" ||
    outcome.status === "planning";
  const canApprove =
    outcome.plan?.status === "draft" && outcome.status === "ready_to_execute";
  const canCancel =
    outcome.status !== "delivered" &&
    outcome.status !== "failed" &&
    outcome.status !== "cancelled";

  return (
    <div className="px-4 pb-24 max-w-5xl mx-auto space-y-6">
      <Link
        to={`/outcomes`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Outcomes
      </Link>

      <PageHeader
        title={outcome.title}
        subtitle={STATUS_LABEL[outcome.status]}
        actions={
          <div className="flex items-center gap-2">
            {canPlan ? (
              <Button
                onClick={() => planMutation.mutate()}
                disabled={planMutation.isPending}
                className="gap-1.5 rounded-2xl"
              >
                {planMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {planMutation.isPending ? "Planning…" : "Generate plan"}
              </Button>
            ) : null}
            {canApprove ? (
              <Button
                onClick={() => approveMutation.mutate(outcome.plan!.id)}
                disabled={approveMutation.isPending}
                className="gap-1.5 rounded-2xl"
              >
                {approveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {approveMutation.isPending
                  ? "Starting…"
                  : "Approve & start work"}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="outline"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="gap-1.5 rounded-2xl"
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </Button>
            ) : null}
          </div>
        }
      />

      {planMutation.error ? (
        <ErrorBanner error={planMutation.error} />
      ) : null}
      {approveMutation.error ? (
        <ErrorBanner error={approveMutation.error} />
      ) : null}

      <BriefSection outcome={outcome} />

      {outcome.plan?.requiredInputs?.length ? (
        <ClarificationSection requiredInputs={outcome.plan.requiredInputs} />
      ) : null}

      {outcome.finalAssembly?.status === "completed" &&
      outcome.finalAssembly.finalMarkdown ? (
        <FinalDeliverableSection
          markdown={outcome.finalAssembly.finalMarkdown}
          executiveSummary={outcome.finalAssembly.finalSummary}
          unresolvedLimitations={outcome.finalAssembly.unresolvedLimitations}
          recommendedNextActions={outcome.finalAssembly.recommendedNextActions}
        />
      ) : null}

      <PlanSection outcome={outcome} />

      <Timeline events={eventsQuery.data ?? []} />

      <CostStrip
        costSoFarCents={outcome.costSoFarCents}
        budgetLimitCents={outcome.budgetLimitCents}
        priority={outcome.priority}
        riskLevel={outcome.riskLevel}
      />
    </div>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/50 p-3 text-sm text-rose-800 dark:text-rose-300">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

function FinalDeliverableSection({
  markdown,
  executiveSummary,
  unresolvedLimitations,
  recommendedNextActions,
}: {
  markdown: string;
  executiveSummary: string | null;
  unresolvedLimitations: string[];
  recommendedNextActions: string[];
}) {
  return (
    <SoftCard className="p-5 space-y-4 border-emerald-300/60 bg-emerald-50/30 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-700" />
        <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
          Final deliverable
        </h2>
      </div>
      {executiveSummary ? (
        <div className="rounded-lg bg-white/60 dark:bg-background/40 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Executive summary
          </p>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">
            {executiveSummary}
          </p>
        </div>
      ) : null}
      <div className="rounded-lg bg-white/60 dark:bg-background/40 p-4 max-h-[60vh] overflow-y-auto">
        <pre className="text-sm whitespace-pre-wrap font-sans text-foreground leading-relaxed">
          {markdown}
        </pre>
      </div>
      {recommendedNextActions.length ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Recommended next actions
          </p>
          <ul className="text-sm text-foreground/80 space-y-1">
            {recommendedNextActions.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {unresolvedLimitations.length ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Unresolved limitations
          </p>
          <ul className="text-sm text-foreground/70 space-y-1">
            {unresolvedLimitations.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </SoftCard>
  );
}

function BriefSection({ outcome }: { outcome: OutcomeDetailType }) {
  return (
    <SoftCard className="p-5 space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Brief</h2>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
        {outcome.brief}
      </p>
    </SoftCard>
  );
}

function ClarificationSection({
  requiredInputs,
}: {
  requiredInputs: Array<{ field: string; question: string; required: boolean }>;
}) {
  return (
    <SoftCard className="p-5 space-y-3 border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-700" />
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Orqestra needs clarification
        </h2>
      </div>
      <ul className="space-y-1.5 text-sm text-amber-900 dark:text-amber-200">
        {requiredInputs.map((q, i) => (
          <li key={i}>
            <span className="font-medium">{q.field}:</span> {q.question}
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
        Update the brief above and re-generate the plan to continue.
      </p>
    </SoftCard>
  );
}

function PlanSection({ outcome }: { outcome: OutcomeDetailType }) {
  if (!outcome.plan) {
    return (
      <SoftCard className="p-5">
        <p className="text-sm text-muted-foreground">
          No plan yet. Click <span className="font-medium">Generate plan</span> above
          and Orqestra will draft how to deliver this outcome.
        </p>
      </SoftCard>
    );
  }

  const { plan, steps } = outcome;

  return (
    <SoftCard className="p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Plan v{plan.version}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{plan.summary}</p>
        </div>
        <PlanMeta plan={plan} />
      </div>

      {plan.assumptions.length ? (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Assumptions
          </h3>
          <ul className="text-sm text-foreground/80 space-y-1">
            {plan.assumptions.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Steps
        </h3>
        <ol className="space-y-2">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ol>
      </div>
    </SoftCard>
  );
}

function PlanMeta({
  plan,
}: {
  plan: NonNullable<OutcomeDetailType["plan"]>;
}) {
  const conf =
    plan.confidenceScore != null
      ? `${Math.round(plan.confidenceScore * 100)}%`
      : "—";
  return (
    <div className="text-right text-xs text-muted-foreground space-y-0.5 shrink-0">
      <div>
        Est. cost:{" "}
        {plan.estimatedCostCents != null
          ? friendlyCost(plan.estimatedCostCents / 100)
          : "—"}
      </div>
      <div>
        Est. time:{" "}
        {plan.estimatedDurationMinutes != null
          ? `${plan.estimatedDurationMinutes} min`
          : "—"}
      </div>
      <div>Confidence: {conf}</div>
    </div>
  );
}

function StepRow({ step }: { step: OrchestraPlanStep }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-3">
      <div className="text-xs font-mono text-muted-foreground w-6 shrink-0 pt-0.5">
        {step.ordinal + 1}.
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="text-sm font-medium text-foreground">{step.title}</h4>
          <span
            className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide",
              STEP_STATUS_TONE[step.status],
            )}
          >
            {STEP_STATUS_LABEL[step.status]}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {step.stepType}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {step.description}
        </p>
      </div>
    </li>
  );
}

function Timeline({
  events,
}: {
  events: Array<{
    id: string;
    kind: string;
    summary: string;
    occurredAt: string;
  }>;
}) {
  if (events.length === 0) return null;
  return (
    <SoftCard className="p-5 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Timeline</h2>
      <ol className="space-y-2 text-sm">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-2">
            <CircleDot className="h-3.5 w-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground/90">{e.summary}</p>
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {relativeTime(new Date(e.occurredAt))}
                <span>· {e.kind}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </SoftCard>
  );
}

function CostStrip({
  costSoFarCents,
  budgetLimitCents,
  priority,
  riskLevel,
}: {
  costSoFarCents: number;
  budgetLimitCents: number | null;
  priority: OutcomePriority;
  riskLevel: OutcomeRiskLevel | null;
}) {
  return (
    <SoftCard className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
      <Cell label="Spent so far" value={friendlyCost(costSoFarCents / 100)} />
      <Cell
        label="Budget"
        value={
          budgetLimitCents != null
            ? friendlyCost(budgetLimitCents / 100)
            : "Inherit company default"
        }
      />
      <Cell label="Priority" value={priority} />
      <Cell label="Risk" value={riskLevel ?? "—"} />
    </SoftCard>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground mt-0.5 capitalize">
        {value}
      </div>
    </div>
  );
}
