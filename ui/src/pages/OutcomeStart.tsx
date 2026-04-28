/**
 * OutcomeStart — the new outcome-first front door.
 *
 * Lives at /{COMPANY_PREFIX}/start. The flow is:
 *
 *   brief        → user types what they want
 *   planning     → planner generates a plan (LLM call)
 *   preview      → user sees plan + cost + agents + risks
 *   approving    → user clicks Approve and run; we POST /approve-plan
 *   →            navigate to /outcomes/:id
 *
 * Errors surface in-place. Re-plan and edit-brief always available.
 *
 * Sprint 1 of the Product Maturity Phase. See PRODUCT-MATURITY-PHASE.md.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@/lib/router";
import { Loader2, Settings, Sparkles } from "lucide-react";
import type {
  CreateOutcomeRequest,
  Outcome,
  OutcomeDetail,
  OutcomeTargetFormat,
} from "@orqestra/shared";
import { orchestraApi } from "@/api/orchestra";
import { agentsApi } from "@/api/agents";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  OutcomeBriefInput,
  type OutcomeBriefInputValue,
} from "@/components/outcome-start/OutcomeBriefInput";
import { GeneratedPlanPreview } from "@/components/outcome-start/GeneratedPlanPreview";
import { ApproveAndRunPanel } from "@/components/outcome-start/ApproveAndRunPanel";

type Stage = "brief" | "planning" | "preview" | "approving";

const INITIAL_VALUE: OutcomeBriefInputValue = {
  title: "",
  brief: "",
  targetFormat: "report" as OutcomeTargetFormat,
  templateId: null,
};

export function OutcomeStart() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Start" }]);
  }, [setBreadcrumbs]);

  const companyId = selectedCompany?.id ?? null;

  const [stage, setStage] = useState<Stage>("brief");
  const [briefValue, setBriefValue] =
    useState<OutcomeBriefInputValue>(INITIAL_VALUE);
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Once we have an outcome id, fetch its detail to render the plan.
  const detailQuery = useQuery({
    queryKey: queryKeys.outcomes.detail(outcomeId ?? "_"),
    queryFn: () => orchestraApi.get(outcomeId!),
    enabled: !!outcomeId && (stage === "preview" || stage === "approving"),
    refetchInterval: (q) => {
      const data = q.state.data as OutcomeDetail | undefined;
      // Poll briefly while planning hasn't landed yet.
      if (!data?.plan) return 1500;
      return false;
    },
  });

  // Agents for name lookup in the plan preview.
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId ?? "_"),
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId && stage === "preview",
  });

  const agentNameById = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const a of agentsQuery.data ?? []) out[a.id] = a.name;
    return out;
  }, [agentsQuery.data]);

  // ─── Mutations ────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (input: CreateOutcomeRequest): Promise<Outcome> =>
      orchestraApi.create(companyId!, input),
  });

  const planMutation = useMutation({
    mutationFn: async (id: string) => orchestraApi.generatePlan(id),
  });

  const approveMutation = useMutation({
    mutationFn: async (vars: { outcomeId: string; planId: string }) =>
      orchestraApi.approvePlan(vars.outcomeId, vars.planId),
  });

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handlePlanThis = async () => {
    if (!companyId) return;
    setErrorMessage(null);
    setStage("planning");
    try {
      const created = await createMutation.mutateAsync({
        title: briefValue.title.trim(),
        brief: briefValue.brief.trim(),
        targetFormat: briefValue.targetFormat,
        templateId: briefValue.templateId,
        executionMode: "review_plan_first",
      });
      setOutcomeId(created.id);
      // Kick the planner; the preview stage shows whatever lands.
      await planMutation.mutateAsync(created.id);
      // Refresh the detail so we render the plan immediately.
      await queryClient.invalidateQueries({
        queryKey: queryKeys.outcomes.detail(created.id),
      });
      setStage("preview");
    } catch (err) {
      setErrorMessage(messageFromError(err));
      setStage("brief");
    }
  };

  const handleReplan = async () => {
    if (!outcomeId) return;
    setErrorMessage(null);
    try {
      await planMutation.mutateAsync(outcomeId);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.outcomes.detail(outcomeId),
      });
    } catch (err) {
      setErrorMessage(messageFromError(err));
    }
  };

  const handleApprove = async () => {
    if (!outcomeId || !detailQuery.data?.plan) return;
    setErrorMessage(null);
    setStage("approving");
    try {
      await approveMutation.mutateAsync({
        outcomeId,
        planId: detailQuery.data.plan.id,
      });
      // Invalidate list + detail so /outcomes shows it.
      await queryClient.invalidateQueries({
        queryKey: queryKeys.outcomes.list(companyId!),
      });
      navigate(`/outcomes/${outcomeId}`);
    } catch (err) {
      setErrorMessage(messageFromError(err));
      setStage("preview");
    }
  };

  const handleEditBrief = () => {
    // Keep the outcome row around; user may want to re-plan.
    setStage("brief");
  };

  // ─── Render ───────────────────────────────────────────────────────────

  if (!companyId) {
    return (
      <div className="px-4">
        <EmptyState icon={Sparkles} message="Select a company to start" />
      </div>
    );
  }

  const canSubmit =
    briefValue.title.trim().length > 0 && briefValue.brief.trim().length > 0;
  const detail = detailQuery.data;
  const requiredMissing =
    detail?.plan?.requiredInputs.filter((m) => m.required) ?? [];
  const blocked = requiredMissing.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 space-y-8">
      {(stage === "brief" || stage === "planning") && (
        <>
          <OutcomeBriefInput
            value={briefValue}
            onChange={setBriefValue}
            disabled={stage === "planning"}
          />

          {errorMessage ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Link
              to="/onboarding"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <Settings className="h-3.5 w-3.5" />
              Set up adapters and agents instead
            </Link>

            <Button
              variant="sage"
              disabled={!canSubmit || stage === "planning"}
              onClick={handlePlanThis}
              className="gap-2 rounded-2xl px-5"
            >
              {stage === "planning" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {stage === "planning" ? "Drafting a plan…" : "Plan this"}
            </Button>
          </div>
        </>
      )}

      {(stage === "preview" || stage === "approving") && (
        <>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Your outcome
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {briefValue.title || detail?.title || "Outcome"}
            </h1>
          </div>

          {detailQuery.isLoading || !detail?.plan ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Drafting the plan. This usually takes 10–30 seconds.
            </div>
          ) : (
            <GeneratedPlanPreview
              detail={detail}
              agentNameById={agentNameById}
            />
          )}

          {errorMessage ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <ApproveAndRunPanel
            blocked={blocked}
            blockedReason={
              blocked
                ? "The planner needs answers to the questions above. Edit your brief, then re-plan"
                : undefined
            }
            approving={stage === "approving"}
            replanning={planMutation.isPending}
            onApprove={handleApprove}
            onReplan={handleReplan}
            onEditBrief={handleEditBrief}
          />
        </>
      )}
    </div>
  );
}

function messageFromError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong";
}
