import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { costsApi } from "../api/costs";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn, friendlyCost, agentUrl } from "../lib/utils";
import { Identity } from "./Identity";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Zap,
} from "lucide-react";
import type { Agent, HeartbeatRun, CostByAgent } from "@mattparrytfc/shared";

/* ---- Types ---- */

interface LeaderboardEntry {
  agent: Agent;
  totalRuns: number;
  succeeded: number;
  failed: number;
  successRate: number;
  costCents: number;
  costPerRun: number;
  avgDurationSec: number;
  score: number; // composite ranking score 0-100
}

/* ---- Helpers ---- */

function buildLeaderboard(
  agents: Agent[],
  runs: HeartbeatRun[],
  costs: CostByAgent[],
): LeaderboardEntry[] {
  const costMap = new Map<string, CostByAgent>();
  for (const c of costs) costMap.set(c.agentId, c);

  const runsByAgent = new Map<string, HeartbeatRun[]>();
  for (const r of runs) {
    const existing = runsByAgent.get(r.agentId) ?? [];
    existing.push(r);
    runsByAgent.set(r.agentId, existing);
  }

  const entries: LeaderboardEntry[] = [];

  for (const agent of agents) {
    if (agent.status === "terminated") continue;

    const agentRuns = runsByAgent.get(agent.id) ?? [];
    const last14d = agentRuns.filter(
      (r) => Date.now() - new Date(r.createdAt).getTime() < 14 * 24 * 60 * 60 * 1000,
    );

    const succeeded = last14d.filter((r) => r.status === "succeeded").length;
    const failed = last14d.filter(
      (r) => r.status === "failed" || r.status === "timed_out",
    ).length;
    const totalRuns = last14d.length;
    const successRate = totalRuns > 0 ? (succeeded / totalRuns) * 100 : 0;

    const cost = costMap.get(agent.id);
    const costCents = cost?.costCents ?? 0;
    const costPerRun = totalRuns > 0 ? costCents / totalRuns : 0;

    // Average duration
    let totalDurSec = 0;
    let completedWithDur = 0;
    for (const r of last14d) {
      if (r.startedAt && r.finishedAt) {
        totalDurSec +=
          (new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000;
        completedWithDur++;
      }
    }
    const avgDurationSec = completedWithDur > 0 ? totalDurSec / completedWithDur : 0;

    // Composite score: weighted combination
    // 40% success rate, 30% throughput (normalized), 30% cost efficiency (inverted)
    const successScore = successRate;
    const throughputScore = Math.min(totalRuns / 20, 1) * 100; // 20 runs in 14d = 100%
    // Cost efficiency: lower cost per run is better
    const costEfficiency = costPerRun > 0 ? Math.max(0, 100 - costPerRun / 5) : 100;

    const score = Math.round(
      successScore * 0.4 + throughputScore * 0.3 + costEfficiency * 0.3,
    );

    entries.push({
      agent,
      totalRuns,
      succeeded,
      failed,
      successRate,
      costCents,
      costPerRun,
      avgDurationSec,
      score: Math.min(100, Math.max(0, score)),
    });
  }

  // Sort by score descending
  entries.sort((a, b) => b.score - a.score);
  return entries;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

/* ---- Component ---- */

export function AgentLeaderboard({ companyId }: { companyId: string }) {
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(companyId),
    queryFn: () => heartbeatsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: costs } = useQuery({
    queryKey: ["costs", "by-agent", companyId],
    queryFn: () => costsApi.byAgent(companyId),
    enabled: !!companyId,
  });

  const leaderboard = useMemo(
    () => buildLeaderboard(agents ?? [], runs ?? [], costs ?? []),
    [agents, runs, costs],
  );

  const topPerformers = leaderboard.slice(0, 5);
  const bottomPerformers = leaderboard
    .filter((e) => e.totalRuns > 0)
    .slice(-3)
    .reverse();

  return (
    <div className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/30 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Agent Leaderboard</span>
        <span className="text-xs text-muted-foreground ml-auto">Last 14 days</span>
      </div>

      {/* Top Performers */}
      {topPerformers.length > 0 && (
        <div>
          <div className="px-4 py-2 bg-[#A4BD95]/5 border-b border-border/30">
            <span className="text-[11px] font-medium text-sage-ink flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Top Performers
            </span>
          </div>
          <div className="divide-y divide-border/30">
            {topPerformers.map((entry, i) => (
              <LeaderboardRow key={entry.agent.id} entry={entry} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Bottom Performers */}
      {bottomPerformers.length > 0 && (
        <div>
          <div className="px-4 py-2 bg-destructive/5 border-b border-border/30">
            <span className="text-[11px] font-medium text-destructive flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              Needs Attention
            </span>
          </div>
          <div className="divide-y divide-border/30">
            {bottomPerformers.map((entry) => (
              <LeaderboardRow
                key={entry.agent.id}
                entry={entry}
                rank={leaderboard.findIndex((e) => e.agent.id === entry.agent.id) + 1}
              />
            ))}
          </div>
        </div>
      )}

      {leaderboard.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No agent data available yet.
        </div>
      )}
    </div>
  );
}

/* ---- Row ---- */

function LeaderboardRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const medalColors: Record<number, string> = {
    1: "text-yellow-500",
    2: "text-gray-400",
    3: "text-amber-700 dark:text-amber-600",
  };

  return (
    <Link
      to={agentUrl(entry.agent)}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors no-underline text-inherit"
    >
      {/* Rank */}
      <span
        className={cn(
          "w-5 text-center text-xs font-bold tabular-nums",
          medalColors[rank] ?? "text-muted-foreground",
        )}
      >
        {rank}
      </span>

      {/* Agent name + role */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Identity name={entry.agent.name} size="xs" />
          <span className="text-[11px] text-muted-foreground truncate">
            {entry.agent.role}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Success rate */}
        <span
          className={cn(
            "text-[11px] tabular-nums font-medium",
            entry.successRate >= 90
              ? "text-sage-ink"
              : entry.successRate >= 70
                ? "text-amber-600 dark:text-amber-400"
                : "text-red-600 dark:text-red-400",
          )}
        >
          {entry.totalRuns > 0 ? `${entry.successRate.toFixed(0)}%` : "—"}
        </span>

        {/* Run count */}
        <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-0.5">
          <Zap className="h-3 w-3" />
          {entry.totalRuns}
        </span>

        {/* Cost */}
        <span className="text-[11px] text-muted-foreground tabular-nums w-14 text-right">
          {friendlyCost(entry.costCents / 100)}
        </span>

        {/* Score badge */}
        <span
          className={cn(
            "w-8 text-center text-[11px] font-bold tabular-nums rounded px-1 py-0.5",
            entry.score >= 80
              ? "bg-[#A4BD95]/10 text-sage-ink"
              : entry.score >= 50
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400",
          )}
        >
          {entry.score}
        </span>
      </div>
    </Link>
  );
}
