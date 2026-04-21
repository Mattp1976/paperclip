import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { Issue } from "@mattparrytfc/shared";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "../lib/utils";
import { ArrowRight } from "lucide-react";
import { Identity } from "./Identity";

const MIN_DASHBOARD_RUNS = 6;

function isRunActive(run: LiveRunForIssue): boolean {
  return run.status === "queued" || run.status === "running";
}

interface ActiveAgentsPanelProps {
  companyId: string;
}

export function ActiveAgentsPanel({ companyId }: ActiveAgentsPanelProps) {
  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(companyId), "dashboard"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId, MIN_DASHBOARD_RUNS),
  });

  const runs = liveRuns ?? [];
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId),
    enabled: runs.length > 0,
  });

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) {
      map.set(issue.id, issue);
    }
    return map;
  }, [issues]);

  if (runs.length === 0) return null;

  const activeRuns = runs.filter(isRunActive);
  const recentRuns = runs.filter((r) => !isRunActive(r));

  return (
    <div className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] overflow-hidden">
      {/* Active runs section */}
      {activeRuns.length > 0 && (
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#B5C4B1] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-medium text-foreground/70">{activeRuns.length} agent{activeRuns.length === 1 ? "" : "s"} running</span>
          </div>
          <div className="space-y-1">
            {activeRuns.map((run) => {
              const issue = run.issueId ? issueById.get(run.issueId) : undefined;
              return (
                <Link
                  key={run.id}
                  to={`/agents/${run.agentId}/runs/${run.id}`}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/50 no-underline text-inherit"
                >
                  <Identity name={run.agentName} size="sm" />
                  <div className="flex-1 min-w-0">
                    {issue?.title ? (
                      <p className="text-sm truncate text-foreground/90">{issue.title}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Working...</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground/60 shrink-0">{relativeTime(run.createdAt)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Divider if both sections exist */}
      {activeRuns.length > 0 && recentRuns.length > 0 && (
        <div className="border-t border-border/30" />
      )}

      {/* Recent completed runs */}
      {recentRuns.length > 0 && (
        <div className="px-5 pt-3 pb-3">
          {activeRuns.length === 0 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex h-2 w-2 rounded-full bg-muted-foreground/25" />
              <span className="text-xs font-medium text-foreground/70">Recent activity</span>
            </div>
          )}
          {activeRuns.length > 0 && (
            <p className="text-xs text-muted-foreground/50 mb-2">Recent</p>
          )}
          <div className="space-y-1">
            {recentRuns.slice(0, activeRuns.length > 0 ? 3 : 4).map((run) => {
              const issue = run.issueId ? issueById.get(run.issueId) : undefined;
              return (
                <Link
                  key={run.id}
                  to={`/agents/${run.agentId}/runs/${run.id}`}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-accent/50 no-underline text-inherit"
                >
                  <Identity name={run.agentName} size="sm" className="opacity-60" />
                  <div className="flex-1 min-w-0">
                    {issue?.title ? (
                      <p className="text-sm truncate text-muted-foreground">{issue.title}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground/60">Completed</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground/40 shrink-0">
                    {run.finishedAt ? relativeTime(run.finishedAt) : relativeTime(run.createdAt)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
