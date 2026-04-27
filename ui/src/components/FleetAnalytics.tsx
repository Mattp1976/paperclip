import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { costsApi } from "../api/costs";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents, agentUrl } from "../lib/utils";
import { Identity } from "./Identity";
import { StatusIcon } from "./StatusIcon";
import { PageSkeleton } from "./PageSkeleton";
import {
  Bot,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Activity,
  DollarSign,
  Zap,
  Shield,
  Filter,
} from "lucide-react";
import type { Agent, HeartbeatRun, CostByAgent } from "@orqestra/shared";

/* ---- Types ---- */

interface AgentFleetRow {
  agent: Agent;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  successRate: number;
  costCents: number;
  costPerRun: number;
  avgDurationSec: number;
  lastRunAt: string | null;
  modelTier: "opus" | "sonnet" | "haiku" | "unknown";
  isHeartbeatEnabled: boolean;
  hasSkipPermissions: boolean;
}

type SortKey =
  | "name"
  | "status"
  | "role"
  | "runs"
  | "successRate"
  | "cost"
  | "costPerRun"
  | "avgDuration"
  | "lastRun"
  | "model";

type SortDir = "asc" | "desc";

/* ---- Helpers ---- */

function getModelTier(config: Record<string, unknown>): "opus" | "sonnet" | "haiku" | "unknown" {
  const model = String(config.model ?? "").toLowerCase();
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return "unknown";
}

function deriveFleetRows(
  agents: Agent[],
  runs: HeartbeatRun[],
  costsByAgent: CostByAgent[],
): AgentFleetRow[] {
  const runsByAgent = new Map<string, HeartbeatRun[]>();
  for (const run of runs) {
    const list = runsByAgent.get(run.agentId) ?? [];
    list.push(run);
    runsByAgent.set(run.agentId, list);
  }

  const costMap = new Map<string, number>();
  for (const c of costsByAgent) {
    costMap.set(c.agentId, (c as any).totalCents ?? (c as any).costCents ?? 0);
  }

  return agents
    .filter((a) => a.status !== "terminated")
    .map((agent) => {
      const agentRuns = runsByAgent.get(agent.id) ?? [];
      const succeeded = agentRuns.filter((r) => r.status === "succeeded").length;
      const failed = agentRuns.filter(
        (r) => r.status === "failed" || r.status === "timed_out",
      ).length;
      const total = agentRuns.length;
      const costCents = costMap.get(agent.id) ?? agent.spentMonthlyCents ?? 0;

      const durations = agentRuns
        .filter((r) => r.startedAt && r.finishedAt)
        .map(
          (r) =>
            (new Date(r.finishedAt!).getTime() - new Date(r.startedAt!).getTime()) / 1000,
        );
      const avgDurationSec =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;

      const lastRun =
        agentRuns.length > 0
          ? agentRuns.reduce((latest, r) =>
              new Date(r.createdAt) > new Date(latest.createdAt) ? r : latest,
            ).createdAt
          : null;

      const config = (agent.adapterConfig ?? {}) as Record<string, unknown>;
      const rtConfig = (agent.runtimeConfig ?? {}) as Record<string, unknown>;
      const hb = rtConfig.heartbeat as Record<string, unknown> | undefined;

      return {
        agent,
        totalRuns: total,
        succeededRuns: succeeded,
        failedRuns: failed,
        successRate: total > 0 ? succeeded / total : 0,
        costCents,
        costPerRun: total > 0 ? costCents / total : 0,
        avgDurationSec,
        lastRunAt: lastRun ? String(lastRun) : null,
        modelTier: getModelTier(config),
        isHeartbeatEnabled: !!(hb?.enabled),
        hasSkipPermissions: !!(config.dangerouslySkipPermissions),
      };
    });
}

function sortRows(rows: AgentFleetRow[], key: SortKey, dir: SortDir): AgentFleetRow[] {
  const sorted = [...rows];
  const mult = dir === "asc" ? 1 : -1;

  sorted.sort((a, b) => {
    switch (key) {
      case "name":
        return mult * a.agent.name.localeCompare(b.agent.name);
      case "status":
        return mult * a.agent.status.localeCompare(b.agent.status);
      case "role":
        return mult * (a.agent.role ?? "").localeCompare(b.agent.role ?? "");
      case "runs":
        return mult * (a.totalRuns - b.totalRuns);
      case "successRate":
        return mult * (a.successRate - b.successRate);
      case "cost":
        return mult * (a.costCents - b.costCents);
      case "costPerRun":
        return mult * (a.costPerRun - b.costPerRun);
      case "avgDuration":
        return mult * (a.avgDurationSec - b.avgDurationSec);
      case "lastRun": {
        const aT = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
        const bT = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
        return mult * (aT - bT);
      }
      case "model": {
        const order = { opus: 3, sonnet: 2, haiku: 1, unknown: 0 };
        return mult * (order[a.modelTier] - order[b.modelTier]);
      }
      default:
        return 0;
    }
  });

  return sorted;
}

