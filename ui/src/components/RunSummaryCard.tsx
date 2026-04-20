import { useMemo, useState } from "react";
import { cn, formatTokens, visibleRunCostUsd } from "../lib/utils";
import { relativeTime } from "../lib/utils";
import { Identity } from "./Identity";
import { StatusBadge } from "./StatusBadge";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  DollarSign,
  Wrench,
  FileText,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import type { Agent } from "@mattparrytfc/shared";

/* ── Types ─────────────────────────────────────────────────────── */

interface LinkedRun {
  runId: string;
  agentId: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  resultJson: Record<string, unknown> | null;
  usageJson: Record<string, unknown> | null;
  createdAt: string;
  transcriptJson?: unknown[] | null;
}

interface RunSummaryCardProps {
  runs: LinkedRun[];
  agentMap: Map<string, Agent>;
  className?: string;
  compact?: boolean;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value as Record<string, unknown>;
}

function usageNumber(
  usage: Record<string, unknown> | null,
  ...keys: string[]
) {
  if (!usage) return 0;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return remainSeconds > 0 ? `${minutes}m ${remainSeconds}s` : `${minutes}m`;
}

function countToolCalls(transcriptJson: unknown[] | null | undefined): number {
  if (!Array.isArray(transcriptJson)) return 0;
  return transcriptJson.filter(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as Record<string, unknown>).type === "tool_call",
  ).length;
}

function getResultSummary(
  resultJson: Record<string, unknown> | null,
): { text: string | null; truncated: boolean } {
  if (!resultJson) return { text: null, truncated: false };
  const result =
    typeof resultJson.result === "string"
      ? resultJson.result
      : typeof resultJson.summary === "string"
        ? resultJson.summary
        : typeof resultJson.output === "string"
          ? resultJson.output
          : null;
  return { text: result, truncated: (result?.length ?? 0) > 300 };
}

/* ── Single run summary row ────────────────────────────────────── */

