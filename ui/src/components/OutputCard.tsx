/**
 * OutputCard — Rich preview card for agent run outputs.
 *
 * Shows the *value* an agent produced, not the operational details.
 * Used in the Dashboard "Latest Work" feed and the dedicated Outputs page.
 *
 * - Agent identity + avatar
 * - Extracted human-readable output (markdown-rendered)
 * - Timestamp, cost, duration
 * - Link to full transcript
 */
import { useState } from "react";
import { Link } from "@/lib/router";
import { cn, formatTokens, visibleRunCostUsd, relativeTime, friendlyCost, friendlySource, issueUrl as buildIssueUrl } from "../lib/utils";
import { MarkdownBody } from "./MarkdownBody";
import { Identity } from "./Identity";
import {
  Clock,
  Zap,
  DollarSign,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
  RotateCcw,
  ArrowRight,
} from "lucide-react";
import type { HeartbeatRun, Agent } from "@mattparrytfc/shared";

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
  if (!ms || ms <= 0) return "";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

export function extractOutputText(run: HeartbeatRun): string | null {
  const rj = asRecord(run.resultJson);
  if (!rj) return run.stdoutExcerpt?.trim() || null;
  const text =
    typeof rj.result === "string" ? rj.result :
    typeof rj.summary === "string" ? rj.summary :
    typeof rj.output === "string" ? rj.output :
    typeof rj.message === "string" ? rj.message :
    null;
  return text;
}

/** Extract the issueId from run contextSnapshot if present */
export function extractIssueId(run: HeartbeatRun): string | null {
  const ctx = asRecord(run.contextSnapshot);
  if (!ctx) return null;
  const id = ctx.issueId;
  return typeof id === "string" ? id : null;
}

/** Derive a short title from the output text */
function deriveTitle(text: string): string {
  // Use first line if it looks like a heading
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  if (firstLine.startsWith("#")) return firstLine.replace(/^#+\s*/, "");
  // Use first sentence, capped at 80 chars
  const sentence = firstLine.split(/[.!?]/)[0]?.trim() ?? "";
  if (sentence.length > 0 && sentence.length <= 100) return sentence;
  return firstLine.slice(0, 80) + (firstLine.length > 80 ? "…" : "");
}

/* ── OutputCard ──────────────────────────────────────────────── */

export interface OutputCardProps {
  run: HeartbeatRun;
  agent?: Agent;
  agentRouteId?: string;
  /** Compact mode for dashboard feed (shorter preview) */
  compact?: boolean;
  /** Optional originating task/issue title for context */
  taskTitle?: string;
  /** Optional issue identifier for linking back to the task */
  taskIdentifier?: string;
  className?: string;
}

export function OutputCard({
  run,
  agent,
  agentRouteId,
  compact = false,
  taskTitle,
  taskIdentifier,
  className,
}: OutputCardProps) {
  const [expanded, setExpanded] = useState(false);

  const outputText = extractOutputText(run);
  if (!outputText) return null;

  const usage = asRecord(run.usageJson);
  const result = asRecord(run.resultJson);
  const cost = visibleRunCostUsd(usage, result);
  const totalTokens = usageNum(usage, "inputTokens", "input_tokens") + usageNum(usage, "outputTokens", "output_tokens");
  const durationMs = run.startedAt && run.finishedAt
    ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
    : null;
  const title = deriveTitle(outputText);
  const routeId = agentRouteId ?? run.agentId;

  // In compact mode, truncate output to ~200 chars
  const previewLength = compact ? 200 : 500;
  const needsTruncation = outputText.length > previewLength;
  const displayText = (!expanded && needsTruncation)
    ? outputText.slice(0, previewLength).trim() + "…"
    : outputText;

  return (
    <div
      className={cn(
        "group rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40",
        "shadow-sm shadow-black/[0.03]",
        "transition-shadow duration-200 hover:shadow-md hover:shadow-black/[0.05] dark:hover:shadow-black/20",
        className,
      )}
    >
      {/* Header — agent identity + timestamp */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
            <Sparkles className="h-4 w-4 text-sage-ink" />
          </div>
          {agent && (
            <Link
              to={`/agents/${routeId}`}
              className="flex items-center gap-1.5 no-underline text-inherit hover:opacity-80 transition-opacity"
            >
              <Identity name={agent.name} size="sm" />
              <span className="text-xs font-medium text-muted-foreground truncate">
                {agent.name}
              </span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {durationMs != null && durationMs > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/60">
              <Clock className="h-3 w-3" />
              {fmtDuration(durationMs)}
            </span>
          )}
          {cost > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/60">
              <DollarSign className="h-3 w-3" />
              {friendlyCost(cost)}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/60">
            {relativeTime(run.createdAt)}
          </span>
        </div>
      </div>

      {/* Task context chip — shows where this result came from */}
      {taskTitle && (
        <div className="px-5 pb-1">
          <Link
            to={taskIdentifier ? buildIssueUrl({ id: "", identifier: taskIdentifier, title: taskTitle ?? null }) : "#"}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors no-underline"
          >
            <ArrowRight className="h-2.5 w-2.5" />
            <span className="truncate max-w-[200px]">{taskTitle}</span>
          </Link>
        </div>
      )}

      {/* Title */}
      <div className="px-5 pb-2">
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {title}
        </h3>
      </div>

      {/* Output preview */}
      <div className="px-5 pb-3">
        <div className={cn(
          "prose prose-sm dark:prose-invert max-w-none",
          "text-muted-foreground",
          "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          compact && !expanded && "line-clamp-4",
        )}>
          <MarkdownBody className="text-[13px] leading-relaxed">
            {displayText}
          </MarkdownBody>
        </div>

        {needsTruncation && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            {expanded ? (
              <>Show less <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>Read more <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        )}
      </div>

      {/* Footer — metadata + actions */}
      <div className="flex items-center justify-between border-t border-border/10 dark:border-border/30 px-5 py-2.5">
        <div className="flex items-center gap-3">
          {totalTokens > 0 && (
            <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
              <Zap className="h-3 w-3" /> {formatTokens(totalTokens)}
            </span>
          )}
          {run.invocationSource && (
            <span className="text-[10px] text-muted-foreground/40 font-medium">
              {friendlySource(run.invocationSource)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {taskIdentifier && (
            <Link
              to={buildIssueUrl({ id: "", identifier: taskIdentifier, title: taskTitle ?? null })}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-foreground transition-colors no-underline"
              title="Run this task again"
            >
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">Again</span>
            </Link>
          )}
          <Link
            to={`/agents/${routeId}/runs/${run.id}`}
            className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors no-underline"
          >
            <FileText className="h-3 w-3" />
            View details
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── OutputCardSkeleton (loading state) ─────────────────────── */

export function OutputCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] p-5 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-muted/40" />
        <div className="h-3 w-24 rounded bg-muted/40" />
        <div className="ml-auto h-3 w-16 rounded bg-muted/30" />
      </div>
      <div className="h-4 w-3/4 rounded bg-muted/40" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-muted/30" />
        <div className="h-3 w-5/6 rounded bg-muted/30" />
        <div className="h-3 w-2/3 rounded bg-muted/20" />
      </div>
    </div>
  );
}
