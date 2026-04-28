/**
 * OutcomeDetail — mission control for one outcome.
 *
 * Sprint 2 redesign. Sections (top to bottom):
 *   1. Outcome header (title + status + collapsible brief + actions)
 *   2. Execution state (live "right now" summary + progress bar)
 *   3. Plan timeline (steps + agents + status)
 *   4. Agent team (chips of who's on this outcome)
 *   5. Outcome narrative (what's happened)
 *   6. Outcome cost panel (estimated · spent · projected · budget)
 *   7. Decisions waiting on you (pending approvals scoped to outcome)
 *   8. Work products (outputs per step)
 *   9. Final assembly (only when delivered)
 *
 * Acceptance: a non-technical founder can understand the outcome status
 * in under 30 seconds.
 */
import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "@/lib/router";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { orchestraApi } from "@/api/orchestra";
import { agentsApi } from "@/api/agents";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { queryKeys } from "@/lib/queryKeys";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { SoftCard } from "@/components/SoftCard";
import { OutcomeHeader } from "@/components/outcome-detail/OutcomeHeader";
import { ExecutionState } from "@/components/outcome-detail/ExecutionState";
import { PlanTimeline } from "@/components/outcome-detail/PlanTimeline";
import { AgentTeam } from "@/components/outcome-detail/AgentTeam";
import { OutcomeEventTimeline } from "@/components/outcome-detail/OutcomeEventTimeline";
import { OutcomeNarrative } from "@/components/narrative/OutcomeNarrative";
import { OutcomeCostPanel } from "@/components/outcome-detail/OutcomeCostPanel";
import { OutcomeDecisionQueue } from "@/components/outcome-detail/OutcomeDecisionQueue";
import { WorkProducts } from "@/components/outcome-detail/WorkProducts";
import { FinalAssembly } from "@/components/outcome-detail/FinalAssembly";

export function OutcomeDetail() {
  const { outcomeId } = useParams<{ outcomeId: string }>();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: queryKeys.outcomes.detail(outcomeId ?? "_"),
    queryFn: () => orchestraApi.get(outcomeId!),
    enabled: !!outcomeId,
    refetchInterval: 8000,
  });

  const eventsQuery = useQuery({
    queryKey: queryKeys.outcomes.events(outcomeId ?? "_"),
    queryFn: () => orchestraApi.events(outcomeId!),
    enabled: !!outcomeId,
    refetchInterval: 8000,
  });

  const companyId = selectedCompany?.id ?? null;

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId ?? "_"),
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
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
      if (companyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.outcomes.list(companyId),
        });
      }
    },
  });

  const agentNameById = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const a of agentsQuery.data ?? []) out[a.id] = a.name;
    return out;
  }, [agentsQuery.data]);

  if (detailQuery.isLoading) {
    return (
      <div className="px-4 max-w-4xl mx-auto pt-6">
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

  const stepsCompleted = outcome.steps.filter(
    (s) => s.status === "completed",
  ).length;
  const showFinalAssembly =
    outcome.finalAssembly?.status === "completed" &&
    !!outcome.finalAssembly?.finalMarkdown;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-6 space-y-6">
      <Link
        to={`/outcomes`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Outcomes
      </Link>

      <OutcomeHeader
        title={outcome.title}
        brief={outcome.brief}
        status={outcome.status}
        actions={
          <>
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
                variant="sage"
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
                  : "Approve and run"}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="gap-1.5"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </Button>
            ) : null}
          </>
        }
      />

      {planMutation.error ? (
        <ErrorBanner error={planMutation.error} />
      ) : null}
      {approveMutation.error ? (
        <ErrorBanner error={approveMutation.error} />
      ) : null}

      <ExecutionState
        status={outcome.status}
        steps={outcome.steps}
        estimatedDurationMinutes={outcome.plan?.estimatedDurationMinutes ?? null}
        startedAt={outcome.createdAt ? new Date(outcome.createdAt) : null}
      />

      {showFinalAssembly ? (
        <FinalAssembly
          markdown={outcome.finalAssembly!.finalMarkdown!}
          executiveSummary={outcome.finalAssembly!.finalSummary}
          unresolvedLimitations={outcome.finalAssembly!.unresolvedLimitations}
          recommendedNextActions={outcome.finalAssembly!.recommendedNextActions}
        />
      ) : null}

      {companyId ? (
        <OutcomeDecisionQueue
          companyId={companyId}
          steps={outcome.steps}
        />
      ) : null}

      <PlanTimeline steps={outcome.steps} agentNameById={agentNameById} />

      <AgentTeam steps={outcome.steps} agents={agentsQuery.data ?? []} />

      <OutcomeNarrative outcomeId={outcome.id} />

      <OutcomeEventTimeline events={eventsQuery.data ?? []} />

      <OutcomeCostPanel
        estimatedCostCents={outcome.plan?.estimatedCostCents ?? null}
        costSoFarCents={outcome.costSoFarCents}
        budgetLimitCents={outcome.budgetLimitCents}
        stepsCompleted={stepsCompleted}
        stepsTotal={outcome.steps.length}
      />

      <WorkProducts steps={outcome.steps} />
    </div>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  return (
    <SoftCard className="p-3 border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/50">
      <p className="text-sm text-rose-800 dark:text-rose-300">
        {error instanceof Error ? error.message : String(error)}
      </p>
    </SoftCard>
  );
}
