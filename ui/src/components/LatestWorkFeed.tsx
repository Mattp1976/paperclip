/**
 * LatestWorkFeed — Shows the most recent meaningful outputs
 * from across all agents, rendered as rich preview cards.
 *
 * Used on the Dashboard to surface "what your agents produced"
 * without needing to drill into individual agent pages.
 */
import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { OutputCard, OutputCardSkeleton, extractOutputText, extractIssueId } from "./OutputCard";
import { Sparkles } from "lucide-react";
import type { HeartbeatRun, Agent } from "@mattparrytfc/shared";

interface LatestWorkFeedProps {
  companyId: string;
  /** Max number of output cards to show */
  limit?: number;
}

export function LatestWorkFeed({ companyId, limit = 5 }: LatestWorkFeedProps) {
  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: queryKeys.heartbeats(companyId),
    queryFn: () => heartbeatsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId),
    enabled: !!companyId,
  });

  const issueMap = useMemo(() => {
    const map = new Map<string, { title: string; identifier: string | null }>();
    for (const i of issues ?? []) map.set(i.id, { title: i.title, identifier: i.identifier });
    return map;
  }, [issues]);

  // Filter to only successful runs with meaningful output, sorted newest first
  const outputRuns = useMemo(() => {
    if (!runs) return [];
    return runs
      .filter((r: HeartbeatRun) =>
        r.status === "succeeded" && extractOutputText(r) !== null
      )
      .sort((a: HeartbeatRun, b: HeartbeatRun) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, limit);
  }, [runs, limit]);

  if (runsLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground/70">
            <Sparkles className="h-3.5 w-3.5" />
            Latest work
          </h3>
        </div>
        <div className="space-y-3">
          <OutputCardSkeleton />
          <OutputCardSkeleton />
        </div>
      </div>
    );
  }

  if (outputRuns.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground/70">
          <Sparkles className="h-3.5 w-3.5" />
          Latest work
        </h3>
        <Link
          to="/outputs"
          className="text-xs text-muted-foreground/50 hover:text-foreground transition-colors no-underline"
        >
          View all &rarr;
        </Link>
      </div>

      <div className="space-y-3">
        {outputRuns.map((run: HeartbeatRun) => {
          const issueId = extractIssueId(run);
          const issue = issueId ? issueMap.get(issueId) : null;
          return (
            <OutputCard
              key={run.id}
              run={run}
              agent={agentMap.get(run.agentId)}
              compact
              taskTitle={issue?.title}
              taskIdentifier={issue?.identifier ?? issueId ?? undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
