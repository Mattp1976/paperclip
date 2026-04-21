import { AlertTriangle, RefreshCw } from "lucide-react";

interface DashboardErrorBannerProps {
  /** Short label, e.g. "Dashboard summary" or "Scheduler" */
  label: string;
  /** The error object from React Query */
  error: Error;
  /** React Query refetch callback */
  onRetry?: () => void;
  /** true while the retry is in flight */
  isRetrying?: boolean;
}

/**
 * Inline error banner shown inside the dashboard when a specific data
 * source fails.  Displays the error message and an optional retry button.
 */
export function DashboardErrorBanner({
  label,
  error,
  onRetry,
  isRetrying,
}: DashboardErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <p className="text-sm text-foreground truncate">
          <span className="font-medium">{label}</span>{" "}
          <span className="text-destructive">
            — {error.message || "Something went wrong"}
          </span>
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-destructive hover:text-destructive/80 underline underline-offset-2 shrink-0 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`}
          />
          Retry
        </button>
      )}
    </div>
  );
}
