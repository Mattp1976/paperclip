/**
 * Orchestra landing page — outcome-led work.
 *
 * Two surfaces in one page (v1):
 *   - "Start an outcome" form (title + brief + format + execution mode)
 *   - List of existing outcomes with status / progress / cost
 *
 * Mission-control OutcomeDetail page is a sibling route. Landing keeps
 * it simple — a calm "tell Paperclip what you want" feel rather than a
 * dashboard.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@/lib/router";
import { Sparkles, ArrowRight, Loader2, Clock, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CreateOutcomeRequest,
  OutcomeListItem,
  OutcomeStatus,
  OutcomeTargetFormat,
  OutcomeExecutionMode,
} from "@mattparrytfc/shared";
import { orchestraApi } from "../api/orchestra";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { SoftCard } from "../components/SoftCard";
import { friendlyCost, relativeTime, cn } from "@/lib/utils";

const TARGET_FORMAT_LABELS: Record<OutcomeTargetFormat, string> = {
  report: "Report",
  memo: "Memo",
  deck_outline: "Deck outline",
  email: "Email",
  strategy: "Strategy",
  audit: "Audit",
  research_brief: "Research brief",
  custom: "Custom",
};

const EXECUTION_MODE_LABELS: Record<OutcomeExecutionMode, string> = {
  review_plan_first: "Review plan first",
  auto_run_if_low_risk: "Auto-run if low risk",
};

export function Orchestra() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Orchestra" }]);
  }, [setBreadcrumbs]);

  const companyId = selectedCompany?.id ?? null;

  const outcomesQuery = useQuery({
    queryKey: queryKeys.outcomes.list(companyId ?? "_"),
    queryFn: () => orchestraApi.list(companyId!),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateOutcomeRequest) =>
      orchestraApi.create(companyId!, input),
    onSuccess: (outcome) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.outcomes.list(companyId!),
      });
      navigate(`/orchestra/${outcome.id}`);
    },
  });

  if (!companyId) {
    return (
      <div className="px-4">
        <EmptyState
          icon={Sparkles}
          message="Select a company to start an outcome"
        />
      </div>
    );
  }

  return (
    <div className="px-4 pb-24 max-w-5xl mx-auto space-y-8">
      <PageHeader
        title="Orchestra"
        subtitle="Tell Paperclip what outcome you want. It will plan, delegate, execute, review and deliver."
      />

      <NewOutcomeForm
        submitting={createMutation.isPending}
        error={createMutation.error}
        onSubmit={(input) => createMutation.mutate(input)}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Your outcomes
        </h2>
        {outcomesQuery.isLoading ? (
          <PageSkeleton />
        ) : !outcomesQuery.data || outcomesQuery.data.length === 0 ? (
          <SoftCard>
            <p className="text-sm text-muted-foreground p-4">
              No outcomes yet. Start one above.
            </p>
          </SoftCard>
        ) : (
          <div className="grid gap-3">
            {outcomesQuery.data.map((o) => (
              <OutcomeRow key={o.id} outcome={o} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// New outcome form
// ─────────────────────────────────────────────────────────────────────────

function NewOutcomeForm({
  submitting,
  error,
  onSubmit,
}: {
  submitting: boolean;
  error: unknown;
  onSubmit: (input: CreateOutcomeRequest) => void;
}) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [targetFormat, setTargetFormat] =
    useState<OutcomeTargetFormat>("report");
  const [executionMode, setExecutionMode] =
    useState<OutcomeExecutionMode>("review_plan_first");

  const canSubmit = title.trim().length > 0 && brief.trim().length > 0 && !submitting;

  return (
    <SoftCard className="p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Start an outcome
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Describe what you want and Paperclip will plan how to deliver it.
        </p>
      </div>

      <div className="space-y-3">
        <Field label="What outcome do you want?">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Strategic market intelligence report on the UK fintech space"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <Field label="Add context">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={5}
            placeholder="What you want, who it's for, and any constraints. The more specific the brief, the better the plan."
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Desired output format">
            <Select
              value={targetFormat}
              onValueChange={(v) => setTargetFormat(v as OutcomeTargetFormat)}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TARGET_FORMAT_LABELS) as OutcomeTargetFormat[]).map(
                  (k) => (
                    <SelectItem key={k} value={k}>
                      {TARGET_FORMAT_LABELS[k]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Execution">
            <Select
              value={executionMode}
              onValueChange={(v) =>
                setExecutionMode(v as OutcomeExecutionMode)
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(EXECUTION_MODE_LABELS) as OutcomeExecutionMode[]
                ).map((k) => (
                  <SelectItem key={k} value={k}>
                    {EXECUTION_MODE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      {error ? (
        <div className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Something went wrong"}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              brief: brief.trim(),
              targetFormat,
              executionMode,
            })
          }
          className="gap-2 rounded-2xl px-5"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {submitting ? "Starting…" : "Start outcome"}
        </Button>
      </div>
    </SoftCard>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1.5 block">
        {label}
      </span>
      {children}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Outcome list row
// ─────────────────────────────────────────────────────────────────────────

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

const STATUS_TONE: Record<OutcomeStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  planning: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  awaiting_clarification:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  ready_to_execute:
    "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  executing:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  reviewing:
    "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  refining:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  assembling:
    "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  delivered:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed:
    "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  cancelled: "bg-muted text-muted-foreground",
};

function OutcomeRow({ outcome }: { outcome: OutcomeListItem }) {
  const progress = useMemo(() => {
    if (outcome.stepsTotal === 0) return 0;
    return Math.round((outcome.stepsCompleted / outcome.stepsTotal) * 100);
  }, [outcome.stepsTotal, outcome.stepsCompleted]);

  return (
    <Link to={`/orchestra/${outcome.id}`} className="group block">
      <SoftCard className="p-4 transition-colors hover:bg-muted/40">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  STATUS_TONE[outcome.status],
                )}
              >
                {STATUS_LABEL[outcome.status]}
              </span>
              <span className="text-xs text-muted-foreground">
                {TARGET_FORMAT_LABELS[outcome.targetFormat]}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground truncate">
              {outcome.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {outcome.brief}
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CircleDot className="h-3 w-3" />
                {outcome.stepsCompleted} / {outcome.stepsTotal} steps
                {outcome.stepsTotal > 0 ? ` · ${progress}%` : ""}
              </span>
              <span>{friendlyCost(outcome.costSoFarCents / 100)} spent</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {relativeTime(new Date(outcome.updatedAt))}
              </span>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground/80 mt-1 shrink-0" />
        </div>
      </SoftCard>
    </Link>
  );
}
