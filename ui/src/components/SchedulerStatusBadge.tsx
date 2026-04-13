import { useQuery } from "@tanstack/react-query";
import { schedulerHealthApi } from "../api/schedulerHealth";
import { queryKeys } from "../lib/queryKeys";
import { Activity, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

const STATUS_CONFIG = {
  healthy: {
    icon: Activity,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800/50",
    label: "Scheduler healthy",
  },
  degraded: {
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800/50",
    label: "Scheduler degraded",
  },
  stopped: {
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-800/50",
    label: "Scheduler stopped",
  },
} as const;

/**
 * Compact badge showing scheduler health.  Only rendered when the
 * scheduler status is NOT healthy (degraded / stopped) or while
 * the scheduler health query is loading for the first time.
 *
 * When healthy, nothing is shown — we follow the "no news is good news"
 * pattern to keep the dashboard clean.
 */
export function SchedulerStatusBadge() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.schedulerHealth?.() ?? ["schedulerHealth"],
    queryFn: () => schedulerHealthApi.get(),
    refetchInterval: 30_000, // poll every 30 s
    retry: 1,
  });

  // While loading the first time, show nothing (avoid flash)
  if (isLoading) return null;

  // Network/auth error — treat as "stopped" for display purposes
  if (error) {
    const cfg = STATUS_CONFIG.stopped;
    const Icon = cfg.icon;
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
          cfg.bg,
          cfg.border,
          cfg.color,
        )}
        title={`Scheduler health unavailable: ${error.message}`}
      >
        <Icon className="h-3.5 w-3.5" />
        Scheduler unreachable
      </div>
    );
  }

  // When healthy, stay silent
  if (data?.status === "healthy") return null;

  const status = data?.status ?? "stopped";
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  const detail = data?.scheduler
    ? `Uptime ${Math.round(data.scheduler.uptimeMs / 1_000)}s · ${data.scheduler.tickCount} ticks · ${data.scheduler.totalFailureCount} failures`
    : undefined;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
        cfg.bg,
        cfg.border,
        cfg.color,
      )}
      title={detail}
    >
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
      {data?.scheduler?.lastError && (
        <span className="ml-1 opacity-70 truncate max-w-[180px]">
          — {data.scheduler.lastError}
        </span>
      )}
    </div>
  );
}
