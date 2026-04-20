/**
 * SpendHeroCard — dark hero panel with abstract gradient "swirl".
 *
 * Inspired by the "Time Tracker" card in the reference design. Shows this
 * month's spend in big type with a subtle gradient, the month budget as a
 * progress bar, and a link to the Costs page for the drill-down.
 */
import { Link } from "@/lib/router";
import { ArrowUpRight, TrendingUp } from "lucide-react";
import { friendlyCost, formatCents } from "@/lib/utils";

interface SpendHeroCardProps {
  monthSpendCents: number;
  monthBudgetCents: number;
  utilizationPercent: number;
  projectedMonthlyCents: number;
}

export function SpendHeroCard({
  monthSpendCents,
  monthBudgetCents,
  utilizationPercent,
  projectedMonthlyCents,
}: SpendHeroCardProps) {
  const hasBudget = monthBudgetCents > 0;
  const barPct = hasBudget
    ? Math.min(100, Math.max(0, utilizationPercent))
    : 0;
  const projected =
    projectedMonthlyCents > 0
      ? friendlyCost(projectedMonthlyCents / 100)
      : null;

  return (
    <Link
      to="/costs"
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-neutral-900 dark:bg-neutral-950 p-6 text-white shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:shadow-xl no-underline"
    >
      {/* Abstract swirl gradient — emulates the reference "texture" look */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(900px 260px at 110% -10%, rgba(16,185,129,0.35), transparent 60%), radial-gradient(500px 200px at -10% 120%, rgba(34,197,94,0.22), transparent 60%), radial-gradient(400px 180px at 50% 120%, rgba(255,255,255,0.05), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border border-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-4 h-56 w-56 rounded-full border border-white/5"
      />

      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-white/60">
            This month
          </p>
          <p className="text-sm font-medium text-white/80 mt-0.5">Total spend</p>
        </div>
        <div className="rounded-full bg-white/10 p-2 transition-transform group-hover:rotate-[10deg]">
          <ArrowUpRight className="h-4 w-4 text-white" />
        </div>
      </div>

      <div className="relative mt-6 flex items-end gap-2">
        <p className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight">
          {friendlyCost(monthSpendCents / 100)}
        </p>
        {projected && (
          <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80">
            <TrendingUp className="h-3 w-3" />
            proj. {projected}
          </span>
        )}
      </div>

      <p className="relative mt-1 text-xs text-white/60">
        {hasBudget
          ? `${Math.round(utilizationPercent)}% of ${formatCents(monthBudgetCents)} budget`
          : "No monthly budget set"}
      </p>

      <div className="relative mt-auto pt-6">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-300 transition-all duration-500"
            style={{ width: `${hasBudget ? barPct : 0}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-white/60">
          <span>Start of month</span>
          <span>{hasBudget ? formatCents(monthBudgetCents) : "Unlimited"}</span>
        </div>
      </div>
    </Link>
  );
}
