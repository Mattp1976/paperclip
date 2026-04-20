/**
 * OutlinedKpi — the quiet sibling KPI tile.
 *
 * Neutral outlined card with a small circular arrow badge top-right, per the
 * reference design. Pairs with `HeroKpi` in the top row of the dashboard.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

interface OutlinedKpiProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
  /** Tone shifts the accent colour of the icon (default = muted green). */
  tone?: "default" | "amber" | "red" | "violet";
}

const toneClasses: Record<NonNullable<OutlinedKpiProps["tone"]>, { icon: string; iconBg: string }> = {
  default: {
    icon: "text-green-700 dark:text-green-400",
    iconBg: "bg-green-100/70 dark:bg-green-950/40",
  },
  amber: {
    icon: "text-amber-700 dark:text-amber-400",
    iconBg: "bg-amber-100/70 dark:bg-amber-950/40",
  },
  red: {
    icon: "text-red-700 dark:text-red-400",
    iconBg: "bg-red-100/70 dark:bg-red-950/40",
  },
  violet: {
    icon: "text-violet-700 dark:text-violet-400",
    iconBg: "bg-violet-100/70 dark:bg-violet-950/40",
  },
};

export function OutlinedKpi({
  icon: Icon,
  value,
  label,
  description,
  to,
  onClick,
  tone = "default",
}: OutlinedKpiProps) {
  const t = toneClasses[tone];

  const inner = (
    <div
      className={cn(
        "group relative h-full overflow-hidden rounded-3xl px-6 py-6 transition-all duration-200",
        "bg-white dark:bg-card border border-border/50 dark:border-border/40",
        "shadow-sm shadow-black/[0.02]",
        (to || onClick) && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-border/80 dark:hover:border-border/70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className={cn("rounded-lg p-1.5", t.iconBg)}>
              <Icon className={cn("h-3.5 w-3.5", t.icon)} />
            </div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70">
              {label}
            </p>
          </div>
          <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums text-foreground">
            {value}
          </p>
          {description && (
            <div className="text-[12px] leading-snug text-muted-foreground/70">
              {description}
            </div>
          )}
        </div>
        <div
          className={cn(
            "rounded-full border border-border/60 bg-background p-2",
            "transition-all duration-200 group-hover:border-foreground/30 group-hover:rotate-[10deg]",
            "dark:border-border/60 dark:bg-background/50",
          )}
        >
          <ArrowUpRight className="h-3.5 w-3.5 text-foreground/70" />
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
