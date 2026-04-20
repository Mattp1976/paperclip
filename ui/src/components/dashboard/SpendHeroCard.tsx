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
      className="group relative flex h-full flex-col overflow-hidden rounded-[32px] bg-neutral-900 dark:bg-neutral-950 p-8 text-white shadow-[0_2px_4px_rgba(0,0,0,0.25),0_24px_48px_-16px_rgba(0,0,0,0.55)] transition-all hover:-translate-y-1 hover:shadow-[0_4px_8px_rgba(0,0,0,0.3),0_32px_64px_-16px_rgba(0,0,0,0.65)] no-underline"
    >
      {/* Layered swirl — multiple radial gradients for depth + a soft diagonal sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            // Primary green swirl, top-right
            "radial-gradient(1000px 320px at 115% -20%, rgba(16,185,129,0.42), transparent 55%)",
            // Secondary emerald, bottom-left
            "radial-gradient(600px 260px at -15% 120%, rgba(34,197,94,0.30), transparent 60%)",
            // Cool teal accent, middle
            "radial-gradient(500px 200px at 70% 60%, rgba(45,212,191,0.16), transparent 65%)",
            // Warm pop, right-middle (breaks the cool monotony)
            "radial-gradient(380px 180px at 95% 50%, rgba(250,204,21,0.10), transparent 60%)",
            // Base darkening vignette on left
            "radial-gradient(700px 300px at 0% 50%, rgba(0,0,0,0.35), transparent 70%)",
          ].join(", "),
        }}
      />
      {/* Soft diagonal highlight ribbon (the "swirl" sheen) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-50 mix-blend-screen"
        style={{
          background:
            "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.05) 48%, rgba(16,185,129,0.12) 55%, rgba(255,255,255,0.03) 62%, transparent 75%)",
        }}
      />
      {/* SVG abstract curves — organic swirl shape */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.35]"
        viewBox="0 0 400 260"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="spendSwirl" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.0" />
            <stop offset="45%" stopColor="#34d399" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="spendSwirl2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.0" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path
          d="M -20 200 C 60 120, 160 220, 240 140 S 380 40, 460 80"
          stroke="url(#spendSwirl)"
          strokeWidth="80"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M -20 240 C 80 180, 180 260, 260 200 S 420 120, 480 160"
          stroke="url(#spendSwirl2)"
          strokeWidth="44"
          fill="none"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>

      {/* Decorative concentric rings for extra depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border border-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-16 h-72 w-72 rounded-full border border-white/5"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 bottom-0 h-40 w-40 rounded-full bg-emerald-500/[0.12] blur-3xl"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/55">
            This month
          </p>
          <p className="text-sm font-medium text-white/80 mt-1.5">Total spend</p>
        </div>
        <div className="rounded-full bg-white/15 p-2.5 backdrop-blur-sm transition-all duration-300 group-hover:rotate-[12deg] group-hover:bg-white/25">
          <ArrowUpRight className="h-4 w-4 text-white" strokeWidth={2.4} />
        </div>
      </div>

      <div className="relative mt-8 flex items-baseline gap-2">
        <p className="text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight leading-none">
          {friendlyCost(monthSpendCents / 100)}
        </p>
        {projected && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
            <TrendingUp className="h-3 w-3" />
            proj. {projected}
          </span>
        )}
      </div>

      <p className="relative mt-3 text-[13px] leading-relaxed text-white/65">
        {hasBudget
          ? `${Math.round(utilizationPercent)}% of ${formatCents(monthBudgetCents)} budget`
          : "No monthly budget set"}
      </p>

      <div className="relative mt-auto pt-8">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-300 transition-all duration-500"
            style={{ width: `${hasBudget ? barPct : 0}%` }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[10px] text-white/55">
          <span>Start of month</span>
          <span>{hasBudget ? formatCents(monthBudgetCents) : "Unlimited"}</span>
        </div>
      </div>
    </Link>
  );
}