function RunRow({
  run,
  agentMap,
  compact,
}: {
  run: LinkedRun;
  agentMap: Map<string, Agent>;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const agent = agentMap.get(run.agentId);
  const usage = asRecord(run.usageJson);
  const result = asRecord(run.resultJson);
  const cost = visibleRunCostUsd(usage, result);
  const totalTokens =
    usageNumber(usage, "inputTokens", "input_tokens") +
    usageNumber(usage, "outputTokens", "output_tokens");
  const toolCalls = countToolCalls(run.transcriptJson);
  const { text: resultText, truncated } = getResultSummary(result);
  const displayText = (!expanded && truncated && resultText) ? resultText.slice(0, 297) + "..." : resultText;
  const durationMs =
    run.startedAt && run.finishedAt
      ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
      : null;

  const isSuccess =
    run.status === "completed" ||
    run.status === "success" ||
    run.status === "done";
  const isError = run.status === "error" || run.status === "failed";
  const isRunning =
    run.status === "running" ||
    run.status === "in_progress" ||
    run.status === "active";

  return (
    <div
      className={cn(
        "group rounded-lg border transition-colors",
        isSuccess && "border-[#8FA781]/20 bg-[#8FA781]/5",
        isError && "border-red-500/20 bg-red-500/5",
        isRunning && "border-cyan-500/20 bg-cyan-500/5",
        !isSuccess && !isError && !isRunning && "border-border bg-card",
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Status icon */}
        {isSuccess && (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#5E7259]" />
        )}
        {isError && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
        {isRunning && (
          <div className="relative h-4 w-4 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400 opacity-40" />
            <span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500">
              <Zap className="h-2.5 w-2.5 text-white" />
            </span>
          </div>
        )}
        {!isSuccess && !isError && !isRunning && (
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        {/* Agent identity */}
        {agent && <Identity name={agent.name} size="sm" />}
        <span className="text-xs font-medium truncate">
          {agent?.name ?? run.agentId.slice(0, 8)}
        </span>

        {/* Status badge */}
        <StatusBadge status={run.status} />

        {/* Timestamp */}
        <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
          {relativeTime(run.createdAt)}
        </span>
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-4 border-t border-border/50 px-3 py-2 flex-wrap">
        {durationMs != null && durationMs > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(durationMs)}</span>
          </div>
        )}

        {totalTokens > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" />
            <span>{formatTokens(totalTokens)} tokens</span>
          </div>
        )}

        {cost > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3" />
            <span>${cost.toFixed(4)}</span>
          </div>
        )}

        {toolCalls > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Wrench className="h-3 w-3" />
            <span>
              {toolCalls} tool call{toolCalls !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Result text — full, expandable */}
      {!compact && displayText && (
        <div className="border-t border-border/50 px-3 py-2">
          <div className="flex items-start gap-1.5">
            <FileText className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {displayText}
              </p>
              {truncated && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[10px] text-primary hover:underline mt-1"
                >
                  {expanded ? "Show less" : "Show full output"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {isError && result && (
        <div className="border-t border-red-500/20 px-3 py-2">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-red-500" />
            <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
              {typeof result.error === "string"
                ? result.error
                : typeof result.message === "string"
                  ? result.message
                  : "Run failed"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main RunSummaryCard ───────────────────────────────────────── */

export function RunSummaryCard({
  runs,
  agentMap,
  className,
  compact,
}: RunSummaryCardProps) {
  if (!runs || runs.length === 0) return null;

  // Aggregate stats
  const stats = useMemo(() => {
    let totalCost = 0;
    let totalTokens = 0;
    let totalDuration = 0;
    let succeeded = 0;
    let failed = 0;
    let running = 0;

    for (const run of runs) {
      const usage = asRecord(run.usageJson);
      const result = asRecord(run.resultJson);
      totalCost += visibleRunCostUsd(usage, result);
      totalTokens +=
        usageNumber(usage, "inputTokens", "input_tokens") +
        usageNumber(usage, "outputTokens", "output_tokens");
      if (run.startedAt && run.finishedAt) {
        const dur = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
        if (dur > 0) totalDuration += dur;
      }

      const s = run.status;
      if (s === "completed" || s === "success" || s === "done") succeeded++;
      else if (s === "error" || s === "failed") failed++;
      else if (s === "running" || s === "in_progress" || s === "active")
        running++;
    }

    return { totalCost, totalTokens, totalDuration, succeeded, failed, running };
  }, [runs]);

  const showAggregate = runs.length > 1;
  const displayRuns = compact ? runs.slice(0, 3) : runs.slice(0, 10);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Aggregate summary bar (when multiple runs) */}
      {showAggregate && (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-2.5 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground">
            {runs.length} runs
          </span>

          {stats.succeeded > 0 && (
            <div className="flex items-center gap-1 text-xs text-[#5E7259] dark:text-[#C5D4BC]">
              <CheckCircle2 className="h-3 w-3" />
              <span>{stats.succeeded} succeeded</span>
            </div>
          )}

          {stats.failed > 0 && (
            <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <XCircle className="h-3 w-3" />
              <span>{stats.failed} failed</span>
            </div>
          )}

          {stats.running > 0 && (
            <div className="flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400">
              <Zap className="h-3 w-3" />
              <span>{stats.running} running</span>
            </div>
          )}

          {stats.totalCost > 0 && (
            <span className="ml-auto text-xs font-medium tabular-nums">
              ${stats.totalCost.toFixed(4)}
            </span>
          )}

          {stats.totalDuration > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDuration(stats.totalDuration)}
            </span>
          )}
        </div>
      )}

      {/* Individual run cards */}
      <div className="space-y-2">
        {displayRuns.map((run) => (
          <RunRow
            key={run.runId}
            run={run}
            agentMap={agentMap}
            compact={compact}
          />
        ))}
      </div>

      {runs.length > displayRuns.length && (
        <p className="text-center text-xs text-muted-foreground">
          +{runs.length - displayRuns.length} more runs
        </p>
      )}
    </div>
  );
}
