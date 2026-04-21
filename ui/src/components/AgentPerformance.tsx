import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { friendlyCost, relativeTime } from "../lib/utils";
import {
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Lightbulb,
  Activity,
} from "lucide-react";
import type { HeartbeatRun } from "@mattparrytfc/shared";

/* ── helpers ──────────────────────────────────────────────────── */

function statusIcon(s: string) {
  if (s === "succeeded") return <CheckCircle2 className="h-4 w-4 text-sage-ink" />;
  if (s === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  if (s === "cancelled") return <Minus className="h-4 w-4 text-zinc-400" />;
  if (s === "timed_out") return <Clock className="h-4 w-4 text-amber-500" />;
  return <Activity className="h-4 w-4 text-zinc-400" />;
}

function durationMs(run: HeartbeatRun): number | null {
  if (!run.startedAt || !run.finishedAt) return null;
  return new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
}

function costCents(run: HeartbeatRun): number {
  const u = run.usageJson as Record<string, unknown> | null;
  if (!u) return 0;
  if (typeof u.cost_cents === "number") return u.cost_cents;
  if (typeof u.costCents === "number") return u.costCents;
  if (typeof u.cost_usd === "number") return Math.round(u.cost_usd * 100);
  if (typeof u.costUsd === "number") return Math.round(u.costUsd * 100);
  return 0;
}

function tokenCount(run: HeartbeatRun): { input: number; output: number } {
  const u = run.usageJson as Record<string, unknown> | null;
  if (!u) return { input: 0, output: 0 };
  return {
    input: (typeof u.input_tokens === "number" ? u.input_tokens : 0) as number,
    output: (typeof u.output_tokens === "number" ? u.output_tokens : 0) as number,
  };
}

interface DayBucket {
  date: string;
  succeeded: number;
  failed: number;
  other: number;
  totalCostCents: number;
  avgDurationMs: number;
}

function bucketByDay(runs: HeartbeatRun[]): DayBucket[] {
  const map = new Map<string, { s: number; f: number; o: number; cost: number; dur: number[]; }>();
  for (const r of runs) {
    const d = new Date(r.createdAt).toISOString().slice(0, 10);
    const bucket = map.get(d) ?? { s: 0, f: 0, o: 0, cost: 0, dur: [] };
    if (r.status === "succeeded") bucket.s++;
    else if (r.status === "failed") bucket.f++;
    else bucket.o++;
    bucket.cost += costCents(r);
    const dur = durationMs(r);
    if (dur !== null) bucket.dur.push(dur);
    map.set(d, bucket);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      succeeded: b.s,
      failed: b.f,
      other: b.o,
      totalCostCents: b.cost,
      avgDurationMs: b.dur.length ? b.dur.reduce((a, c) => a + c, 0) / b.dur.length : 0,
    }));
}

/* ── Insight engine ──────────────────────────────────────────── */

interface Insight {
  kind: "success" | "warning" | "suggestion";
  title: string;
  body: string;
}

