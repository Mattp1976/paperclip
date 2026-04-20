/**
 * HeroKpi — the big filled "hero" KPI tile.
 *
 * Visual anchor for the dashboard's KPI row. Matches the dark-green filled
 * tile in the reference: very large numeral, subtle sub-caption, circular
 * arrow badge top-right, layered decorative rings for depth.
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
        "bg-gradient-to-br from-green-700 via-green-700 to-green-900 text-white",
        "shadow-[0_2px_4px_rgba(20,83,45,0.15),0_24px_48px_-16px_rgba(20,83,45,0.35)]",
        "dark:from-green-600 dark:via-green-700 dark:to-green-900 dark:shadow-green-950/40",
        (to || onClick) && "cursor-pointer hover:-translate-y-1 hover:shadow-[0_4px_8px_rgba(20,83,45,0.2),0_32px_64px_-16px_rgba(20,83,45,0.45)]",
      )}
    >
      {/* Decorative concentric rings — adds depth like the reference */}
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
        className="pointer-events-none absolute -right-8 bottom-0 h-40 w-40 rounded-full bg-white/[0.04] blur-2xl"
      />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-white/15 p-2 backdrop-blur-sm">
              <Icon className="h-4 w-4 text-white" strokeWidth={2.2} />
            </div>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-green-50/80">
              {label}
            </p>
          </div>
          <div className="rounded-full bg-white/15 p-2.5 backdrop-blur-sm transition-all duration-300 group-hover:rotate-[12deg] group-hover:bg-white/25">
            <ArrowUpRight className="h-4 w-4 text-white" strokeWidth={2.4} />
          </div>
        </div>

        <div className="mt-8 flex items-baseline gap-2">
          <p className="text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight text-white leading-none">
            {value}
          </p>
          {trend && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              {trend}
            </span>
          )}
        </div>

        {description && (
          <div className="mt-3 text-[13px] leading-relaxed text-green-50/80">
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
