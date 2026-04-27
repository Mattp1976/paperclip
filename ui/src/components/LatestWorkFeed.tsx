/**
 * LatestWorkFeed — "Run results" feed on the Dashboard.
 *
 * Shows the most recent meaningful results from across all agents as rich
 * preview cards. Named "Run results" in the UI (internal file name kept for
 * import stability) because users need to see clearly which *run* each output
 * belongs to — this is the primary answer to "where are my outputs?".
 *
 * Results are grouped by task (issueId) so a 5-agent swarm collaborating on
 * one task shows as ONE card (per UX-REDESIGN-SPEC §P2), with each agent's
 * contribution inspectable inline without navigating away.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { extractOutputText } from "./OutputCard";
import {
  ResultCard,
  ResultCardSkeleton,
  groupRunsByTask,
} from "./ResultCard";
import { Sparkles, X } from "lucide-react";
import type { HeartbeatRun, Agent } from "@orqestra/shared";

const FIRST_RESULT_TOOLTIP_KEY = "paperclip:onboarding:first-result-seen";

interface LatestWorkFeedProps {
  companyId: string;
  /** Max number of task-grouped result cards to show */
  limit?: number;
}

export function LatestWorkFeed({ companyId, limit = 8 }: LatestWorkFeedProps) {
  // First-result onboarding tooltip — shown once ever per device, then dismissed.
  const [showFirstResultTip, setShowFirstResultTip] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(FIRST_RESULT_TOOLTIP_KEY)) {
        setShowFirstResultTip(true);
      }
    } catch {
      // localStorage unavailable (e.g. private mode) — just skip the tip.
    }
  }, []);
  const dismissFirstResultTip = () => {
    setShowFirstResultTip(false);
    try {
      localStorage.setItem(FIRST_RESULT_TOOLTIP_KEY, "1");
    } catch {
      // ignore
    }
  };

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
    const map = new Map<
      string,
      { id: string; title: string; identifier: string | null }
    >();
    for (const i of issues ?? [])
      map.set(i.id, {
        id: i.id,
        title: i.title,
        identifier: i.identifier,
      });
    return map;
  }, [issues]);

  // Group succeeded runs with output by task, then cap at `limit` groups
  const resultGroups = useMemo(() => {
    if (!runs) return [];
    const meaningful = runs.filter(
      (r: HeartbeatRun) =>
        r.status === "succeeded" && extractOutputText(r) !== null,
    );
    return groupRunsByTask(meaningful).slice(0, limit);
  }, [runs, limit]);

  if (runsLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground/70">
            <Sparkles className="h-3.5 w-3.5" />
            Run results
          </h3>
        </div>
        <div className="space-y-3">
          <ResultCardSkeleton />
          <ResultCardSkeleton />
        </div>
      </div>
    );
  }

  if (resultGroups.length === 0) return null;

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
        {showFirstResultTip && resultGroups.length > 0 && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="mt-0.5 rounded-full bg-primary/15 p-1.5 shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Your first result is here</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This is what one of your agents produced. Click the card to see
                the full task, or expand any section to read more.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissFirstResultTip}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-0.5"
              aria-label="Dismiss tip"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {resultGroups.map((group) => {
          const task = group.issueId ? issueMap.get(group.issueId) : null;
          return (
            <ResultCard
              key={group.key}
              runs={group.runs}
              agentMap={agentMap}
              task={task ?? null}
              compact
            />
          );
        })}
      </div>
    </div>
  );
}
