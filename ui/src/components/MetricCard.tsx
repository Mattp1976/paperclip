import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
  accent?: boolean;
}

export function MetricCard({ icon: Icon, value, label, description, to, onClick, accent = false }: MetricCardProps) {
  const isClickable = !!(to || onClick);

  const inner = (
    <div
      className={cn(
        "group relative h-full overflow-hidden rounded-2xl px-6 py-6 transition-all duration-200",
        accent
          ? "bg-primary dark:bg-primary shadow-lg shadow-green-700/20 dark:shadow-green-900/40"
          : "bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03]",
        isClickable && !accent && "hover:shadow-md hover:shadow-black/[0.06] dark:hover:shadow-black/25 cursor-pointer hover:-translate-y-0.5",
        isClickable && accent && "hover:bg-primary dark:hover:bg-primary cursor-pointer hover:-translate-y-0.5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className={cn(
            "text-[11px] font-medium tracking-wide",
            accent ? "text-green-100" : "text-muted-foreground/70",
          )}>
            {label}
          </p>
          <p className={cn(
            "text-2xl sm:text-3xl font-bold tracking-tight tabular-nums",
            accent ? "text-white" : "text-foreground",
          )}>
            {value}
          </p>
          {description && (
            <div className={cn(
              "text-[12px] leading-snug hidden sm:block",
              accent ? "text-green-100/80" : "text-muted-foreground/60",
            )}>
              {description}
            </div>
          )}
        </div>
        <div className={cn(
          "rounded-xl p-2.5 transition-colors",
          accent
            ? "bg-white/15"
            : "bg-muted/40 group-hover:bg-muted/70",
        )}>
          <Icon className={cn(
            "h-5 w-5",
            accent ? "text-white/80" : "text-muted-foreground/50",
          )} />
        </div>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="no-underline text-inherit h-full" onClick={onClick}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div className="h-full" onClick={onClick}>
        {inner}
      </div>
    );
  }

  return inner;
}
