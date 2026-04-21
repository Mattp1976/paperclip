/**
 * Outputs — Your agents' results, grouped by day.
 *
 * Redesigned to be result-first, not run-first. Outputs are
 * grouped by time (Today / Yesterday / Earlier) with friendly
 * language throughout. The primary view for non-technical users
 * to find "what did my agents produce?"
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { extractOutputText } from "../components/OutputCard";
import {
  ResultCard,
  ResultCardSkeleton,
  groupRunsByTask,
  type ResultGroup,
} from "../components/ResultCard";
import { issuesApi } from "../api/issues";
import { Identity } from "../components/Identity";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { cn, friendlyCost, visibleRunCostUsd } from "../lib/utils";
import { Sparkles, Search, Filter, Zap, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { HeartbeatRun, Agent } from "@mattparrytfc/shared";

/* ── Helpers ─────────────────────────────────────────────────── */

type StatusTab = "all" | "completed" | "in_progress" | "failed";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function getDayGroup(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const d = new Date(date);
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dDay.getTime() === today.getTime()) return "Today";
  if (dDay.getTime() === yesterday.getTime()) return "Yesterday";
  if (dDay >= weekAgo) return "Earlier this week";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/**
 * A unit rendered within a day group — either a task-grouped set of runs
 * (succeeded outputs, per UX §P2) or a single non-succeeded run card.
 */
type OutputItem =
  | { kind: "result"; key: string; sortAt: Date; group: ResultGroup }
  | { kind: "run"; key: string; sortAt: Date; run: HeartbeatRun };

interface DayGroup {
  label: string;
  items: OutputItem[];
}

/* ── Component ──────────────────────────────────────────────── */

