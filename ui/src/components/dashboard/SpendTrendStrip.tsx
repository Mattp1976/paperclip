/**
 * SpendTrendStrip — company-level rolling cost summary.
 *
 * Three values in a horizontal strip: this week · last week · month. Plus a
 * small delta tag on "last week" so the week-over-week trend is visible at a
 * glance. No ROI claims, just the raw numbers — per PLAN-30D W3 "just the raw
 * numbers, credible".
 *
 * Rendered inline on the Dashboard just below the main KPI row.
 */
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { friendlyCost } from "@/lib/utils";

interface SpendTrendStripProps {
  trailing7dSpendCents: number;
  prevWeek7dSpendCents: number;
  monthSpendCents: number;
}

export function SpendTrendStrip({
  trailing7dSpendCents,
  prevWeek7dSpendCents,
  monthSpendCents,
}: SpendTrendStripProps) {
  const delta = trailing7dSpendCents - prevWeek7dSpendCents;
  const deltaPct =
    prevWeek7dSpendCents > 0
      ? Math.round((delta / prevWeek7dSpendCents) * 100)
      : trailing7dSpendCents > 0
        ? null
        : 0;

  return (
    <div
      className="rounded-[24px] border border-border/40 dark:border-border/40 bg-white/80 dark:bg-card/60 px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
      role="group"
      aria-label="Company spend trend"
    >
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <TrendItem label="This week" valueCents={trailing7dSpendCents} />
        <TrendItem
          label="Last week"
          valueCents={prevWeek7dSpendCents}
          trailing={
            <DeltaTag
              delta={delta}
              pct={deltaPct}
              hasBaseline={prevWeek7dSpendCents > 0}
            />
          }
        />
        <TrendItem label="Month" valueCents={monthSpendCents} />
      </div>
    </div>
  );
}

function TrendItem({
  label,
  valueCents,
  trailing,
}: {
  label: string;
  valueCents: number;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums tracking-tight">
        {valueCents === 0 ? "$0" : friendlyCost(valueCents / 100)}
      </span>
      {trailing}
    </div>
  );
}

function DeltaTag({
  delta,
  pct,
  hasBaseline,
}: {
  delta: number;
  pct: number | null;
  hasBaseline: boolean;
}) {
  // No baseline and no current spend → flat marker, don't claim a direction.
  if (!hasBaseline && delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
        <Minus className="h-2.5 w-2.5" />
        flat
      </span>
    );
  }
  // Current spend exists but last week was zero → call it "new" rather than inventing a %.
  if (!hasBaseline) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
        <ArrowUpRight className="h-2.5 w-2.5" />
        new
      </span>
    );
  }
  const isDown = delta < 0;
  const Icon = delta === 0 ? Minus : isDown ? ArrowDownRight : ArrowUpRight;
  const tone = delta === 0
    ? "bg-muted/60 text-muted-foreground"
    : isDown
      ? "bg-emerald-100/70 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : "bg-rose-100/70 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
  const sign = delta === 0 ? "" : isDown ? "−" : "+";
  const label =
    pct === null || delta === 0
      ? `${sign}${friendlyCost(Math.abs(delta) / 100)}`
      : `${sign}${Math.abs(pct)}%`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${tone}`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
