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
          "bg-green-100/80 text-green-800 border-green-200/70 dark:bg-green-900/40 dark:text-green-200 dark:border-green-800/50",
        dotClass: "bg-green-600",
        pulse: true,
      };
    case "queued":
      return {
        label: "Queued",
        className:
          "bg-amber-100/80 text-amber-800 border-amber-200/70 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800/50",
        dotClass: "bg-amber-500",
        pulse: false,
      };
    case "succeeded":
      return {
        label: "Succeeded",
        className:
          "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
        dotClass: "bg-emerald-500",
        pulse: false,
      };
    case "failed":
    case "timed_out":
      return {
        label: status === "timed_out" ? "Timeout" : "Failed",
        className:
          "bg-red-50 text-red-700 border-red-200/80 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50",
        dotClass: "bg-red-500",
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
    <div className="flex h-full flex-col rounded-3xl bg-white dark:bg-card border border-border/50 dark:border-border/40 shadow-sm shadow-black/[0.03] overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Team activity</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">
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

      <div className="flex-1 px-2 pb-3">
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
                    className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40 no-underline text-inherit"
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