function deriveInsights(runs: HeartbeatRun[]): Insight[] {
  if (runs.length === 0) return [];
  const insights: Insight[] = [];

  const succeeded = runs.filter((r) => r.status === "succeeded").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const rate = succeeded / runs.length;

  // Success rate insight
  if (rate >= 0.9) {
    insights.push({
      kind: "success",
      title: "High reliability",
      body: `${Math.round(rate * 100)}% success rate across ${runs.length} runs. This agent is performing well.`,
    });
  } else if (rate < 0.6 && runs.length >= 5) {
    insights.push({
      kind: "warning",
      title: "Low success rate",
      body: `Only ${Math.round(rate * 100)}% of runs succeed. Consider reviewing the agent's instructions or reducing task complexity.`,
    });
  }

  // Failure pattern — consecutive failures
  let maxConsecFail = 0;
  let curConsecFail = 0;
  for (const r of runs) {
    if (r.status === "failed") { curConsecFail++; maxConsecFail = Math.max(maxConsecFail, curConsecFail); }
    else curConsecFail = 0;
  }
  if (maxConsecFail >= 3) {
    insights.push({
      kind: "warning",
      title: "Consecutive failures detected",
      body: `${maxConsecFail} runs failed in a row. The agent may be stuck in an error loop. Consider resetting its session or adjusting configuration.`,
    });
  }

  // Cost trend
  const recentRuns = runs.slice(0, Math.min(10, runs.length));
  const olderRuns = runs.slice(Math.min(10, runs.length), Math.min(20, runs.length));
  if (recentRuns.length >= 5 && olderRuns.length >= 5) {
    const recentAvgCost = recentRuns.reduce((s, r) => s + costCents(r), 0) / recentRuns.length;
    const olderAvgCost = olderRuns.reduce((s, r) => s + costCents(r), 0) / olderRuns.length;
    if (olderAvgCost > 0 && recentAvgCost > olderAvgCost * 1.5) {
      insights.push({
        kind: "warning",
        title: "Cost increasing",
        body: `Recent runs cost ${friendlyCost(recentAvgCost / 100)} on average vs ${friendlyCost(olderAvgCost / 100)} previously. The agent may be using more tokens per run.`,
      });
    } else if (olderAvgCost > 0 && recentAvgCost < olderAvgCost * 0.7) {
      insights.push({
        kind: "success",
        title: "Cost decreasing",
        body: `Recent runs cost ${friendlyCost(recentAvgCost / 100)} on average, down from ${friendlyCost(olderAvgCost / 100)}. The agent is becoming more efficient.`,
      });
    }
  }

  // Timeout pattern
  const timedOut = runs.filter((r) => r.status === "timed_out").length;
  if (timedOut >= 3) {
    insights.push({
      kind: "suggestion",
      title: "Frequent timeouts",
      body: `${timedOut} runs timed out. Consider increasing the heartbeat interval or simplifying the task scope.`,
    });
  }

  // Error diversity
  const errorMsgs = runs.filter((r) => r.error).map((r) => r.error!);
  const uniqueErrors = new Set(errorMsgs.map((e) => e.slice(0, 80)));
  if (uniqueErrors.size === 1 && errorMsgs.length >= 3) {
    insights.push({
      kind: "suggestion",
      title: "Repeated error pattern",
      body: `All ${errorMsgs.length} failures share the same error. Fix the root cause: "${errorMsgs[0]?.slice(0, 120)}"`,
    });
  }

  // Improvement suggestion
  if (failed > 0 && rate < 0.8) {
    insights.push({
      kind: "suggestion",
      title: "Improvement opportunity",
      body: "Consider adding more specific instructions, reducing task scope, or switching to a more capable model tier for this agent.",
    });
  }

  return insights;
}

/* ── Mini bar chart (pure CSS, no deps) ──────────────────────── */

