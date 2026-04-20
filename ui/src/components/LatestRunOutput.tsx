/**
 * LatestRunOutput — Shows the most recent run's output front-and-centre
 * on the agent dashboard. No extra clicks to see what an agent produced.
 *
 * Features:
 * - Full result text (not truncated) with expand/collapse
 * - Inline JSON result viewer
 * - Quick stats (duration, tokens, cost, tool calls)
 * - Direct link to full run detail for transcript
 * - Shows last 3 runs with output previews
 */
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { cn, formatTokens, visibleRunCostUsd, relativeTime } from "../lib/utils";
import { MarkdownBody } from "./MarkdownBody";
import { StatusBadge } from "./StatusBadge";
import type { HeartbeatRun } from "@mattparrytfc/shared";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  DollarSign,
  Wrench,
  ChevronDown,
  ChevronUp,
  FileText,
  ExternalLink,
  Terminal,
  Copy,
  Check,
} from "lucide-react";

/* ── Helpers ─────────────────────────────────────────────────── */

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function usageNum(usage: Record<string, unknown> | null, ...keys: string[]) {
  if (!usage) return 0;
  for (const k of keys) {
    const v = usage[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

function fmtDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

// Tool call counting not available on HeartbeatRun (no transcriptJson field).
// We show tool_calls from contextSnapshot if available.
function countToolCalls(run: HeartbeatRun): number {
  const ctx = run.contextSnapshot;
  if (!ctx) return 0;
  const tc = ctx.toolCalls ?? ctx.tool_calls;
  return typeof tc === "number" ? tc : 0;
}

function extractResult(run: HeartbeatRun): { text: string | null; json: Record<string, unknown> | null } {
  const rj = asRecord(run.resultJson);
  if (!rj) return { text: run.stdoutExcerpt?.trim() || null, json: null };

  // Try to get human-readable text from common fields
  const text =
    typeof rj.result === "string" ? rj.result :
    typeof rj.summary === "string" ? rj.summary :
    typeof rj.output === "string" ? rj.output :
    typeof rj.message === "string" ? rj.message :
    null;

  return { text, json: rj };
}

/* ── CopyButton ──────────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ── SingleRunOutput ─────────────────────────────────────────── */

function SingleRunOutput({
  run,
  agentRouteId,
  isLatest,
}: {
  run: HeartbeatRun;
  agentRouteId: string;
  isLatest: boolean;
}) {
  const [expanded, setExpanded] = useState(isLatest);
  const [showJson, setShowJson] = useState(false);

  const usage = asRecord(run.usageJson);
  const result = asRecord(run.resultJson);
  const cost = visibleRunCostUsd(usage, result);
  const totalTokens = usageNum(usage, "inputTokens", "input_tokens") + usageNum(usage, "outputTokens", "output_tokens");
  const toolCalls = countToolCalls(run);
  const durationMs = run.startedAt && run.finishedAt
    ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
    : null;
  const { text: resultText, json: resultJson } = extractResult(run);

  const isLive = run.status === "running" || run.status === "queued";
  const isSuccess = run.status === "succeeded";
  const isError = run.status === "failed" || run.status === "timed_out";
  const hasOutput = Boolean(resultText || resultJson);
  const errorMsg = isError
    ? (typeof result?.error === "string" ? result.error : typeof result?.message === "string" ? result.message : run.error ?? "Run failed")
    : null;

  return (
    <div
      className={cn(
        "rounded-xl border transition-all",
        isLatest && isLive && "border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.08)]",
        isLatest && isSuccess && "border-green-600/20 shadow-sm shadow-black/[0.02]",
        isLatest && isError && "border-red-500/20",
        !isLatest && "border-border/40 dark:border-border",
      )}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-black/[0.02] dark:hover:bg-muted/30 transition-colors rounded-t-xl"
      >
        {/* Status icon */}
        {isLive && (
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400" />
          </span>
        )}
        {isSuccess && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />}
        {isError && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
        {!isLive && !isSuccess && !isError && <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />}

        <StatusBadge status={run.status} />

        <span className={cn(
          "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
          run.invocationSource === "timer" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
            : run.invocationSource === "assignment" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"
            : "bg-muted text-muted-foreground"
        )}>
          {run.invocationSource}
        </span>

        {/* Quick stats inline */}
        <div className="flex items-center gap-3 ml-auto">
          {durationMs != null && durationMs > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {fmtDuration(durationMs)}
            </span>
          )}
          {totalTokens > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {formatTokens(totalTokens)}
            </span>
          )}
          {cost > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              ${cost.toFixed(4)}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{relativeTime(run.createdAt)}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded output section */}
      {expanded && (
        <div className="border-t border-border/30 dark:border-border/50">
          {/* Result text — full, not truncated */}
          {resultText && (
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  <span className="font-medium">Output</span>
                </div>
                <div className="flex items-center gap-2">
                  <CopyButton text={resultText} />
                  {resultJson && (
                    <button
                      onClick={() => setShowJson(!showJson)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Terminal className="h-3 w-3" />
                      {showJson ? "Hide JSON" : "Raw JSON"}
                    </button>
                  )}
                </div>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownBody className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {resultText}
                </MarkdownBody>
              </div>
            </div>
          )}

          {/* Raw JSON view */}
          {showJson && resultJson && (
            <div className="px-4 pb-3">
              <pre className="bg-neutral-950 text-neutral-200 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                {JSON.stringify(resultJson, null, 2)}
              </pre>
            </div>
          )}

          {/* No text result but has JSON */}
          {!resultText && resultJson && (
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Terminal className="h-3 w-3" />
                <span className="font-medium">Result JSON</span>
              </div>
              <pre className="bg-neutral-950 text-neutral-200 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                {JSON.stringify(resultJson, null, 2)}
              </pre>
            </div>
          )}

          {/* Error message */}
          {errorMsg && (
            <div className="px-4 py-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-red-500">
                <XCircle className="h-3 w-3" />
                <span className="font-medium">Error</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
              {run.stderrExcerpt && run.stderrExcerpt.trim() && (
                <pre className="bg-red-950/30 text-red-300 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto mt-2">
                  {run.stderrExcerpt}
                </pre>
              )}
            </div>
          )}

          {/* No output at all */}
          {!hasOutput && !errorMsg && (
            <div className="px-4 py-4 text-center">
              <p className="text-sm text-muted-foreground">
                {isLive ? "Run in progress — output will appear when complete…" : "No output produced"}
              </p>
            </div>
          )}

          {/* Footer with stats + link */}
          <div className="flex items-center justify-between border-t border-border/30 dark:border-border/50 px-4 py-2.5">
            <div className="flex items-center gap-3">
              {toolCalls > 0 && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Wrench className="h-3 w-3" /> {toolCalls} tool call{toolCalls !== 1 ? "s" : ""}
                </span>
              )}
              <span className="font-mono text-[10px] text-muted-foreground/60">{run.id.slice(0, 8)}</span>
            </div>
            <Link
              to={`/agents/${agentRouteId}/runs/${run.id}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline no-underline"
            >
              Full transcript <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main LatestRunOutput ────────────────────────────────────── */

export function LatestRunOutput({
  runs,
  agentRouteId,
}: {
  runs: HeartbeatRun[];
  agentRouteId: string;
}) {
  const sorted = useMemo(
    () => [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [runs],
  );

  if (sorted.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Latest Output</h3>
        <div className="rounded-xl border border-dashed border-border/40 dark:border-border p-8 text-center">
          <Terminal className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No runs yet. Trigger a heartbeat to see output here.</p>
        </div>
      </div>
    );
  }

  // Show up to 3 most recent runs
  const displayRuns = sorted.slice(0, 3);
  const liveRun = sorted.find((r) => r.status === "running" || r.status === "queued");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          {liveRun && (
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
          )}
          {liveRun ? "Live Output" : "Latest Output"}
        </h3>
        <Link
          to={`/agents/${agentRouteId}/runs`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors no-underline"
        >
          All runs &rarr;
        </Link>
      </div>

      <div className="space-y-2">
        {displayRuns.map((run, i) => (
          <SingleRunOutput key={run.id} run={run} agentRouteId={agentRouteId} isLatest={i === 0} />
        ))}
      </div>

      {sorted.length > 3 && (
        <Link
          to={`/agents/${agentRouteId}/runs`}
          className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors no-underline py-1"
        >
          +{sorted.length - 3} more runs
        </Link>
      )}
    </div>
  );
}
