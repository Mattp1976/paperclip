/**
 * OutcomeCostPanel — money story for one outcome.
 *
 * Sprint 5 (cost-as-confidence) v2: estimated · spent · projected ·
 * budget, plus a clearly-labelled human-equivalent estimate and a
 * confidence band derived from completion progress and overshoot.
 *
 * Honesty rules (per the brief):
 *   - "Human equivalent" is ALWAYS labelled as an estimate — never
 *     presented as financial proof.
 *   - "Confidence" is derived from facts the system has, not invented.
 *
 * Per-agent and per-step breakdowns will land in a later sprint once
 * the server exposes per-cost-event aggregation per outcome.
 */
import { Coins, TrendingUp, Gauge, UserCheck } from "lucide-react";
import { SoftCard } from "@/components/SoftCard";
import { friendlyCost, cn } from "@/lib/utils";

/** Rough multiplier for "what would this cost a human consultant for the same output". */
const HUMAN_EQUIVALENT_MULTIPLIER = 35;

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

      <ConfidenceRow
        humanEquivCents={
          (estimatedCostCents ?? projectedCents ?? null) != null
            ? Math.round(
                (estimatedCostCents ?? projectedCents ?? 0) *
                  HUMAN_EQUIVALENT_MULTIPLIER,
              )
            : null
        }
        confidenceLevel={confidenceLevel({
          stepsCompleted,
          stepsTotal,
          overshoot,
          haveEstimate: estimatedCostCents != null,
        })}
      />
    </SoftCard>
  );
}

function ConfidenceRow({
  humanEquivCents,
  confidenceLevel,
}: {
  humanEquivCents: number | null;
  confidenceLevel: { label: "Low" | "Medium" | "High"; reason: string };
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
      <div className="rounded-xl border border-border/60 bg-background/40 p-3">
        <div className="flex items-center gap-1 mb-0.5">
          <UserCheck className="h-3 w-3 text-muted-foreground" />
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Human equivalent
          </p>
        </div>
        <p className="text-base font-semibold text-foreground">
          {humanEquivCents != null
            ? friendlyCost(humanEquivCents / 100)
            : "—"}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          Estimate of what comparable human work would cost. Not a
          financial guarantee
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-background/40 p-3">
        <div className="flex items-center gap-1 mb-0.5">
          <Gauge className="h-3 w-3 text-muted-foreground" />
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Confidence
          </p>
        </div>
        <p
          className={cn(
            "text-base font-semibold",
            confidenceLevel.label === "High"
              ? "text-emerald-700 dark:text-emerald-300"
              : confidenceLevel.label === "Medium"
                ? "text-foreground"
                : "text-amber-700 dark:text-amber-300",
          )}
        >
          {confidenceLevel.label}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          {confidenceLevel.reason}
        </p>
      </div>
    </div>
  );
}

function confidenceLevel(input: {
  stepsCompleted: number;
  stepsTotal: number;
  overshoot: number | null;
  haveEstimate: boolean;
}): { label: "Low" | "Medium" | "High"; reason: string } {
  if (!input.haveEstimate) {
    return {
      label: "Low",
      reason: "No planner estimate yet. Confidence will rise once a plan is drafted",
    };
  }
  if (input.stepsTotal === 0) {
    return {
      label: "Medium",
      reason: "Plan drafted. Confidence will firm up once steps run",
    };
  }
  const completion = input.stepsCompleted / input.stepsTotal;
  // Big overshoot dominates.
  if (input.overshoot != null && input.overshoot > 200) {
    return {
      label: "Low",
      reason: "Spend is well above the planner's estimate. Treat the projection cautiously",
    };
  }
  if (completion >= 0.5) {
    return {
      label: "High",
      reason: "More than half the steps are done. Projection is grounded in actual spend",
    };
  }
  if (completion >= 0.2) {
    return {
      label: "Medium",
      reason: "A few steps complete. The projection is firming up",
    };
  }
  return {
    label: "Medium",
    reason: "Early days. Projection is the planner's read",
  };
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