function MiniDayChart({ buckets }: { buckets: DayBucket[] }) {
  if (buckets.length === 0) return null;
  const maxRuns = Math.max(...buckets.map((b) => b.succeeded + b.failed + b.other), 1);
  const last14 = buckets.slice(-14);

  return (
    <div className="flex items-end gap-px h-24">
      {last14.map((b) => {
        const total = b.succeeded + b.failed + b.other;
        const hPx = Math.max(4, Math.round((total / maxRuns) * 88));
        const successPct = total > 0 ? (b.succeeded / total) * 100 : 0;
        return (
          <div key={b.date} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${hPx}px`,
                background: `linear-gradient(to top, #10b981 ${successPct}%, #ef4444 ${successPct}%)`,
                opacity: 0.85,
              }}
              title={`${b.date}: ${b.succeeded} ok, ${b.failed} fail, ${b.other} other`}
            />
            <span className="text-[9px] text-muted-foreground truncate w-full text-center">
              {b.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Stat card ───────────────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  sub,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
        {icon}
        {label}
        {trend === "up" && <TrendingUp className="h-3 w-3 text-sage-ink ml-auto" />}
        {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive ml-auto" />}
        {trend === "flat" && <Minus className="h-3 w-3 text-zinc-400 ml-auto" />}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ── Insight card ────────────────────────────────────────────── */

function InsightCard({ insight }: { insight: Insight }) {
  const iconMap = {
    success: <CheckCircle2 className="h-4 w-4 text-sage-ink mt-0.5 shrink-0" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />,
    suggestion: <Lightbulb className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />,
  };
  const borderMap = {
    success: "border-[#8FA781]/20",
    warning: "border-amber-500/20",
    suggestion: "border-blue-500/20",
  };
  return (
    <div className={`rounded-lg border ${borderMap[insight.kind]} bg-card p-3 flex gap-2`}>
      {iconMap[insight.kind]}
      <div>
        <div className="text-sm font-medium">{insight.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{insight.body}</div>
      </div>
    </div>
  );
}

/* ── Recent failures table ───────────────────────────────────── */

function RecentFailures({ runs }: { runs: HeartbeatRun[] }) {
  const failures = runs.filter((r) => r.status === "failed" || r.status === "timed_out").slice(0, 8);
  if (failures.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No recent failures — nice work!
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {failures.map((r) => (
        <div
          key={r.id}
          className="flex items-start gap-2 rounded-md border border-border/50 bg-card/50 px-3 py-2 text-sm"
        >
          {statusIcon(r.status)}
          <div className="min-w-0 flex-1">
            <div className="font-mono text-xs truncate text-muted-foreground">{r.id.slice(0, 8)}</div>
            {r.error && (
              <div className="text-xs text-destructive mt-0.5 line-clamp-2">{r.error}</div>
            )}
          </div>
          <div className="text-xs text-muted-foreground shrink-0">
            {relativeTime(r.createdAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────── */

interface AgentPerformanceProps {
  agentId: string;
  companyId: string;
}

export function AgentPerformance({ agentId, companyId }: AgentPerformanceProps) {
  const { data: allRuns, isLoading } = useQuery({
    queryKey: [...queryKeys.heartbeats(companyId, agentId), "perf"],
    queryFn: () => heartbeatsApi.list(companyId, agentId, 100),
    staleTime: 30_000,
  });

  const runs = useMemo(() => {
    if (!allRuns) return [];
    return [...allRuns].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [allRuns]);

  const stats = useMemo(() => {
    if (runs.length === 0)
      return { total: 0, succeeded: 0, failed: 0, rate: 0, totalCost: 0, avgDur: 0, totalTokens: 0 };
    const succeeded = runs.filter((r) => r.status === "succeeded").length;
    const failed = runs.filter((r) => r.status === "failed").length;
    const totalCost = runs.reduce((s, r) => s + costCents(r), 0);
    const durations = runs.map(durationMs).filter((d): d is number => d !== null);
    const avgDur = durations.length ? durations.reduce((a, c) => a + c, 0) / durations.length : 0;
    const totalTokens = runs.reduce((s, r) => {
      const t = tokenCount(r);
      return s + t.input + t.output;
    }, 0);
    return { total: runs.length, succeeded, failed, rate: succeeded / runs.length, totalCost, avgDur, totalTokens };
  }, [runs]);

  const buckets = useMemo(() => bucketByDay(runs), [runs]);
  const insights = useMemo(() => deriveInsights(runs), [runs]);

  // Trend: compare recent 10 vs prior 10 success rate
  const trend = useMemo<"up" | "down" | "flat">(() => {
    if (runs.length < 10) return "flat";
    const recent = runs.slice(0, 10);
    const prior = runs.slice(10, 20);
    if (prior.length < 5) return "flat";
    const recentRate = recent.filter((r) => r.status === "succeeded").length / recent.length;
    const priorRate = prior.filter((r) => r.status === "succeeded").length / prior.length;
    if (recentRate > priorRate + 0.1) return "up";
    if (recentRate < priorRate - 0.1) return "down";
    return "flat";
  }, [runs]);

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="max-w-4xl">
        <div className="rounded-xl border border-dashed border-border/30 dark:border-border/60 bg-stone-50/50 dark:bg-card/30 p-10 text-center">
          <BarChart3 className="h-10 w-10 mx-auto text-stone-400 dark:text-muted-foreground/40 mb-3" strokeWidth={1.5} />
          <h3 className="text-sm font-medium text-muted-foreground mb-1">No runs yet</h3>
          <p className="text-xs text-muted-foreground/60">
            Performance insights will appear after the agent completes a few runs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Success Rate"
          value={`${Math.round(stats.rate * 100)}%`}
          sub={`${stats.succeeded} of ${stats.total} runs`}
          trend={trend}
        />
        <StatCard
          icon={<XCircle className="h-3.5 w-3.5" />}
          label="Failures"
          value={String(stats.failed)}
          sub={stats.failed > 0 ? `${Math.round((stats.failed / stats.total) * 100)}% of runs` : "Clean record"}
        />
        <StatCard
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="Total Cost"
          value={friendlyCost(stats.totalCost / 100)}
          sub={`~${friendlyCost(stats.totalCost / stats.total / 100)} per run`}
        />
        <StatCard
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Avg Duration"
          value={stats.avgDur > 60000 ? `${(stats.avgDur / 60000).toFixed(1)}m` : `${(stats.avgDur / 1000).toFixed(1)}s`}
          sub={`${(stats.totalTokens / 1000).toFixed(0)}k tokens total`}
        />
      </div>

      {/* ── Activity chart ── */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Run Activity (last 14 days)
          </h3>
          <span className="text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-sm bg-[#8FA781] mr-1" /> success
            <span className="inline-block w-2 h-2 rounded-sm bg-destructive ml-2 mr-1" /> failure
          </span>
        </div>
        <MiniDayChart buckets={buckets} />
      </div>

      {/* ── Insights ── */}
      {insights.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
            Insights & Recommendations
          </h3>
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <InsightCard key={i} insight={ins} />
            ))}
          </div>
        </div>
      )}

      {/* ── Recent failures ── */}
      <div>
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          Recent Failures
        </h3>
        <RecentFailures runs={runs} />
      </div>
    </div>
  );
}
