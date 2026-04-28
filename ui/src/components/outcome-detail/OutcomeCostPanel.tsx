/**
 * OutcomeCostPanel — money story for one outcome.
 *
 * Sprint 2 v1: estimated · spent · projected · budget. Three numbers
 * the user can read in a glance, plus a small overshoot/undershoot
 * indicator vs the estimate.
 *
 * Sprint 6 (cost-as-confidence) layers on: human-equivalent estimate,
 * confidence band, per-agent breakdown, time saved.
 */
import { Coins, TrendingUp } from "lucide-react";
import { SoftCard } from "@/components/SoftCard";
import { friendlyCost, cn } from "@/lib/utils";

interface OutcomeCostPanelProps {
  estimatedCostCents: number | null;
  costSoFarCents: number;
  budgetLimitCents: number | null;
  /** Total step count and completed step count, for projection. */
  stepsCompleted: number;
  stepsTotal: number;
}

export function OutcomeCostPanel({
  estimatedCostCents,
  costSoFarCents,
  budgetLimitCents,
  stepsCompleted,
  stepsTotal,
}: OutcomeCostPanelProps) {
  // Crude projection: extrapolate spend so far against completion ratio.
  const projectedCents =
    stepsCompleted > 0 && stepsCompleted < stepsTotal
      ? Math.round(costSoFarCents * (stepsTotal / stepsCompleted))
      : stepsCompleted === stepsTotal
        ? costSoFarCents
        : (estimatedCostCents ?? null);

  const overshoot =
    estimatedCostCents != null && projectedCents != null
      ? projectedCents - estimatedCostCents
      : null;

  const overBudget =
    budgetLimitCents != null &&
    projectedCents != null &&
    projectedCents > budgetLimitCents;

  return (
    <SoftCard className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Cost</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="Estimated"
          value={
            estimatedCostCents != null
              ? friendlyCost(estimatedCostCents / 100)
              : "—"
          }
          hint="Planner's projection"
        />
        <Stat
          label="Spent so far"
          value={friendlyCost(costSoFarCents / 100)}
        />
        <Stat
          label="Projected"
          value={
            projectedCents != null ? friendlyCost(projectedCents / 100) : "—"
          }
          hint={
            stepsCompleted > 0 && stepsCompleted < stepsTotal
              ? "From spend so far"
              : "Live estimate"
          }
          tone={overBudget ? "warn" : "default"}
        />
        <Stat
          label="Budget"
          value={
            budgetLimitCents != null
              ? friendlyCost(budgetLimitCents / 100)
              : "Company default"
          }
        />
      </div>

      {overshoot != null && Math.abs(overshoot) > 50 ? (
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5",
            overshoot > 0
              ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
          )}
        >
          <TrendingUp className="h-3 w-3" />
          {overshoot > 0
            ? `Tracking ${friendlyCost(overshoot / 100)} above the planner's estimate`
            : `Tracking ${friendlyCost(Math.abs(overshoot) / 100)} below the planner's estimate`}
        </div>
      ) : null}
    </SoftCard>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
        {label}
      </p>
      <p
        className={cn(
          "text-base font-semibold",
          tone === "warn"
            ? "text-amber-700 dark:text-amber-300"
            : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
