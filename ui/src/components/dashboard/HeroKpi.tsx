/**
 * HeroKpi — the big filled "hero" KPI tile.
 *
 * One of these per dashboard row; it's the visual anchor that every other
 * tile defers to. Modeled on the dark-green tile in the reference design.
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
        "group relative h-full overflow-hidden rounded-3xl px-6 py-6 transition-all duration-200",
        "bg-gradient-to-br from-green-700 to-green-800 text-white",
        "shadow-lg shadow-green-900/20",
        "dark:from-green-600 dark:to-green-800 dark:shadow-green-950/40",
        (to || onClick) && "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl",
      )}
    >
      {/* Decorative ring */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full border border-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -bottom-20 h-44 w-44 rounded-full border border-white/5"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-white/15 p-1.5">
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-[11px] font-medium tracking-wide text-green-50/90">
              {label}
            </p>
          </div>
          <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums text-white">
            {value}
          </p>
          {description && (
            <div className="text-[12px] leading-snug text-green-50/80">
              {description}
            </div>
          )}
          {trend && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white">
              {trend}
            </span>
          )}
        </div>
        <div className="rounded-full bg-white/15 p-2 transition-transform group-hover:rotate-[10deg]">
          <ArrowUpRight className="h-4 w-4 text-white" />
        </div>
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
