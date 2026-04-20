/**
 * UpNextCard — a large actionable "what to do next" card.
 *
 * Styled on the "Reminders / Start Meeting" card in the reference design.
 * Surfaces the single most valuable next action given the current state:
 *   1. Pending approvals
 *   2. An active live run (link into its details)
 *   3. A top open task
 *   4. (Fallback) Kick off a new task
 */
import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck, Activity, Sparkles, CircleDot, Plus } from "lucide-react";
import { heartbeatsApi } from "../../api/heartbeats";
import { issuesApi } from "../../api/issues";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/utils";
import { useDialog } from "../../context/DialogContext";

interface UpNextCardProps {
  companyId: string;
  pendingApprovals: number;
  budgetApprovals: number;
}

export function UpNextCard({ companyId, pendingApprovals, budgetApprovals }: UpNextCardProps) {
  const { openNewIssue } = useDialog();

  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(companyId), "upnext"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId, 4),
    enabled: !!companyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId),
    enabled: !!companyId,
  });

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const runningCount = useMemo(
    () => (liveRuns ?? []).filter((r) => r.status === "running" || r.status === "queued").length,
    [liveRuns],
  );

  const totalApprovals = pendingApprovals + budgetApprovals;

  const topOpenIssue = useMemo(() => {
    if (!issues) return null;
    const priorityRank: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    return [...issues]
      .filter((i) => i.status === "todo" || i.status === "in_progress")
      .sort((a, b) => {
        const pa = priorityRank[a.priority] ?? 4;
        const pb = priorityRank[b.priority] ?? 4;
        if (pa !== pb) return pa - pb;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })[0] ?? null;
  }, [issues]);

  // Decide what to surface.
  type Mode = "approvals" | "live" | "task" | "empty";
  let mode: Mode = "empty";
  if (totalApprovals > 0) mode = "approvals";
  else if (runningCount > 0) mode = "live";
  else if (topOpenIssue) mode = "task";

  const content = (() => {
    switch (mode) {
      case "approvals":
        return {
          pill: "Needs your review",
          pillTone: "amber" as const,
          icon: ShieldCheck,
          title: `${totalApprovals} approval${totalApprovals === 1 ? "" : "s"} waiting`,
          body: budgetApprovals > 0
            ? `${budgetApprovals} budget override${budgetApprovals === 1 ? "" : "s"} · ${pendingApprovals} board review${pendingApprovals === 1 ? "" : "s"}`
            : "Agents are paused waiting for your sign-off.",
          ctaLabel: "Review approvals",
          ctaHref: "/approvals",
          ctaOnClick: undefined,
        };
      case "live":
        return {
          pill: "Live now",
          pillTone: "green" as const,
          icon: Activity,
          title: `${runningCount} agent${runningCount === 1 ? "" : "s"} working`,
          body: "Watch the progress feed to see outputs as they land.",
          ctaLabel: "View live feed",
          ctaHref: "/agents",
          ctaOnClick: undefined,
        };
      case "task":
        return {
          pill: `${topOpenIssue!.priority.charAt(0).toUpperCase()}${topOpenIssue!.priority.slice(1)} priority`,
          pillTone:
            topOpenIssue!.priority === "critical" || topOpenIssue!.priority === "high"
              ? ("red" as const)
              : ("neutral" as const),
          icon: CircleDot,
          title: topOpenIssue!.title,
          body: `${topOpenIssue!.identifier ?? topOpenIssue!.id.slice(0, 8)} · Pick this up or assign a swarm.`,
          ctaLabel: "Open task",
          ctaHref: `/issues/${topOpenIssue!.identifier ?? topOpenIssue!.id}`,
          ctaOnClick: undefined,
        };
      case "empty":
      default:
        return {
          pill: "All clear",
          pillTone: "green" as const,
          icon: Sparkles,
          title: "What should we work on next?",
          body: "Kick off a new task and let your agents take it from here.",
          ctaLabel: "New task",
          ctaHref: undefined,
          ctaOnClick: () => openNewIssue(),
        };
    }
  })();

  const pillToneClass = {
    amber: "bg-amber-100/80 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    green: "bg-green-100/80 text-green-900 dark:bg-green-900/40 dark:text-green-200",
    red: "bg-red-100/80 text-red-900 dark:bg-red-900/40 dark:text-red-200",
    neutral: "bg-muted text-foreground/80",
  }[content.pillTone];

  const Icon = content.icon;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-white dark:bg-card border border-border/50 dark:border-border/40 shadow-sm shadow-black/[0.03] p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70">
            Up next
          </p>
          <p className="text-sm font-medium text-foreground/90 mt-0.5">
            {dateLabel} · {timeLabel}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
            pillToneClass,
          )}
        >
          {content.pill}
        </span>
      </div>

      <div className="mt-5 flex items-start gap-3">
        <div className="rounded-xl bg-green-700/10 dark:bg-green-900/30 p-2.5">
          <Icon className="h-5 w-5 text-green-700 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold leading-snug text-foreground line-clamp-2">
            {content.title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/80 leading-relaxed">
            {content.body}
          </p>
        </div>
      </div>

      <div className="mt-auto pt-6">
        {content.ctaHref ? (
          <Link
            to={content.ctaHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-600 hover:shadow-md hover:shadow-green-700/20 active:scale-[0.99] dark:bg-green-600 dark:text-green-950 dark:hover:bg-green-500 no-underline"
          >
            {content.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={content.ctaOnClick}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-green-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-600 hover:shadow-md hover:shadow-green-700/20 active:scale-[0.99] dark:bg-green-600 dark:text-green-950 dark:hover:bg-green-500"
          >
            <Plus className="h-4 w-4" />
            {content.ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
