/**
 * OutcomeLedHero — Sprint 2's nudge of the dashboard towards
 * outcomes-first.
 *
 * Sits at the top of the Dashboard. Two halves:
 *   - left: "Start an outcome" CTA pointing to /start
 *   - right: list of active outcomes (latest first) with status pill
 *
 * The brief asks the dashboard to LEAD with outcomes. Sprint 5 will
 * deepen this with the full 7-element hierarchy. For Sprint 2 we plant
 * the flag without throwing away the existing operational widgets
 * below.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { Wand2, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { orchestraApi } from "@/api/orchestra";
import { queryKeys } from "@/lib/queryKeys";
import { SoftCard } from "@/components/SoftCard";
import { friendlyCost, cn } from "@/lib/utils";
import type { OutcomeListItem, OutcomeStatus } from "@orqestra/shared";

interface OutcomeLedHeroProps {
  companyId: string;
}

const ACTIVE_STATUSES: OutcomeStatus[] = [
  "draft",
  "planning",
  "awaiting_clarification",
  "ready_to_execute",
  "executing",
  "reviewing",
  "refining",
  "assembling",
];

const STATUS_LABEL: Record<OutcomeStatus, string> = {
  draft: "Draft",
  planning: "Planning",
  awaiting_clarification: "Needs your input",
  ready_to_execute: "Ready to approve",
  executing: "In progress",
  reviewing: "Reviewing",
  refining: "Refining",
  assembling: "Assembling",
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
  reviewing: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  refining:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  assembling:
    "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  delivered:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  cancelled: "bg-muted text-muted-foreground",
};

export function OutcomeLedHero({ companyId }: OutcomeLedHeroProps) {
  const outcomesQuery = useQuery({
    queryKey: queryKeys.outcomes.list(companyId),
    queryFn: () => orchestraApi.list(companyId),
    enabled: !!companyId,
    refetchInterval: 15000,
  });

  const all = outcomesQuery.data ?? [];
  const active = all.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const top = active.slice(0, 3);

  return (
    <SoftCard className="p-6 md:p-7">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-10 items-stretch">
        {/* Left: CTA */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Start here
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            What outcome do you want?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Describe a result. Orqestra will shape the team, plan the work, and
            ask before anything important runs
          </p>
          <div className="mt-2">
            <Button
              asChild
              variant="sage-elevated"
              size="none"
              className="gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold"
            >
              <Link to="/start">
                <Wand2 className="h-4 w-4" />
                Start an outcome
              </Link>
            </Button>
          </div>
        </div>

        {/* Right: active outcomes */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {active.length === 0
                ? "Nothing in flight"
                : `Active outcomes · ${active.length}`}
            </p>
            {all.length > 0 ? (
              <Link
                to="/outcomes"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>

          {top.length === 0 ? (
            <EmptyHint />
          ) : (
            <div className="space-y-2">
              {top.map((o) => (
                <OutcomeRow key={o.id} outcome={o} />
              ))}
            </div>
          )}
        </div>
      </div>
    </SoftCard>
  );
}

function OutcomeRow({ outcome }: { outcome: OutcomeListItem }) {
  const progress =
    outcome.stepsTotal === 0
      ? 0
      : Math.round((outcome.stepsCompleted / outcome.stepsTotal) * 100);
  return (
    <Link
      to={`/outcomes/${outcome.id}`}
      className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5 hover:bg-muted/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={cn(
              "text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded",
              STATUS_TONE[outcome.status],
            )}
          >
            {STATUS_LABEL[outcome.status]}
          </span>
          {outcome.stepsTotal > 0 ? (
            <span className="text-xs text-muted-foreground">
              {outcome.stepsCompleted}/{outcome.stepsTotal} ·{" "}
              {progress}%
            </span>
          ) : null}
        </div>
        <p className="text-sm font-medium text-foreground truncate">
          {outcome.title}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-muted-foreground">
          {friendlyCost(outcome.costSoFarCents / 100)}
        </p>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground/80 ml-auto mt-0.5" />
      </div>
    </Link>
  );
}

function EmptyHint() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-background/40 px-3 py-3 text-sm text-muted-foreground">
      <Sparkles className="h-4 w-4 text-muted-foreground/70" />
      Start one and it will appear here
    </div>
  );
}
