/**
 * TeamActivityCard — "Team activity" list with status chips per row.
 *
 * Inspired by the "Team Collaboration" card in the reference design. Shows
 * live runs (and recent ones) as a tidy list with agent avatars, current
 * task, and a status chip (Running / Succeeded / Failed).
 */
import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { Issue } from "@mattparrytfc/shared";
import { heartbeatsApi, type LiveRunForIssue } from "../../api/heartbeats";
import { issuesApi } from "../../api/issues";
import { queryKeys } from "../../lib/queryKeys";
import { cn, relativeTime } from "../../lib/utils";
import { Identity } from "../Identity";

const MAX_ROWS = 6;

interface TeamActivityCardProps {
  companyId: string;
}

function statusChip(status: LiveRunForIssue["status"]) {
  switch (status) {
    case "running":
      return {
        label: "Running",
        className:
          "bg-sage-surface text-sage-body border-[#C5D4BC] dark:bg-sage-body/50 dark:border-[#5E7259]/50",
        dotClass: "bg-primary",
        pulse: true,
      };
    case "queued":
      return {
        label: "Queued",
        className:
          "bg-[#F5E6C8] text-[#7A5A1E] border-[#E6D4A8] dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800/50",
        dotClass: "bg-[#D4A860]",
        pulse: false,
      };
    case "succeeded":
      return {
        label: "Succeeded",
        className:
          "bg-[#EDF2E4] text-sage-ink border-sage-ink-dim dark:bg-sage-body/35 dark:border-[#5E7259]/40",
        dotClass: "bg-primary",
        pulse: false,
      };
    case "failed":
    case "timed_out":
      return {
        label: status === "timed_out" ? "Timeout" : "Failed",
        className:
          "bg-[#F5E5E5] text-[#7A3A3A] border-[#E6C7C7] dark:bg-red-950/40 dark:text-[#F0C7C7] dark:border-red-800/50",
        dotClass: "bg-[#C47878]",
        pulse: false,
      };
    default:
      return {
        label: status,
        className:
          "bg-muted text-foreground/70 border-border/60",
        dotClass: "bg-muted-foreground",
        pulse: false,
      };
  }
}

export function TeamActivityCard({ companyId }: TeamActivityCardProps) {
  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(companyId), "team-activity"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId, MAX_ROWS),
  });

  const runs = liveRuns ?? [];
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId),
    enabled: runs.length > 0,
  });

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) map.set(issue.id, issue);
    return map;
  }, [issues]);

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-[32px]",
        "bg-white dark:bg-card border border-border/40 dark:border-border/40",
        "shadow-[0_1px_2px_rgba(0,0,0,0.02),0_12px_32px_-12px_rgba(0,0,0,0.06)]",
      )}
    >
      <div className="flex items-center justify-between px-8 pt-7 pb-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            Team activity
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground/70">
            Agents currently working or just done
          </p>
        </div>
        <Link
          to="/agents"
          className="text-xs font-medium text-muted-foreground/70 hover:text-foreground no-underline"
        >
          View all &rarr;
        </Link>
      </div>

      <div className="flex-1 px-3 pb-4">
        {runs.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground/60">
            No live agent activity right now.
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {runs.slice(0, MAX_ROWS).map((run) => {
              const issue = run.issueId ? issueById.get(run.issueId) : undefined;
              const chip = statusChip(run.status);
              const when = run.finishedAt
                ? relativeTime(run.finishedAt)
                : relativeTime(run.createdAt);
              return (
                <li key={run.id}>
                  <Link
                    to={`/agents/${run.agentId}/runs/${run.id}`}
                    className="group flex items-center gap-3 rounded-2xl px-5 py-3 transition-colors hover:bg-accent/40 no-underline text-inherit"
                  >
                    <Identity name={run.agentName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-foreground/90">
                        {issue?.title ?? "Working..."}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground/60">
                        {when}
                        {issue?.identifier ? ` · ${issue.identifier}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0",
                        chip.className,
                      )}
                    >
                      <span className="relative flex h-1.5 w-1.5">
                        {chip.pulse && (
                          <span
                            className={cn(
                              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                              chip.dotClass,
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            "relative inline-flex h-1.5 w-1.5 rounded-full",
                            chip.dotClass,
                          )}
                        />
                      </span>
                      {chip.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
