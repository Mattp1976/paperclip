import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { cn, agentUrl, relativeTime } from "../lib/utils";
import { Identity } from "./Identity";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
} from "lucide-react";
import type { Agent, HeartbeatRun } from "@mattparrytfc/shared";

/* ---- Types ---- */

type Severity = "critical" | "warning" | "healthy";

interface AgentHealthRow {
  agent: Agent;
  severity: Severity;
  reasons: string[];
  recentFailures: number;
  recentSuccesses: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  consecutiveFailures: number;
}

/* ---- Helpers ---- */

function assessAgentHealth(agent: Agent, agentRuns: HeartbeatRun[]): AgentHealthRow {
  const sorted = [...agentRuns].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const last24h = sorted.filter(
    (r) => Date.now() - new Date(r.createdAt).getTime() < 24 * 60 * 60 * 1000,
  );

  const recentFailures = last24h.filter(
    (r) => r.status === "failed" || r.status === "timed_out",
  ).length;
  const recentSuccesses = last24h.filter((r) => r.status === "succeeded").length;

  // Count consecutive failures from most recent
  let consecutiveFailures = 0;
  for (const run of sorted) {
    if (run.status === "failed" || run.status === "timed_out") {
      consecutiveFailures++;
    } else {
      break;
    }
  }

  const lastRun = sorted[0] ?? null;
  const reasons: string[] = [];
  let severity: Severity = "healthy";

  // Error status
  if (agent.status === "error") {
    severity = "critical";
    reasons.push("Agent in error state");
  }

  // Paused
  if (agent.status === "paused") {
    if (severity !== "critical") severity = "warning";
    reasons.push("Agent is paused");
  }

  // Consecutive failures
  if (consecutiveFailures >= 3) {
    severity = "critical";
    reasons.push(`${consecutiveFailures} consecutive failures`);
  } else if (consecutiveFailures >= 2) {
    if (severity !== "critical") severity = "warning";
    reasons.push(`${consecutiveFailures} consecutive failures`);
  }

  // High failure rate in last 24h
  const total24h = recentFailures + recentSuccesses;
  if (total24h >= 3 && recentFailures / total24h > 0.5) {
    if (severity !== "critical") severity = "warning";
    reasons.push(`${Math.round((recentFailures / total24h) * 100)}% failure rate (24h)`);
  }

  // No recent runs for active agent
  if (
    agent.status === "active" &&
    lastRun &&
    Date.now() - new Date(lastRun.createdAt).getTime() > 48 * 60 * 60 * 1000
  ) {
    if (severity === "healthy") severity = "warning";
    reasons.push("No runs in 48+ hours");
  }

  if (reasons.length === 0) {
    reasons.push("Operating normally");
  }

  return {
    agent,
    severity,
    reasons,
    recentFailures,
    recentSuccesses,
    lastRunAt: lastRun ? String(lastRun.createdAt) : null,
    lastRunStatus: lastRun?.status ?? null,
    consecutiveFailures,
  };
}

function severityOrder(s: Severity): number {
  if (s === "critical") return 0;
  if (s === "warning") return 1;
  return 2;
}

/* ---- Component ---- */

export function FleetHealthOverview({ companyId }: { companyId: string }) {
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(companyId),
    queryFn: () => heartbeatsApi.list(companyId),
    enabled: !!companyId,
    refetchInterval: 30_000,
  });

  const healthRows = useMemo(() => {
    if (!agents || !runs) return [];

    const runsByAgent = new Map<string, HeartbeatRun[]>();
    for (const r of runs) {
      const existing = runsByAgent.get(r.agentId) ?? [];
      existing.push(r);
      runsByAgent.set(r.agentId, existing);
    }

    const rows: AgentHealthRow[] = agents
      .filter((a) => a.status !== "terminated")
      .map((agent) => assessAgentHealth(agent, runsByAgent.get(agent.id) ?? []));

    // Sort: critical first, then warning, then healthy
    rows.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
    return rows;
  }, [agents, runs]);

  const criticalCount = healthRows.filter((r) => r.severity === "critical").length;
  const warningCount = healthRows.filter((r) => r.severity === "warning").length;
  const healthyCount = healthRows.filter((r) => r.severity === "healthy").length;
  const total = healthRows.length;

  // Fleet health score (0-100)
  const healthScore =
    total > 0
      ? Math.round(((healthyCount + warningCount * 0.5) / total) * 100)
      : 100;

  // Only show agents that need attention
  const attentionAgents = healthRows.filter((r) => r.severity !== "healthy");

  return (
    <div className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] overflow-hidden">
      {/* Header with health score */}
      <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Fleet Health</span>
        </div>
        <div className="flex items-center gap-3">
          <HealthPill severity="critical" count={criticalCount} />
          <HealthPill severity="warning" count={warningCount} />
          <HealthPill severity="healthy" count={healthyCount} />
        </div>
      </div>

      {/* Health score bar */}
      <div className="px-5 py-4 border-b border-border/30">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Fleet Health Score</span>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              healthScore >= 90
                ? "text-sage-ink"
                : healthScore >= 70
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400",
            )}
          >
            {healthScore}%
          </span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
          {criticalCount > 0 && (
            <div
              className="bg-red-500 h-full"
              style={{ width: `${(criticalCount / total) * 100}%` }}
            />
          )}
          {warningCount > 0 && (
            <div
              className="bg-amber-500 h-full"
              style={{ width: `${(warningCount / total) * 100}%` }}
            />
          )}
          {healthyCount > 0 && (
            <div
              className="bg-[#A4BD95] h-full"
              style={{ width: `${(healthyCount / total) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Agents needing attention */}
      {attentionAgents.length > 0 ? (
        <div className="divide-y divide-border/30">
          {attentionAgents.slice(0, 8).map((row) => (
            <Link
              key={row.agent.id}
              to={agentUrl(row.agent)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors no-underline text-inherit"
            >
              <SeverityIcon severity={row.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Identity name={row.agent.name} size="xs" />
                  <span className="text-xs text-muted-foreground truncate">
                    {row.reasons[0]}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {row.recentFailures > 0 && (
                  <span className="text-[11px] text-destructive tabular-nums flex items-center gap-0.5">
                    <XCircle className="h-3 w-3" />
                    {row.recentFailures}
                  </span>
                )}
                {row.lastRunAt && (
                  <span className="text-[11px] text-muted-foreground">
                    {relativeTime(row.lastRunAt)}
                  </span>
                )}
              </div>
            </Link>
          ))}
          {attentionAgents.length > 8 && (
            <div className="px-4 py-2 text-xs text-muted-foreground text-center">
              +{attentionAgents.length - 8} more agents need attention
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-6 text-center">
          <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">All agents operating normally</p>
        </div>
      )}
    </div>
  );
}

/* ---- Sub-components ---- */

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "critical") {
    return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  }
  if (severity === "warning") {
    return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
  }
  return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
}

function HealthPill({ severity, count }: { severity: Severity; count: number }) {
  if (count === 0) return null;

  const colors = {
    critical: "bg-red-500/10 text-red-600 dark:text-red-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    healthy: "bg-[#A4BD95]/10 text-sage-ink",
  };

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums", colors[severity])}>
      {count} {severity}
    </span>
  );
}
