/**
 * HeroKpi — the anchor "hero" KPI tile.
 *
 * Soft sage pastel gradient; still the visual anchor of the KPI row but
 * airy, daylight-friendly rather than dark green. Layered decorative
 * rings for depth, oversized numeral, circular arrow badge top-right.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

interface HeroKpiProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
  /** Optional trend signal shown as a pill (e.g. "+3 this week") */
  trend?: string;
}

export function HeroKpi({
  icon: Icon,
  value,
  label,
  description,
  to,
  onClick,
  trend,
}: HeroKpiProps) {
  const inner = (
    <div
      className={cn(
        "group relative h-full overflow-hidden rounded-[32px] p-8 transition-all duration-300",
        // Soft sage pastel hero — still anchors the row, but airy + daylight.
        "bg-gradient-to-br from-sage-ink-dim via-[#E2ECD6] to-[#EDF2E4] text-sage-body",
        "shadow-[0_1px_2px_rgba(94,114,89,0.08),0_20px_40px_-12px_rgba(94,114,89,0.20)]",
        "dark:from-sage-body dark:via-[#3F5140] dark:to-[#2E3A2B] dark:text-sage-surface",
        (to || onClick) && "cursor-pointer hover:-translate-y-1 hover:shadow-[0_2px_4px_rgba(94,114,89,0.10),0_28px_56px_-12px_rgba(94,114,89,0.28)]",
      )}
    >
      {/* Decorative concentric rings — adds depth like the reference */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border border-white/50 dark:border-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-16 h-72 w-72 rounded-full border border-white/30 dark:border-white/5"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 bottom-0 h-40 w-40 rounded-full bg-white/30 dark:bg-white/[0.04] blur-2xl"
      />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-white/70 dark:bg-white/10 p-2 backdrop-blur-sm">
              <Icon className="h-4 w-4 text-sage-ink" strokeWidth={2.2} />
            </div>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-sage-ink/85">
              {label}
            </p>
          </div>
          <div className="rounded-full bg-white/70 dark:bg-white/10 p-2.5 backdrop-blur-sm transition-all duration-300 group-hover:rotate-[12deg] group-hover:bg-white/90 dark:group-hover:bg-white/20">
            <ArrowUpRight className="h-4 w-4 text-sage-body dark:text-sage-surface" strokeWidth={2.4} />
          </div>
        </div>

        <div className="mt-8 flex items-baseline gap-2">
          <p className="text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight leading-none">
            {value}
          </p>
          {trend && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/60 dark:bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-sage-body dark:text-sage-surface backdrop-blur-sm">
              {trend}
            </span>
          )}
        </div>

        {description && (
          <div className="mt-3 text-[13px] leading-relaxed text-sage-ink/85">
            {description}
          </div>
        )}
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="no-underline text-inherit h-full block" onClick={onClick}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="h-full w-full text-left">
        {inner}
      </button>
    );
  }
  return inner;
}