export function Outputs() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<StatusTab>("all");

  useEffect(() => {
    setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  // Fetch issues to link results back to their originating task
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
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

  // Filter runs by status tab
  const tabFilteredRuns = useMemo(() => {
    if (!runs) return [];
    switch (activeTab) {
      case "completed":
        return runs.filter((r: HeartbeatRun) =>
          r.status === "succeeded" && extractOutputText(r) !== null,
        );
      case "in_progress":
        return runs.filter((r: HeartbeatRun) =>
          r.status === "running" || r.status === "queued",
        );
      case "failed":
        return runs.filter((r: HeartbeatRun) =>
          r.status === "failed" || r.status === "timed_out",
        );
      default: // "all"
        return runs.filter((r: HeartbeatRun) => {
          if (r.status === "succeeded") return extractOutputText(r) !== null;
          return r.status === "running" || r.status === "queued" || r.status === "failed" || r.status === "timed_out";
        });
    }
  }, [runs, activeTab]);

  // Apply search + agent filter
  const filteredRuns = useMemo(() => {
    let result = tabFilteredRuns;

    if (agentFilter !== "all") {
      result = result.filter((r: HeartbeatRun) => r.agentId === agentFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((r: HeartbeatRun) => {
        const text = extractOutputText(r);
        if (text && text.toLowerCase().includes(query)) return true;
        const agent = agentMap.get(r.agentId);
        if (agent?.name.toLowerCase().includes(query)) return true;
        return false;
      });
    }

    return result.sort(
      (a: HeartbeatRun, b: HeartbeatRun) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [tabFilteredRuns, agentFilter, searchQuery, agentMap]);

  // Partition filtered runs into succeeded-with-output (→ task-grouped ResultCards)
  // and in-progress / failed (→ per-run status cards). Then interleave and day-group.
  const dayGroups = useMemo((): DayGroup[] => {
    const succeeded: HeartbeatRun[] = [];
    const other: HeartbeatRun[] = [];
    for (const r of filteredRuns) {
      if (r.status === "succeeded" && extractOutputText(r) !== null) {
        succeeded.push(r);
      } else {
        other.push(r);
      }
    }

    const items: OutputItem[] = [];
    for (const group of groupRunsByTask(succeeded)) {
      items.push({
        kind: "result",
        key: group.key,
        sortAt: group.latestAt,
        group,
      });
    }
    for (const r of other) {
      items.push({
        kind: "run",
        key: `run:${r.id}`,
        sortAt: new Date(r.createdAt),
        run: r,
      });
    }
    items.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());

    const groups = new Map<string, OutputItem[]>();
    const order: string[] = [];
    for (const item of items) {
      const label = getDayGroup(item.sortAt);
      if (!groups.has(label)) {
        groups.set(label, []);
        order.push(label);
      }
      groups.get(label)!.push(item);
    }
    return order.map((label) => ({ label, items: groups.get(label)! }));
  }, [filteredRuns]);

  // Unique agents who have produced outputs
  const outputAgents = useMemo(() => {
    const allOutputRuns = (runs ?? []).filter(
      (r: HeartbeatRun) => r.status === "succeeded" && extractOutputText(r) !== null,
    );
    const ids = new Set(allOutputRuns.map((r: HeartbeatRun) => r.agentId));
    return (agents ?? []).filter((a: Agent) => ids.has(a.id));
  }, [runs, agents]);

  // Summary stats
  const stats = useMemo(() => {
    if (!runs) return { completed: 0, inProgress: 0, failed: 0, totalCost: 0 };

    let totalCost = 0;
    let completed = 0;
    let inProgress = 0;
    let failed = 0;

    for (const run of runs) {
      if (run.status === "succeeded") {
        completed++;
        const usage = asRecord(run.usageJson);
        const result = asRecord(run.resultJson);
        totalCost += visibleRunCostUsd(usage, result);
      } else if (run.status === "running" || run.status === "queued") {
        inProgress++;
      } else if (run.status === "failed" || run.status === "timed_out") {
        failed++;
      }
    }

    return { completed, inProgress, failed, totalCost };
  }, [runs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Sparkles} message="Select a company to view results." />;
  }

  const STATUS_TABS: { key: StatusTab; label: string; count: number; icon: typeof CheckCircle2 }[] = [
    { key: "all", label: "All", count: filteredRuns.length, icon: Sparkles },
    { key: "completed", label: "Completed", count: stats.completed, icon: CheckCircle2 },
    { key: "in_progress", label: "In Progress", count: stats.inProgress, icon: Loader2 },
    { key: "failed", label: "Issues", count: stats.failed, icon: AlertCircle },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        subtitle="Everything your agents have produced, in one place."
      />

      {/* Summary strip */}
      {stats.totalCost > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-sage-ink" />
            {stats.completed} completed
          </span>
          {stats.inProgress > 0 && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 text-sage-ink animate-spin" />
              {stats.inProgress} in progress
            </span>
          )}
          <span className="flex items-center gap-1">
            <Zap className="h-3.5 w-3.5" />
            Total cost: {friendlyCost(stats.totalCost)}
          </span>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-border/20 dark:border-border/40">
        {STATUS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all border-b-2 -mb-px",
                isActive
                  ? "border-primary text-sage-ink dark:border-green-400"
                  : "border-transparent text-muted-foreground/60 hover:text-foreground hover:border-border/40",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", tab.key === "in_progress" && isActive && "animate-spin")} />
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  isActive
                    ? "bg-primary/10 text-sage-ink dark:bg-[#A4BD95]/20"
                    : "bg-muted/50 text-muted-foreground/50",
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <input
            type="text"
            placeholder="Search results…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full rounded-xl border border-border/20 dark:border-border/40 bg-white dark:bg-card",
              "pl-9 pr-4 py-2.5 text-sm",
              "placeholder:text-muted-foreground/40",
              "focus:outline-none focus:ring-2 focus:ring-green-600/20 focus:border-primary/30",
              "transition-all",
            )}
          />
        </div>

        {/* Agent filter */}
        {outputAgents.length > 1 && (
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground/40" />
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className={cn(
                "rounded-xl border border-border/20 dark:border-border/40 bg-white dark:bg-card",
                "px-3 py-2.5 text-sm text-foreground",
                "focus:outline-none focus:ring-2 focus:ring-green-600/20 focus:border-primary/30",
                "transition-all appearance-none pr-8",
              )}
            >
              <option value="all">All agents</option>
              {outputAgents.map((a: Agent) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Count */}
        <span className="text-xs text-muted-foreground/50 ml-auto">
          {filteredRuns.length} result{filteredRuns.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Results — grouped by day */}
      {runsLoading ? (
        <div className="space-y-4">
          <ResultCardSkeleton />
          <ResultCardSkeleton />
          <ResultCardSkeleton />
        </div>
      ) : filteredRuns.length === 0 ? (
        activeTab !== "all" || searchQuery || agentFilter !== "all" ? (
          <EmptyState
            icon={Sparkles}
            message="No results match your filters."
            description="Try adjusting your search, clearing the agent filter, or switching tabs."
          />
        ) : (
          /* First-time user empty state */
          <div className="rounded-2xl border border-border/10 dark:border-border/40 bg-white dark:bg-card shadow-sm shadow-black/[0.03] p-8 text-center space-y-4">
            <div className="flex justify-center gap-3 text-3xl">
              <span>🤖</span>
              <span className="text-muted-foreground/30">→</span>
              <span>📋</span>
              <span className="text-muted-foreground/30">→</span>
              <span>✨</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                Your agents are ready to work
              </h3>
              <p className="text-sm text-muted-foreground/70 max-w-md mx-auto">
                Type a task on the Dashboard and your AI agents will collaborate
                to get it done. Results appear here automatically.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground/50">
              <p>
                <span className="font-medium text-muted-foreground">Try:</span>{" "}
                "Write a summary of our Q2 performance"
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Try:</span>{" "}
                "Research competitors in the AI agent space"
              </p>
              <p className="mt-2 text-muted-foreground/40">
                Typical tasks complete in 30–120 seconds and cost a few cents each.
              </p>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-8">
          {dayGroups.map((group) => (
            <div key={group.label} className="space-y-3">
              {/* Day header */}
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  {group.label}
                </h2>
                <div className="flex-1 h-px bg-border/20 dark:bg-border/30" />
                <span className="text-[10px] text-muted-foreground/40">
                  {group.items.length} result{group.items.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Items for this day */}
              <div className="space-y-3">
                {group.items.map((item) => {
                  if (item.kind === "result") {
                    const task = item.group.issueId
                      ? issueMap.get(item.group.issueId) ?? null
                      : null;
                    return (
                      <ResultCard
                        key={item.key}
                        runs={item.group.runs}
                        agentMap={agentMap}
                        task={task}
                      />
                    );
                  }

                  const run = item.run;
                  if (run.status === "running" || run.status === "queued") {
                    const agent = agentMap.get(run.agentId);
                    return (
                      <div
                        key={item.key}
                        className="rounded-2xl border border-green-200/40 dark:border-green-500/15 bg-green-50/40 dark:bg-green-950/20 shadow-sm shadow-black/[0.02] px-5 py-4"
                      >
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-4 w-4 text-sage-ink animate-spin shrink-0" />
                          <div className="flex items-center gap-1.5 min-w-0">
                            {agent && <Identity name={agent.name} size="xs" />}
                            <span className="text-sm font-medium text-foreground truncate">
                              {agent?.name ?? "Agent"} is working…
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground/50 ml-auto shrink-0">
                            {run.startedAt
                              ? `Started ${Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000)}s ago`
                              : "Queued"}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (run.status === "failed" || run.status === "timed_out") {
                    const agent = agentMap.get(run.agentId);
                    return (
                      <div
                        key={item.key}
                        className="rounded-2xl border border-destructive/20 bg-destructive/5 shadow-sm shadow-black/[0.02] px-5 py-4"
                      >
                        <div className="flex items-center gap-3">
                          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                          <div className="flex items-center gap-1.5 min-w-0">
                            {agent && <Identity name={agent.name} size="xs" />}
                            <span className="text-sm font-medium text-foreground truncate">
                              Something went wrong
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground/50 ml-auto shrink-0">
                            {run.error ? run.error.slice(0, 60) : run.status === "timed_out" ? "Timed out" : "Failed"}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
