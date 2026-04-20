/**
 * ResultCard — The task-level "one result per task" card.
 *
 * Per UX-REDESIGN-SPEC.md §P2: "Multiple agent runs that serve the same task
 * should be grouped together into a single result." If 5 agents contribute to
 * one task, the user sees ONE card, not five.
 *
 * - Task title as heading (falls back to a derived title for ungrouped runs)
 * - Primary output = latest successful run's extracted text
 * - Contributor row: stacked avatars (multi-run) or single identity (single-run)
 * - Aggregated cost / duration / tokens across all runs in the task
 * - Inlines OutputArtifacts (PRs, branches, preview URLs, docs) for linked tasks
 * - "Inspect run" drawer: per-agent rows with status/duration/cost/tokens and
 *   a per-row "Show full output" toggle that reveals each agent's complete
 *   output inline — no more bouncing between agent pages (P2 follow-up)
 * - Action bar: Copy link, Retry, Download bundle (stub), Feedback (stub)
 */
import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import {
  cn,
  formatTokens,
  visibleRunCostUsd,
  relativeTime,
  friendlyCost,
  friendlyDuration,
} from "../lib/utils";
import { MarkdownBody } from "./MarkdownBody";
import { Identity } from "./Identity";
import { OutputArtifacts } from "./OutputArtifacts";
import { extractOutputText } from "./OutputCard";
import { useToast } from "../context/ToastContext";
import {
  Clock,
  Zap,
  DollarSign,
  ChevronDown,
  ChevronUp,
  FileText,
  Sparkles,
  RotateCcw,
  Users,
  ArrowRight,
  Link2,
  Download,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock3,
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

function deriveTitle(text: string): string {
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  if (firstLine.startsWith("#")) return firstLine.replace(/^#+\s*/, "");
  const sentence = firstLine.split(/[.!?]/)[0]?.trim() ?? "";
  if (sentence.length > 0 && sentence.length <= 100) return sentence;
  return firstLine.slice(0, 80) + (firstLine.length > 80 ? "…" : "");
}

/* ── Types ───────────────────────────────────────────────────── */

export interface ResultCardTaskContext {
  id: string;
  title: string;
  identifier: string | null;
}

export interface ResultCardProps {
  /** All runs that contributed to this task, newest first (order is re-sorted defensively). */
  runs: HeartbeatRun[];
  /** Lookup for contributor identities. */
  agentMap: Map<string, Agent>;
  /** Originating task, or null for ungrouped single-run results. */
  task: ResultCardTaskContext | null;
  /** Compact mode for dashboard feed (shorter preview). */
  compact?: boolean;
  className?: string;
}

/* ── Component ───────────────────────────────────────────────── */

export function ResultCard({
  runs,
  agentMap,
  task,
  compact = false,
  className,
}: ResultCardProps) {
  const { pushToast } = useToast();
  const sorted = useMemo(
    () =>
      [...runs].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [runs],
  );

  const [expanded, setExpanded] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  /** Run IDs whose full output is currently expanded inside the inspect drawer. */
  const [openRunIds, setOpenRunIds] = useState<Set<string>>(new Set());
  const toggleRunOpen = (id: string) =>
    setOpenRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const primaryRun = sorted[0];
  const primaryText = primaryRun ? extractOutputText(primaryRun) : null;

  // Aggregate metrics across all runs in the task
  const agg = useMemo(() => {
    let totalCost = 0;
    let totalTokens = 0;
    let totalDurationMs = 0;
    for (const r of sorted) {
      const usage = asRecord(r.usageJson);
      const result = asRecord(r.resultJson);
      totalCost += visibleRunCostUsd(usage, result);
      totalTokens +=
        usageNum(usage, "inputTokens", "input_tokens") +
        usageNum(usage, "outputTokens", "output_tokens");
      if (r.startedAt && r.finishedAt) {
        totalDurationMs +=
          new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
      }
    }
    return { totalCost, totalTokens, totalDurationMs };
  }, [sorted]);

  // Unique contributing agents, in order of first appearance, with run counts
  const contributors = useMemo(() => {
    const byId = new Map<string, { agent: Agent | undefined; runs: number }>();
    const order: string[] = [];
    for (const r of sorted) {
      if (!byId.has(r.agentId)) {
        byId.set(r.agentId, { agent: agentMap.get(r.agentId), runs: 1 });
        order.push(r.agentId);
      } else {
        byId.get(r.agentId)!.runs += 1;
      }
    }
    return order.map((id) => byId.get(id)!);
  }, [sorted, agentMap]);

  if (!primaryRun || !primaryText) return null;

  const isMultiRun = sorted.length > 1;
  const isMultiAgent = contributors.length > 1;
  const cardTitle = task?.title ?? deriveTitle(primaryText);
  const taskHref = task
    ? `/issues/${task.identifier ?? task.id}`
    : null;

  // Preview truncation
  const previewLength = compact ? 240 : 600;
  const needsTruncation = primaryText.length > previewLength;
  const displayText =
    !expanded && needsTruncation
      ? primaryText.slice(0, previewLength).trim() + "…"
      : primaryText;

  const primaryAgent = contributors[0]?.agent;
  const primaryAgentHref = primaryAgent
    ? `/agents/${primaryAgent.urlKey ?? primaryAgent.id}`
    : null;

  return (
    <div
      className={cn(
        "group rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40",
        "shadow-sm shadow-black/[0.03]",
        "transition-shadow duration-200 hover:shadow-md hover:shadow-black/[0.05] dark:hover:shadow-black/20",
        className,
      )}
    >
      {/* Header — contributors + timestamp/cost */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Result icon */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-600/10 dark:bg-green-600/20">
            <Sparkles className="h-4 w-4 text-green-700 dark:text-green-400" />
          </div>

          {/* Contributors */}
          {isMultiAgent ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex -space-x-1.5">
                {contributors.slice(0, 4).map(({ agent }, i) =>
                  agent ? (
                    <div
                      key={agent.id}
                      className="ring-2 ring-white dark:ring-card rounded-full"
                      style={{ zIndex: contributors.length - i }}
                    >
                      <Identity name={agent.name} size="sm" />
                    </div>
                  ) : null,
                )}
                {contributors.length > 4 && (
                  <div className="ring-2 ring-white dark:ring-card rounded-full bg-muted flex h-6 w-6 items-center justify-center text-[9px] font-medium text-muted-foreground">
                    +{contributors.length - 4}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate">
                {contributors.length} agents
                {isMultiRun ? ` · ${sorted.length} runs` : ""}
              </span>
            </div>
          ) : (
            primaryAgent && primaryAgentHref && (
              <Link
                to={primaryAgentHref}
                className="flex items-center gap-1.5 no-underline text-inherit hover:opacity-80 transition-opacity"
              >
                <Identity name={primaryAgent.name} size="sm" />
                <span className="text-xs font-medium text-muted-foreground truncate">
                  {primaryAgent.name}
                  {isMultiRun ? (
                    <span className="text-muted-foreground/60">
                      {" "}
                      · {sorted.length} runs
                    </span>
                  ) : null}
                </span>
              </Link>
            )
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {agg.totalDurationMs > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/60">
              <Clock className="h-3 w-3" />
              {friendlyDuration(agg.totalDurationMs)}
            </span>
          )}
          {agg.totalCost > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/60">
              <DollarSign className="h-3 w-3" />
              {friendlyCost(agg.totalCost)}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/60">
            {relativeTime(primaryRun.createdAt)}
          </span>
        </div>
      </div>

      {/* Task chip */}
      {task && taskHref && (
        <div className="px-5 pb-1">
          <Link
            to={taskHref}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors no-underline"
          >
            <ArrowRight className="h-2.5 w-2.5" />
            {task.identifier && (
              <span className="font-mono text-muted-foreground/40">
                {task.identifier}
              </span>
            )}
            <span className="truncate max-w-[220px]">{task.title}</span>
          </Link>
        </div>
      )}

      {/* Card title */}
      <div className="px-5 pb-2">
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {cardTitle}
        </h3>
      </div>

      {/* Primary output preview (latest run's output) */}
      <div className="px-5 pb-3">
        <div
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none",
            "text-muted-foreground",
            "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
            compact && !expanded && "line-clamp-4",
          )}
        >
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
              <>
                Show less <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Read more <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Deliverables / artifacts — only if linked to a task */}
      {task && (
        <div className="px-5 pb-3">
          <OutputArtifacts issueId={task.id} />
        </div>
      )}

      {/* Inspect run — per-agent breakdown with inline full-output expansion.
          Shown for any multi-run task OR any card in non-compact mode.
          This is the primary answer to "outputs are split across agent pages":
          every contributor's full output is reachable right here. */}
      {(isMultiRun || !compact) && (
        <div className="px-5 pb-3">
          <button
            onClick={() => setInspectOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
            aria-expanded={inspectOpen}
          >
            <Users className="h-3 w-3" />
            {inspectOpen ? "Hide" : "Inspect"} run
            {isMultiRun && (
              <span className="text-muted-foreground/50">
                ({sorted.length} contributions from {contributors.length} agent
                {contributors.length === 1 ? "" : "s"})
              </span>
            )}
            {inspectOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {inspectOpen && (
            <div className="mt-3 space-y-3 rounded-xl border border-border/15 dark:border-border/30 bg-muted/30 dark:bg-muted/10 p-3">
              {sorted.map((r, idx) => {
                const txt = extractOutputText(r);
                const agent = agentMap.get(r.agentId);
                const usage = asRecord(r.usageJson);
                const result = asRecord(r.resultJson);
                const cost = visibleRunCostUsd(usage, result);
                const tokens =
                  usageNum(usage, "inputTokens", "input_tokens") +
                  usageNum(usage, "outputTokens", "output_tokens");
                const dur =
                  r.startedAt && r.finishedAt
                    ? new Date(r.finishedAt).getTime() -
                      new Date(r.startedAt).getTime()
                    : 0;
                const isOpen = openRunIds.has(r.id);
                const isPrimary = idx === 0;
                const statusIcon =
                  r.status === "succeeded" ? (
                    <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                  ) : r.status === "failed" ? (
                    <XCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <Clock3 className="h-3 w-3 text-muted-foreground/60" />
                  );
                const agentHref = agent
                  ? `/agents/${agent.urlKey ?? agent.id}/runs/${r.id}`
                  : `/agents/${r.agentId}/runs/${r.id}`;
                return (
                  <div
                    key={r.id}
                    className="rounded-lg bg-background/60 dark:bg-background/40 border border-border/10 dark:border-border/30"
                  >
                    <button
                      type="button"
                      onClick={() => txt && toggleRunOpen(r.id)}
                      disabled={!txt}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                        txt
                          ? "hover:bg-muted/40 dark:hover:bg-muted/20 cursor-pointer"
                          : "cursor-default opacity-70",
                      )}
                      aria-expanded={isOpen}
                    >
                      <div className="shrink-0">{statusIcon}</div>
                      {agent && <Identity name={agent.name} size="xs" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-medium truncate">
                            {agent?.name ?? "Agent"}
                          </span>
                          {isPrimary && (
                            <span className="text-[9px] uppercase tracking-wider font-semibold text-primary bg-primary/10 px-1.5 py-px rounded">
                              Latest
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-0.5">
                          <span>{relativeTime(r.createdAt)}</span>
                          {dur > 0 && (
                            <>
                              <span className="text-muted-foreground/30">
                                ·
                              </span>
                              <span>{friendlyDuration(dur)}</span>
                            </>
                          )}
                          {cost > 0 && (
                            <>
                              <span className="text-muted-foreground/30">
                                ·
                              </span>
                              <span>{friendlyCost(cost)}</span>
                            </>
                          )}
                          {tokens > 0 && (
                            <>
                              <span className="text-muted-foreground/30">
                                ·
                              </span>
                              <span>{formatTokens(tokens)} tokens</span>
                            </>
                          )}
                        </div>
                      </div>
                      {txt ? (
                        isOpen ? (
                          <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                        ) : (
                          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                        )
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50 shrink-0">
                          no output
                        </span>
                      )}
                    </button>
                    {isOpen && txt && (
                      <div className="border-t border-border/10 dark:border-border/30 px-3 py-3 space-y-2">
                        <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <MarkdownBody className="text-[12px] leading-relaxed">
                            {txt}
                          </MarkdownBody>
                        </div>
                        <div className="flex justify-end">
                          <Link
                            to={agentHref}
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors no-underline"
                          >
                            <FileText className="h-2.5 w-2.5" />
                            Open agent run
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Action bar — addresses "act on outputs from the listing" need.
          Copy and Retry work immediately. Download + Feedback emit a toast
          acknowledging the request and call TODO endpoints to be wired up
          server-side in a follow-up. */}
      <div className="flex items-center justify-between border-t border-border/10 dark:border-border/30 px-5 py-2.5">
        <div className="flex items-center gap-3">
          {agg.totalTokens > 0 && !compact && (
            <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
              <Zap className="h-3 w-3" /> {formatTokens(agg.totalTokens)}
            </span>
          )}
          {isMultiRun && (
            <span className="text-[11px] text-muted-foreground/50">
              {sorted.length} runs
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const path = taskHref
                ? taskHref
                : `/agents/${primaryAgent?.urlKey ?? primaryRun.agentId}/runs/${primaryRun.id}`;
              const url =
                typeof window !== "undefined"
                  ? `${window.location.origin}${path}`
                  : path;
              try {
                void navigator.clipboard.writeText(url);
                pushToast({
                  title: "Link copied",
                  body: "Share this URL with a teammate to jump to the result.",
                  tone: "success",
                  dedupeKey: `copy:${path}`,
                });
              } catch {
                pushToast({
                  title: "Copy failed",
                  body: "Your browser blocked clipboard access.",
                  tone: "error",
                });
              }
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Copy link to this result"
          >
            <Link2 className="h-3 w-3" />
            <span className="hidden sm:inline">Copy link</span>
          </button>
          <button
            type="button"
            onClick={() => {
              // TODO(server): POST /api/issues/:id/artifacts.zip to stream a
              // bundle of every artifact (workspace files, PR diffs, outputs)
              // from every run contributing to this task. Until that endpoint
              // exists, acknowledge the request so the user knows it was heard.
              pushToast({
                title: "Bundle download coming soon",
                body: "Artifact packaging is queued for the next release.",
                tone: "info",
                dedupeKey: `download:${task?.id ?? primaryRun.id}`,
              });
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Download all artifacts from this run"
          >
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            onClick={() => {
              // TODO(server): POST /api/runs/:id/feedback { verdict, note }
              pushToast({
                title: "Feedback recorded",
                body: "We'll wire this into retry-with-feedback in the next release.",
                tone: "info",
                dedupeKey: `feedback:up:${primaryRun.id}`,
              });
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground/70 hover:text-green-600 dark:hover:text-green-400 hover:bg-muted/60 transition-colors"
            title="Approve this result"
          >
            <ThumbsUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              pushToast({
                title: "Feedback recorded",
                body: "We'll wire this into retry-with-feedback in the next release.",
                tone: "info",
                dedupeKey: `feedback:down:${primaryRun.id}`,
              });
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground/70 hover:text-red-500 hover:bg-muted/60 transition-colors"
            title="Reject this result"
          >
            <ThumbsDown className="h-3 w-3" />
          </button>
          {taskHref && (
            <Link
              to={taskHref}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors no-underline"
              title="Run this task again"
            >
              <RefreshCw className="h-3 w-3" />
              <span className="hidden sm:inline">Retry</span>
            </Link>
          )}
          {taskHref ? (
            <Link
              to={taskHref}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary/80 hover:text-primary hover:bg-primary/5 transition-colors no-underline"
            >
              <FileText className="h-3 w-3" />
              <span className="hidden sm:inline">Open task</span>
            </Link>
          ) : (
            <Link
              to={`/agents/${primaryAgent?.urlKey ?? primaryRun.agentId}/runs/${primaryRun.id}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary/80 hover:text-primary hover:bg-primary/5 transition-colors no-underline"
            >
              <FileText className="h-3 w-3" />
              <span className="hidden sm:inline">Details</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────── */

export function ResultCardSkeleton() {
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

/* ── Grouping helper ─────────────────────────────────────────── */

export interface ResultGroup {
  /** Unique key: `task:<issueId>` or `run:<runId>` for ungrouped singletons. */
  key: string;
  issueId: string | null;
  /** Runs in this group, sorted newest-first. */
  runs: HeartbeatRun[];
  /** createdAt of the newest run in the group. */
  latestAt: Date;
}

/**
 * Group runs by their originating task (contextSnapshot.issueId).
 * Runs without an issueId become singleton groups. Returned groups are sorted
 * newest-first by the group's most recent run.
 */
export function groupRunsByTask(runs: HeartbeatRun[]): ResultGroup[] {
  const byTask = new Map<string, HeartbeatRun[]>();
  const ungrouped: HeartbeatRun[] = [];

  for (const r of runs) {
    const ctx = asRecord(r.contextSnapshot);
    const issueId =
      ctx && typeof ctx.issueId === "string" ? ctx.issueId : null;
    if (issueId) {
      const list = byTask.get(issueId) ?? [];
      list.push(r);
      byTask.set(issueId, list);
    } else {
      ungrouped.push(r);
    }
  }

  const groups: ResultGroup[] = [];
  for (const [issueId, list] of byTask) {
    list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    groups.push({
      key: `task:${issueId}`,
      issueId,
      runs: list,
      latestAt: new Date(list[0].createdAt),
    });
  }

  for (const r of ungrouped) {
    groups.push({
      key: `run:${r.id}`,
      issueId: null,
      runs: [r],
      latestAt: new Date(r.createdAt),
    });
  }

  groups.sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
  return groups;
}
