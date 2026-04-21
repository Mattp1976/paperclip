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
import { Button } from "@/components/ui/button";

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
    amber: "bg-[#F5E6C8] text-[#7A5A1E] dark:bg-amber-900/40 dark:text-amber-200",
    green: "bg-[#E4EEDC] text-[#3D4A37] dark:bg-[#3B4A37]/60 dark:text-[#C5D4BC]",
    red: "bg-[#F5E5E5] text-[#7A3A3A] dark:bg-red-900/40 dark:text-[#F0C7C7]",
    neutral: "bg-muted text-foreground/80",
  }[content.pillTone];

  const Icon = content.icon;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-[32px] p-8",
        "bg-white dark:bg-card border border-border/40 dark:border-border/40",
        "shadow-[0_1px_2px_rgba(0,0,0,0.02),0_12px_32px_-12px_rgba(0,0,0,0.06)]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            Up next
          </p>
          <p className="text-sm font-medium text-foreground/90 mt-1">
            {dateLabel} · {timeLabel}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold",
            pillToneClass,
          )}
        >
          {content.pill}
        </span>
      </div>

      <div className="mt-7 flex items-start gap-4">
        <div className="rounded-2xl bg-[#E4EEDC] dark:bg-[#3B4A37]/50 p-3">
          <Icon className="h-5 w-5 text-sage-ink" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold leading-snug text-foreground line-clamp-2 tracking-tight">
            {content.title}
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground/80 leading-relaxed">
            {content.body}
          </p>
        </div>
      </div>

      <div className="mt-auto pt-8">
        {content.ctaHref ? (
          <Button
            asChild
            variant="sage-elevated"
            size="none"
            className="w-full gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold no-underline"
          >
            <Link to={content.ctaHref}>
              {content.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="sage-elevated"
            size="none"
            onClick={content.ctaOnClick}
            className="w-full gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            {content.ctaLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
