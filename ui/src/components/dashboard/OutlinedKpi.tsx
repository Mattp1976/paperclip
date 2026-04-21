/**
 * OutlinedKpi — the quiet sibling KPI tile.
 *
 * Airy, outlined card paired with `HeroKpi`. Big numeral, thin label above,
 * sub-caption below, circular arrow badge top-right that rotates on hover.
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
    icon: "text-sage-ink",
    iconBg: "bg-[#E4EEDC] dark:bg-[#3B4A37]/50",
  },
  amber: {
    icon: "text-[#8A6A2E] dark:text-amber-300",
    iconBg: "bg-[#F5E6C8] dark:bg-amber-950/50",
  },
  red: {
    icon: "text-[#8A4A4A] dark:text-[#F0C7C7]",
    iconBg: "bg-[#F5E5E5] dark:bg-red-950/50",
  },
  violet: {
    icon: "text-[#6A5A8A] dark:text-violet-300",
    iconBg: "bg-[#EAE3F0] dark:bg-violet-950/50",
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
        "group relative h-full overflow-hidden rounded-[32px] p-8 transition-all duration-300",
        "bg-white dark:bg-card border border-border/40 dark:border-border/40",
        "shadow-[0_1px_2px_rgba(0,0,0,0.02),0_12px_32px_-12px_rgba(0,0,0,0.06)]",
        (to || onClick) && "cursor-pointer hover:-translate-y-1 hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_20px_48px_-16px_rgba(0,0,0,0.12)] hover:border-border/70",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={cn("rounded-xl p-2", t.iconBg)}>
              <Icon className={cn("h-4 w-4", t.icon)} strokeWidth={2.2} />
            </div>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
              {label}
            </p>
          </div>
          <div
            className={cn(
              "rounded-full border border-border/60 bg-background p-2.5",
              "transition-all duration-300 group-hover:border-foreground/40 group-hover:rotate-[12deg] group-hover:bg-accent/40",
              "dark:border-border/60 dark:bg-background/50",
            )}
          >
            <ArrowUpRight className="h-4 w-4 text-foreground/70" strokeWidth={2.2} />
          </div>
        </div>

        <p className="mt-8 text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight text-foreground leading-none">
          {value}
        </p>

        {description && (
          <div className="mt-3 text-[13px] leading-relaxed text-muted-foreground/70">
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
