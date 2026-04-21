/**
 * SpendHeroCard — cream pastel hero panel with abstract sage+rose swirl.
 *
 * Daylight, magazine-style. Shows this month's spend in big type with a soft
 * gradient wash, the month budget as a progress bar, and a link to the Costs
 * page for the drill-down. No more dark panel.
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
      className="group relative flex h-full flex-col overflow-hidden rounded-[32px] bg-[#FAF7F2] dark:bg-[#22251F] p-8 text-[#3D4A37] dark:text-[#E4EEDC] shadow-[0_1px_2px_rgba(94,114,89,0.08),0_20px_40px_-12px_rgba(94,114,89,0.20)] transition-all hover:-translate-y-1 hover:shadow-[0_2px_4px_rgba(94,114,89,0.10),0_28px_56px_-12px_rgba(94,114,89,0.28)] no-underline"
    >
      {/* Layered swirl — soft pastel sage + rose + butter */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            // Primary sage swirl, top-right
            "radial-gradient(1000px 340px at 115% -20%, rgba(156,183,149,0.42), transparent 55%)",
            // Rose accent, bottom-left
            "radial-gradient(620px 280px at -15% 120%, rgba(217,165,165,0.32), transparent 60%)",
            // Butter warmth, middle-right
            "radial-gradient(440px 220px at 90% 55%, rgba(240,220,180,0.30), transparent 65%)",
            // Cool sage pop, mid-left (stitches the gradient)
            "radial-gradient(420px 220px at 20% 70%, rgba(181,196,177,0.22), transparent 60%)",
          ].join(", "),
        }}
      />
      {/* Soft diagonal highlight ribbon (the "swirl" sheen) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-60"
        style={{
          background:
            "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.4) 48%, rgba(156,183,149,0.18) 55%, rgba(255,255,255,0.25) 62%, transparent 75%)",
        }}
      />
      {/* SVG abstract curves — organic swirl shape in sage+rose */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.55] dark:opacity-[0.35]"
        viewBox="0 0 400 260"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="spendSwirl" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#B5C4B1" stopOpacity="0.0" />
            <stop offset="45%" stopColor="#B5C4B1" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#A4BD95" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="spendSwirl2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#D9A5A5" stopOpacity="0.0" />
            <stop offset="60%" stopColor="#D9A5A5" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#D9A5A5" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path
          d="M -20 200 C 60 120, 160 220, 240 140 S 380 40, 460 80"
          stroke="url(#spendSwirl)"
          strokeWidth="80"
          fill="none"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M -20 240 C 80 180, 180 260, 260 200 S 420 120, 480 160"
          stroke="url(#spendSwirl2)"
          strokeWidth="44"
          fill="none"
          strokeLinecap="round"
          opacity="0.65"
        />
      </svg>

      {/* Decorative concentric rings for extra depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border border-white/60 dark:border-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-16 h-72 w-72 rounded-full border border-white/35 dark:border-white/5"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 bottom-0 h-40 w-40 rounded-full bg-white/40 dark:bg-white/[0.04] blur-2xl"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-sage-ink/80">
            This month
          </p>
          <p className="text-sm font-medium text-[#3D4A37]/85 dark:text-[#E4EEDC]/85 mt-1.5">
            Total spend
          </p>
        </div>
        <div className="rounded-full bg-white/70 dark:bg-white/10 p-2.5 backdrop-blur-sm transition-all duration-300 group-hover:rotate-[12deg] group-hover:bg-white/90 dark:group-hover:bg-white/20">
          <ArrowUpRight className="h-4 w-4 text-[#3D4A37] dark:text-[#E4EEDC]" strokeWidth={2.4} />
        </div>
      </div>

      <div className="relative mt-8 flex items-baseline gap-2">
        <p className="text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight leading-none">
          {friendlyCost(monthSpendCents / 100)}
        </p>
        {projected && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/60 dark:bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-[#3D4A37] dark:text-[#E4EEDC] backdrop-blur-sm">
            <TrendingUp className="h-3 w-3" />
            proj. {projected}
          </span>
        )}
      </div>

      <p className="relative mt-3 text-[13px] leading-relaxed text-sage-ink/80">
        {hasBudget
          ? `${Math.round(utilizationPercent)}% of ${formatCents(monthBudgetCents)} budget`
          : "No monthly budget set"}
      </p>

      <div className="relative mt-auto pt-8">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/50 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#8FA781] to-[#B5C4B1] transition-all duration-500"
            style={{ width: `${hasBudget ? barPct : 0}%` }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[10px] text-sage-ink/70">
          <span>Start of month</span>
          <span>{hasBudget ? formatCents(monthBudgetCents) : "Unlimited"}</span>
        </div>
      </div>
    </Link>
  );
}