/* ---- Sub-components ---- */

function SortHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentKey === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors",
        isActive && "text-foreground",
        className,
      )}
    >
      {label}
      {isActive ? (
        currentDir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

function ModelBadge({ tier }: { tier: "opus" | "sonnet" | "haiku" | "unknown" }) {
  const styles = {
    opus: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    sonnet: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    haiku: "bg-primary/15 text-green-400 border-primary/20",
    unknown: "bg-neutral-500/15 text-neutral-400 border-neutral-500/20",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-medium px-1.5 py-0.5 rounded border",
        styles[tier],
      )}
    >
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-16 h-1.5 rounded-full bg-muted/50 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function SuccessRatePill({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color =
    rate >= 0.8
      ? "text-green-400"
      : rate >= 0.5
        ? "text-amber-400"
        : rate > 0
          ? "text-red-400"
          : "text-muted-foreground";
  return <span className={cn("text-xs font-mono tabular-nums", color)}>{pct}%</span>;
}

/* ---- Fleet Summary Cards ---- */

function FleetSummary({ rows }: { rows: AgentFleetRow[] }) {
  const totalAgents = rows.length;
  const activeAgents = rows.filter(
    (r) => r.agent.status === "active" || r.agent.status === "running",
  ).length;
  const totalRuns = rows.reduce((s, r) => s + r.totalRuns, 0);
  const totalSucceeded = rows.reduce((s, r) => s + r.succeededRuns, 0);
  const totalCost = rows.reduce((s, r) => s + r.costCents, 0);
  const avgSuccessRate = totalRuns > 0 ? totalSucceeded / totalRuns : 0;

  const modelCounts = { opus: 0, sonnet: 0, haiku: 0, unknown: 0 };
  for (const r of rows) modelCounts[r.modelTier]++;

  const topPerformers = [...rows]
    .filter((r) => r.totalRuns >= 3)
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, 3);

  const topSpenders = [...rows].sort((a, b) => b.costCents - a.costCents).slice(0, 3);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Fleet Size</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">{totalAgents}</p>
          <p className="text-[10px] text-muted-foreground">
            {activeAgents} active · {totalAgents - activeAgents} inactive
          </p>
        </div>

        <div className="border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Runs</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">{totalRuns}</p>
          <p className="text-[10px] text-muted-foreground">
            {totalSucceeded} succeeded · {totalRuns - totalSucceeded} failed
          </p>
        </div>

        <div className="border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Fleet Success Rate</span>
          </div>
          <p
            className={cn(
              "text-lg font-semibold tabular-nums",
              avgSuccessRate >= 0.8
                ? "text-green-400"
                : avgSuccessRate >= 0.5
                  ? "text-amber-400"
                  : "text-red-400",
            )}
          >
            {Math.round(avgSuccessRate * 100)}%
          </p>
          <p className="text-[10px] text-muted-foreground">
            {totalSucceeded} / {totalRuns} runs
          </p>
        </div>

        <div className="border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Fleet Cost</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">{formatCents(totalCost)}</p>
          <p className="text-[10px] text-muted-foreground">
            {totalRuns > 0 ? `~${formatCents(Math.round(totalCost / totalRuns))}/run` : "No runs"}
          </p>
        </div>
      </div>

      {/* Model distribution + Top performers */}
      <div className="grid md:grid-cols-3 gap-3">
        {/* Model distribution */}
        <div className="border border-border rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">Model Distribution</h4>
          <div className="flex gap-1 h-3 rounded-full overflow-hidden">
            {modelCounts.opus > 0 && (
              <div
                className="bg-purple-500"
                style={{ flex: modelCounts.opus }}
                title={`Opus: ${modelCounts.opus}`}
              />
            )}
            {modelCounts.sonnet > 0 && (
              <div
                className="bg-blue-500"
                style={{ flex: modelCounts.sonnet }}
                title={`Sonnet: ${modelCounts.sonnet}`}
              />
            )}
            {modelCounts.haiku > 0 && (
              <div
                className="bg-primary"
                style={{ flex: modelCounts.haiku }}
                title={`Haiku: ${modelCounts.haiku}`}
              />
            )}
            {modelCounts.unknown > 0 && (
              <div
                className="bg-neutral-500"
                style={{ flex: modelCounts.unknown }}
                title={`Unknown: ${modelCounts.unknown}`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {modelCounts.opus > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                Opus ({modelCounts.opus})
              </span>
            )}
            {modelCounts.sonnet > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Sonnet ({modelCounts.sonnet})
              </span>
            )}
            {modelCounts.haiku > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Haiku ({modelCounts.haiku})
              </span>
            )}
          </div>
        </div>

        {/* Top performers */}
        <div className="border border-border rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Top Performers
          </h4>
          {topPerformers.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">Need ≥3 runs to rank</p>
          ) : (
            <div className="space-y-1.5">
              {topPerformers.map((r, i) => (
                <div key={r.agent.id} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground w-3">
                    {i + 1}.
                  </span>
                  <Identity name={r.agent.name} size="sm" />
                  <span className="text-xs truncate flex-1">{r.agent.name}</span>
                  <SuccessRatePill rate={r.successRate} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top spenders */}
        <div className="border border-border rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Top Spenders
          </h4>
          {topSpenders.filter((r) => r.costCents > 0).length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No cost data yet</p>
          ) : (
            <div className="space-y-1.5">
              {topSpenders
                .filter((r) => r.costCents > 0)
                .map((r, i) => (
                  <div key={r.agent.id} className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground w-3">
                      {i + 1}.
                    </span>
                    <Identity name={r.agent.name} size="sm" />
                    <span className="text-xs truncate flex-1">{r.agent.name}</span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {formatCents(r.costCents)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Filter bar ---- */

type RoleFilter = string | "all";
type StatusFilter = string | "all";
type ModelFilter = "all" | "opus" | "sonnet" | "haiku";

function FilterBar({
  roles,
  statuses,
  selectedRole,
  selectedStatus,
  selectedModel,
  onRoleChange,
  onStatusChange,
  onModelChange,
  search,
  onSearchChange,
}: {
  roles: string[];
  statuses: string[];
  selectedRole: RoleFilter;
  selectedStatus: StatusFilter;
  selectedModel: ModelFilter;
  onRoleChange: (v: RoleFilter) => void;
  onStatusChange: (v: StatusFilter) => void;
  onModelChange: (v: ModelFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-3.5 w-3.5 text-muted-foreground" />
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search agents…"
        className="h-7 px-2 text-xs rounded border border-border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring w-40"
      />
      <select
        value={selectedRole}
        onChange={(e) => onRoleChange(e.target.value)}
        className="h-7 px-2 text-xs rounded border border-border bg-transparent"
      >
        <option value="all">All roles</option>
        {roles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select
        value={selectedStatus}
        onChange={(e) => onStatusChange(e.target.value)}
        className="h-7 px-2 text-xs rounded border border-border bg-transparent"
      >
        <option value="all">All statuses</option>
        {statuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={selectedModel}
        onChange={(e) => onModelChange(e.target.value as ModelFilter)}
        className="h-7 px-2 text-xs rounded border border-border bg-transparent"
      >
        <option value="all">All models</option>
        <option value="opus">Opus</option>
        <option value="sonnet">Sonnet</option>
        <option value="haiku">Haiku</option>
      </select>
    </div>
  );
}

/* ---- Main Component ---- */

export function FleetAnalytics({ companyId }: { companyId: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [modelFilter, setModelFilter] = useState<ModelFilter>("all");

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(companyId),
    queryFn: () => heartbeatsApi.list(companyId),
  });

  const { data: costsByAgent } = useQuery({
    queryKey: [...queryKeys.costs(companyId), "by-agent"],
    queryFn: () => costsApi.byAgent(companyId),
  });

  const allRows = useMemo(
    () => deriveFleetRows(agents ?? [], runs ?? [], costsByAgent ?? []),
    [agents, runs, costsByAgent],
  );

  const roles = useMemo(
    () => [...new Set(allRows.map((r) => r.agent.role).filter(Boolean))] as string[],
    [allRows],
  );
  const statuses = useMemo(
    () => [...new Set(allRows.map((r) => r.agent.status).filter(Boolean))] as string[],
    [allRows],
  );

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.agent.name.toLowerCase().includes(q) ||
          (r.agent.title ?? "").toLowerCase().includes(q),
      );
    }
    if (roleFilter !== "all") {
      rows = rows.filter((r) => r.agent.role === roleFilter);
    }
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.agent.status === statusFilter);
    }
    if (modelFilter !== "all") {
      rows = rows.filter((r) => r.modelTier === modelFilter);
    }
    return rows;
  }, [allRows, search, roleFilter, statusFilter, modelFilter]);

  const sortedRows = useMemo(
    () => sortRows(filteredRows, sortKey, sortDir),
    [filteredRows, sortKey, sortDir],
  );

  const maxRuns = useMemo(
    () => Math.max(...sortedRows.map((r) => r.totalRuns), 1),
    [sortedRows],
  );
  const maxCost = useMemo(
    () => Math.max(...sortedRows.map((r) => r.costCents), 1),
    [sortedRows],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (agentsLoading) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-6">
      {/* Fleet summary */}
      <FleetSummary rows={allRows} />

      {/* Filters */}
      <FilterBar
        roles={roles}
        statuses={statuses}
        selectedRole={roleFilter}
        selectedStatus={statusFilter}
        selectedModel={modelFilter}
        onRoleChange={setRoleFilter}
        onStatusChange={setStatusFilter}
        onModelChange={setModelFilter}
        search={search}
        onSearchChange={setSearch}
      />

      {/* Agent table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-2 text-left">
                <SortHeader
                  label="Agent"
                  sortKey="name"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2 text-left hidden lg:table-cell">
                <SortHeader
                  label="Status"
                  sortKey="status"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2 text-left hidden md:table-cell">
                <SortHeader
                  label="Role"
                  sortKey="role"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2 text-left hidden md:table-cell">
                <SortHeader
                  label="Model"
                  sortKey="model"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2 text-right">
                <SortHeader
                  label="Runs"
                  sortKey="runs"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
              </th>
              <th className="px-3 py-2 text-right">
                <SortHeader
                  label="Success"
                  sortKey="successRate"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
              </th>
              <th className="px-3 py-2 text-right">
                <SortHeader
                  label="Cost"
                  sortKey="cost"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
              </th>
              <th className="px-3 py-2 text-right hidden lg:table-cell">
                <SortHeader
                  label="$/Run"
                  sortKey="costPerRun"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
              </th>
              <th className="px-3 py-2 text-right hidden xl:table-cell">
                <SortHeader
                  label="Avg Duration"
                  sortKey="avgDuration"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-xs">
                  No agents match the current filters
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr
                  key={row.agent.id}
                  className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                >
                  <td className="px-3 py-2">
                    <Link
                      to={agentUrl(row.agent)}
                      className="flex items-center gap-2 no-underline text-inherit"
                    >
                      <Identity name={row.agent.name} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.agent.name}</p>
                        {row.agent.title && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {row.agent.title}
                          </p>
                        )}
                      </div>
                      {row.hasSkipPermissions && (
                        <span title="Skip permissions enabled"><Shield className="h-3 w-3 text-amber-400 shrink-0" /></span>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    <StatusIcon status={row.agent.status} />
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <span className="text-xs text-muted-foreground capitalize">
                      {row.agent.role ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <ModelBadge tier={row.modelTier} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <MiniBar value={row.totalRuns} max={maxRuns} color="#6366f1" />
                      <span className="text-xs font-mono tabular-nums w-6 text-right">
                        {row.totalRuns}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.totalRuns > 0 ? (
                      <SuccessRatePill rate={row.successRate} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <MiniBar value={row.costCents} max={maxCost} color="#f59e0b" />
                      <span className="text-xs font-mono tabular-nums">
                        {row.costCents > 0 ? formatCents(row.costCents) : "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right hidden lg:table-cell">
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {row.costPerRun > 0 ? formatCents(Math.round(row.costPerRun)) : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right hidden xl:table-cell">
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {row.avgDurationSec > 0 ? `${row.avgDurationSec.toFixed(1)}s` : "—"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Row count */}
      <p className="text-xs text-muted-foreground">
        Showing {sortedRows.length} of {allRows.length} agents
      </p>
    </div>
  );
}
