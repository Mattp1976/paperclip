import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  Clock,
  Database,
  FileText,
  Lightbulb,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { Agent, HeartbeatRun } from "@mattparrytfc/shared";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  source: "manual" | "auto_extracted" | "feedback" | "approval";
  confidence: number; // 0-1
  createdAt: string;
  updatedAt: string;
  runId?: string;
  tags: string[];
}

interface LearningSignal {
  id: string;
  type: "approval_accepted" | "approval_rejected" | "run_succeeded" | "run_failed" | "feedback" | "performance";
  description: string;
  timestamp: string;
  impact: "positive" | "negative" | "neutral";
  runId?: string;
  detail?: string;
}

interface PerformanceTrend {
  period: string;
  successRate: number;
  avgDuration: number;
  totalRuns: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString();
}

function confidenceBar(confidence: number) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? "bg-green-600" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 rounded-full bg-muted/30 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Build simulated memory from real run data                          */
/* ------------------------------------------------------------------ */

function buildMemoryFromRuns(
  runs: HeartbeatRun[] | undefined,
  agent: Agent
): { memories: MemoryEntry[]; signals: LearningSignal[]; trends: PerformanceTrend[] } {
  const memories: MemoryEntry[] = [];
  const signals: LearningSignal[] = [];

  // Extract learning signals from runs
  if (runs) {
    let succeeded = 0;
    let failed = 0;
    let totalDuration = 0;

    for (const run of runs.slice(0, 20)) {
      const status = String(run.status ?? "");
      const createdAt = String(run.createdAt ?? new Date().toISOString());
      const runId = String(run.id ?? "");

      if (status === "succeeded") {
        succeeded++;
        signals.push({
          id: `sig_${runId}_ok`,
          type: "run_succeeded",
          description: "Run completed successfully",
          timestamp: createdAt,
          impact: "positive",
          runId,
        });
      } else if (status === "failed" || status === "error") {
        failed++;
        const stderr = run.stderrExcerpt as string | null;
        signals.push({
          id: `sig_${runId}_fail`,
          type: "run_failed",
          description: "Run failed or errored",
          timestamp: createdAt,
          impact: "negative",
          runId,
          detail: stderr?.slice(0, 100) ?? undefined,
        });
      }

      // Duration tracking
      const startedAt = run.startedAt as string | null;
      const finishedAt = run.finishedAt as string | null;
      if (startedAt && finishedAt) {
        totalDuration += new Date(finishedAt).getTime() - new Date(startedAt).getTime();
      }
    }

    const total = succeeded + failed;
    const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 0;

    // Auto-generate memory entries from patterns
    if (total > 0) {
      memories.push({
        id: "mem_success_rate",
        key: "Overall Success Rate",
        value: `${successRate}% across ${total} recent runs`,
        source: "auto_extracted",
        confidence: Math.min(total / 20, 1),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ["performance", "aggregate"],
      });
    }

    if (failed > 0) {
      memories.push({
        id: "mem_failure_pattern",
        key: "Failure Pattern",
        value: `${failed} failures in last ${total} runs — review error logs for common causes`,
        source: "auto_extracted",
        confidence: 0.7,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ["reliability", "attention"],
      });
    }

    if (totalDuration > 0 && total > 0) {
      const avgSec = Math.round(totalDuration / total / 1000);
      memories.push({
        id: "mem_avg_duration",
        key: "Average Run Duration",
        value: avgSec > 60 ? `${Math.round(avgSec / 60)}m ${avgSec % 60}s` : `${avgSec}s`,
        source: "auto_extracted",
        confidence: Math.min(total / 10, 1),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ["performance", "timing"],
      });
    }
  }

  // Agent identity memories
  if (agent.title) {
    memories.unshift({
      id: "mem_role",
      key: "Role Identity",
      value: `${agent.title} — ${agent.capabilities?.slice(0, 100) ?? "General purpose"}`,
      source: "manual",
      confidence: 1,
      createdAt: agent.createdAt?.toString() ?? new Date().toISOString(),
      updatedAt: agent.updatedAt?.toString() ?? new Date().toISOString(),
      tags: ["identity", "core"],
    });
  }

  // Build weekly trend data
  const trends: PerformanceTrend[] = [];
  if (runs && runs.length > 0) {
    const weeks = new Map<string, { success: number; fail: number; duration: number }>();
    for (const run of runs) {
      const d = new Date(String(run.createdAt ?? ""));
      const weekKey = `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleString("default", { month: "short" })}`;
      const entry = weeks.get(weekKey) ?? { success: 0, fail: 0, duration: 0 };
      if (String(run.status) === "succeeded") entry.success++;
      else entry.fail++;
      const s = run.startedAt as string | null;
      const f = run.finishedAt as string | null;
      if (s && f) entry.duration += new Date(f).getTime() - new Date(s).getTime();
      weeks.set(weekKey, entry);
    }
    for (const [period, data] of weeks) {
      const total = data.success + data.fail;
      trends.push({
        period,
        successRate: total > 0 ? Math.round((data.success / total) * 100) : 0,
        avgDuration: total > 0 ? Math.round(data.duration / total / 1000) : 0,
        totalRuns: total,
      });
    }
  }

  return { memories, signals: signals.slice(0, 15), trends: trends.slice(0, 6) };
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function MemoryCard({ entry }: { entry: MemoryEntry }) {
  const sourceColor = {
    manual: "bg-blue-500/10 text-blue-400",
    auto_extracted: "bg-green-600/10 text-green-400",
    feedback: "bg-purple-500/10 text-purple-400",
    approval: "bg-amber-500/10 text-amber-400",
  }[entry.source];

  return (
    <div className="border border-border rounded-lg p-3 bg-card hover:bg-muted/10 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-green-600/10 text-green-400 shrink-0 mt-0.5">
          <Brain className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{entry.key}</span>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", sourceColor)}>
              {entry.source.replace("_", " ")}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{entry.value}</p>
          <div className="flex items-center gap-3 mt-2">
            {confidenceBar(entry.confidence)}
            <span className="text-[10px] text-muted-foreground">{formatTimestamp(entry.updatedAt)}</span>
            {entry.tags.map((tag) => (
              <span key={tag} className="text-[9px] bg-muted text-muted-foreground px-1 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: LearningSignal }) {
  const impactIcon = {
    positive: <TrendingUp className="h-3.5 w-3.5 text-green-400" />,
    negative: <RotateCcw className="h-3.5 w-3.5 text-red-400" />,
    neutral: <Lightbulb className="h-3.5 w-3.5 text-amber-400" />,
  }[signal.impact];

  const typeLabel = {
    approval_accepted: "Approval Accepted",
    approval_rejected: "Approval Rejected",
    run_succeeded: "Run Succeeded",
    run_failed: "Run Failed",
    feedback: "Feedback Received",
    performance: "Performance Signal",
  }[signal.type];

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0 hover:bg-muted/10 transition-colors">
      {impactIcon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground">{typeLabel}</span>
          {signal.detail && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{signal.detail}</span>
          )}
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">{formatTimestamp(signal.timestamp)}</span>
    </div>
  );
}

function TrendRow({ trend }: { trend: PerformanceTrend }) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 border-b border-border last:border-b-0">
      <span className="text-xs font-medium text-foreground w-20">{trend.period}</span>
      <div className="flex-1 flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-muted/30 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              trend.successRate >= 80 ? "bg-green-600" : trend.successRate >= 50 ? "bg-amber-500" : "bg-red-500"
            )}
            style={{ width: `${trend.successRate}%` }}
          />
        </div>
        <span className="text-[11px] font-mono text-muted-foreground w-8">{trend.successRate}%</span>
      </div>
      <span className="text-[10px] text-muted-foreground w-16 text-right">{trend.totalRuns} runs</span>
      <span className="text-[10px] text-muted-foreground w-12 text-right">{trend.avgDuration}s avg</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AgentMemoryPanel({
  agentId,
  companyId,
}: {
  agentId: string;
  companyId: string;
}) {
  const { data: agent } = useQuery({
    queryKey: queryKeys.agents.detail(agentId),
    queryFn: () => agentsApi.get(agentId as `${string}_${string}`),
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(companyId, agentId),
    queryFn: () => heartbeatsApi.list(companyId, agentId),
  });

  const { memories, signals, trends } = useMemo(() => {
    if (!agent) return { memories: [], signals: [], trends: [] };
    return buildMemoryFromRuns(runs, agent);
  }, [agent, runs]);

  if (!agent) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
    ))}</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="border border-border rounded-xl p-5 bg-gradient-to-br from-card to-green-600/5">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-green-600/10 border border-green-600/20 text-green-400">
            <Brain className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-foreground">Agent Memory & Learning</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Persistent knowledge extracted from runs, approvals, and feedback.
              Memory accumulates over time, enabling the agent to improve its performance
              and avoid repeating mistakes.
            </p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs text-muted-foreground">{memories.length} memories</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs text-muted-foreground">{signals.length} signals</span>
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs text-muted-foreground">{trends.length} periods tracked</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Knowledge Store */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-green-400" />
          <h3 className="text-sm font-semibold text-foreground">Knowledge Store</h3>
          <span className="text-[10px] bg-green-600/10 text-green-400 px-1.5 py-0.5 rounded font-medium">
            {memories.length} entries
          </span>
        </div>
        <div className="space-y-2">
          {memories.map((entry) => (
            <MemoryCard key={entry.id} entry={entry} />
          ))}
          {memories.length === 0 && (
            <div className="text-xs text-muted-foreground/70 italic py-6 text-center border border-dashed border-border/30 dark:border-border rounded-xl">
              No memories yet — knowledge will be extracted from agent runs automatically
            </div>
          )}
        </div>
      </div>

      {/* Learning Signals */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-foreground">Learning Signals</h3>
          <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-medium">
            {signals.length} signals
          </span>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          {signals.map((signal) => (
            <SignalRow key={signal.id} signal={signal} />
          ))}
          {signals.length === 0 && (
            <div className="text-xs text-muted-foreground italic py-6 text-center">
              No learning signals yet
            </div>
          )}
        </div>
      </div>

      {/* Performance Trends */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground">Performance Trends</h3>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-4 px-3 py-2 bg-muted/30 border-b border-border text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
            <span className="w-20">Period</span>
            <span className="flex-1">Success Rate</span>
            <span className="w-16 text-right">Runs</span>
            <span className="w-12 text-right">Avg Time</span>
          </div>
          {trends.map((trend) => (
            <TrendRow key={trend.period} trend={trend} />
          ))}
          {trends.length === 0 && (
            <div className="text-xs text-muted-foreground italic py-6 text-center">
              No trend data yet — performance tracking begins after the first run
            </div>
          )}
        </div>
      </div>

      {/* Future: Feedback Loop */}
      <div className="border border-dashed border-border rounded-xl p-6 text-center">
        <MessageSquare className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm font-medium text-muted-foreground">Feedback Loop</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Coming soon — approval outcomes and human feedback will automatically refine
          agent instructions, creating a closed-loop learning system that improves
          with every interaction.
        </p>
      </div>
    </div>
  );
}
