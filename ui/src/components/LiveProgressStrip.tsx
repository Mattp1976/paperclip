/**
 * LiveProgressStrip — Shows in-progress work with a friendly progress bar.
 *
 * When agents are actively running, this component surfaces a grouped
 * "working on it" strip that communicates progress to non-technical users.
 *
 * Part of the Ask → Progress → Result → Cost → Next Action redesign.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "@/lib/utils";
import { Identity } from "./Identity";
import {
  Loader2,
  CheckCircle2,
  Circle,
  Clock,
  Zap,
} from "lucide-react";
import type { HeartbeatRun, Agent } from "@mattparrytfc/shared";

/* ── Helpers ─────────────────────────────────────────────────── */

function friendlyDuration(ms: number): string {
  if (ms < 1000) return "just started";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

function friendlyInvocationSource(source: string): string {
  switch (source) {
    case "assignment": return "You asked";
    case "timer": return "Scheduled";
    case "on_demand": return "You asked";
    case "automation": return "Triggered automatically";
    default: return "Working";
  }
}

interface AgentProgress {
  agentId: string;
  agentName: string;
  status: "done" | "working" | "waiting";
  durationMs: number | null;
  run: HeartbeatRun;
}

interface WorkSession {
  /** Earliest run createdAt — used as session identifier */
  sessionStart: Date;
  /** A human-readable label for what's being worked on */
  label: string;
  /** Source of the trigger */
  source: string;
  /** Agents involved */
  agents: AgentProgress[];
  /** How many are complete */
  completedCount: number;
  /** Total agents */
  totalCount: number;
  /** Time elapsed since session start */
  elapsedMs: number;
}

/* ── Component ──────────────────────────────────────────────── */

interface LiveProgressStripProps {
  companyId: string;
}

export function LiveProgressStrip({ companyId }: LiveProgressStripProps) {
  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(companyId),
    queryFn: () => heartbeatsApi.list(companyId),
    enabled: !!companyId,
    refetchInterval: 3000, // Poll every 3s for live progress
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

  // Find active work sessions — group recent runs by time proximity
  const activeSessions = useMemo(() => {
    if (!runs) return [];

    const now = Date.now();

    // Get all currently running/queued runs
    const liveRuns = runs.filter(
      (r: HeartbeatRun) => r.status === "running" || r.status === "queued",
    );

    if (liveRuns.length === 0) return [];

    // Also gather recently-completed runs (last 30s) that may be part of the same session
    const recentCompleted = runs.filter(
      (r: HeartbeatRun) =>
        (r.status === "succeeded" || r.status === "failed") &&
        r.finishedAt &&
        now - new Date(r.finishedAt).getTime() < 30_000,
    );

    // Group all related runs by time proximity (within 60s of each other)
    const allRelated = [...liveRuns, ...recentCompleted].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    if (allRelated.length === 0) return [];

    // Simple grouping: cluster runs that started within 60s of each other
    const groups: HeartbeatRun[][] = [];
    let currentGroup: HeartbeatRun[] = [allRelated[0]];

    for (let i = 1; i < allRelated.length; i++) {
      const prev = new Date(allRelated[i - 1].createdAt).getTime();
      const curr = new Date(allRelated[i].createdAt).getTime();
      if (curr - prev < 60_000) {
        currentGroup.push(allRelated[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [allRelated[i]];
      }
    }
    groups.push(currentGroup);

    // Convert groups to WorkSessions
    return groups
      .filter((g) => g.some((r) => r.status === "running" || r.status === "queued"))
      .map((group): WorkSession => {
        const sessionStart = new Date(group[0].createdAt);
        const source = friendlyInvocationSource(group[0].invocationSource);

        const agentProgress: AgentProgress[] = group.map((run) => {
          const agent = agentMap.get(run.agentId);
          const durationMs =
            run.startedAt && run.finishedAt
              ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
              : run.startedAt
                ? now - new Date(run.startedAt).getTime()
                : null;

          let status: "done" | "working" | "waiting";
          if (run.status === "succeeded") status = "done";
          else if (run.status === "failed") status = "done"; // Show as done with error
          else if (run.status === "running") status = "working";
          else status = "waiting"; // queued

          return {
            agentId: run.agentId,
            agentName: agent?.name ?? "Agent",
            status,
            durationMs,
            run,
          };
        });

        // Sort: done first, then working, then waiting
        agentProgress.sort((a, b) => {
          const order = { done: 0, working: 1, waiting: 2 };
          return order[a.status] - order[b.status];
        });

        const completedCount = agentProgress.filter((a) => a.status === "done").length;

        return {
          sessionStart,
          label: group.length === 1
            ? `${agentProgress[0].agentName} is working`
            : `${group.length} agents working together`,
          source,
          agents: agentProgress,
          completedCount,
          totalCount: group.length,
          elapsedMs: now - sessionStart.getTime(),
        };
      });
  }, [runs, agentMap]);

  if (activeSessions.length === 0) return null;

  return (
    <div className="space-y-3">
      {activeSessions.map((session, i) => (
        <div
          key={i}
          className={cn(
            "rounded-2xl border border-green-200/60 dark:border-green-500/20",
            "bg-gradient-to-br from-green-50/80 to-white dark:from-green-950/30 dark:to-card",
            "shadow-sm shadow-green-900/[0.04] dark:shadow-black/10",
            "overflow-hidden",
          )}
        >
          {/* Progress bar */}
          <div className="h-1 bg-green-100 dark:bg-green-900/30">
            <div
              className={cn(
                "h-full bg-green-600 dark:bg-green-500 transition-all duration-700 ease-out",
                session.completedCount === 0 && "animate-pulse",
              )}
              style={{
                width:
                  session.totalCount > 0
                    ? `${Math.max(
                        (session.completedCount / session.totalCount) * 100,
                        session.completedCount === 0 ? 15 : 0,
                      )}%`
                    : "0%",
              }}
            />
          </div>

          <div className="px-5 py-4 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-600/10 dark:bg-green-500/20">
                  <Zap className="h-4 w-4 text-green-700 dark:text-green-400 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {session.label}
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    {session.source} · {friendlyDuration(session.elapsedMs)} elapsed
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                  {session.completedCount} of {session.totalCount} complete
                </span>
              </div>
            </div>

            {/* Agent list */}
            {session.agents.length > 1 && (
              <div className="space-y-1.5">
                {session.agents.map((ap) => (
                  <div
                    key={ap.agentId}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    {ap.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                    ) : ap.status === "working" ? (
                      <Loader2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 animate-spin" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                    )}

                    <Identity name={ap.agentName} size="xs" />

                    <span
                      className={cn(
                        "text-xs truncate",
                        ap.status === "done"
                          ? "text-muted-foreground/60"
                          : ap.status === "working"
                            ? "text-foreground font-medium"
                            : "text-muted-foreground/40",
                      )}
                    >
                      {ap.agentName}
                    </span>

                    <span className="text-[11px] text-muted-foreground/40 ml-auto shrink-0">
                      {ap.status === "done" && ap.durationMs
                        ? `done (${friendlyDuration(ap.durationMs)})`
                        : ap.status === "working"
                          ? "working…"
                          : "waiting"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Single agent — simpler display */}
            {session.agents.length === 1 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
                <Loader2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 animate-spin" />
                <Identity name={session.agents[0].agentName} size="xs" />
                <span className="text-xs">{session.agents[0].agentName} is working on it…</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
