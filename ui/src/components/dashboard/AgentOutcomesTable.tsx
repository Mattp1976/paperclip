/**
 * AgentOutcomesTable — per-agent resolved-work summary for the last 7 days.
 *
 * Per PLAN-30D W3 "Outcome telemetry": one row per agent showing resolved
 * task count, spend, cost-per-task, and a tier pill (low / mid / high).
 * No ROI claims — just the raw numbers the user can credibly cite.
 *
 * Sort by any column. Default sort is resolvedCount desc so the most
 * productive agent shows up on top; clicking "Cost / task" flips the
 * emphasis onto efficiency.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Link } from "@/lib/router";
import { costsApi } from "../../api/costs";
import { queryKeys } from "../../lib/queryKeys";
import { agentUrl, cn, friendlyCost } from "../../lib/utils";
import type { AgentOutcome } from "@mattparrytfc/shared";

interface AgentOutcomesTableProps {
  companyId: string;
  /** ISO timestamp — defaults to 7 days ago */
  from?: string;
}

type SortKey = "agent" | "resolved" | "cost" | "costPerTask" | "tier";
type SortDir = "asc" | "desc";

type Tier = "none" | "low" | "mid" | "high";

const TIER_RANK: Record<Tier, number> = { low: 0, mid: 1, high: 2, none: 3 };

/** Bucket cost-per-task (cents) into low / mid / high. */
function tierOf(costPerTaskCents: number | null): Tier {
  if (costPerTaskCents === null) return "none";
  if (costPerTaskCents < 100) return "low";
  if (costPerTaskCents < 1_000) return "mid";
  return "high";
}

function tierLabel(tier: Tier): string {
  if (tier === "low") return "Low";
  if (tier === "mid") return "Mid";
  if (tier === "high") return "High";
  return "—";
}

function tierClasses(tier: Tier): string {
  if (tier === "low") return "bg-emerald-100/70 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (tier === "mid") return "bg-amber-100/70 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  if (tier === "high") return "bg-rose-100/70 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
  return "bg-muted/60 text-muted-foreground";
}

function defaultFrom(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

export function AgentOutcomesTable({ companyId, from }: AgentOutcomesTableProps) {
  const fromParam = useMemo(() => from ?? defaultFrom(), [from]);

  const { data: outcomes, isLoading } = useQuery({
    queryKey: queryKeys.agentOutcomes(companyId, fromParam),
    queryFn: () => costsApi.agentOutcomes(companyId, fromParam),
    enabled: !!companyId,
  });

  const [sortKey, setSortKey] = useState<SortKey>("resolved");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const rows = (outcomes ?? []).filter(
      (row) => row.resolvedCount > 0 || row.costCents > 0,
    );
    const multiplier = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "agent": {
          const an = (a.agentName ?? "").toLowerCase();
          const bn = (b.agentName ?? "").toLowerCase();
          return multiplier * an.localeCompare(bn);
        }
        case "resolved":
          return multiplier * (a.resolvedCount - b.resolvedCount);
        case "cost":
          return multiplier * (a.costCents - b.costCents);
        case "costPerTask": {
          // Nulls always sort to the end regardless of direction.
          if (a.costPerTaskCents === null && b.costPerTaskCents === null) return 0;
          if (a.costPerTaskCents === null) return 1;
          if (b.costPerTaskCents === null) return -1;
          return multiplier * (a.costPerTaskCents - b.costPerTaskCents);
        }
        case "tier": {
          const at = TIER_RANK[tierOf(a.costPerTaskCents)];
          const bt = TIER_RANK[tierOf(b.costPerTaskCents)];
          return multiplier * (at - bt);
        }
      }
    });
  }, [outcomes, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "agent" ? "asc" : "desc");
    }
  }

  if (isLoading) {
    return (
      <section
        className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] p-5"
        aria-label="Agent outcomes"
      >
        <Header />
        <div className="mt-4 h-24 animate-pulse rounded-lg bg-muted/40" />
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] p-5"
      aria-label="Agent outcomes"
    >
      <Header />
      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground/70">
          No resolved work in the last 7 days yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border/30 text-left">
                <Th label="Agent" active={sortKey === "agent"} dir={sortDir} onClick={() => toggleSort("agent")} />
                <Th
                  label="Resolved"
                  align="right"
                  active={sortKey === "resolved"}
                  dir={sortDir}
                  onClick={() => toggleSort("resolved")}
                />
                <Th
                  label="Spend"
                  align="right"
                  active={sortKey === "cost"}
                  dir={sortDir}
                  onClick={() => toggleSort("cost")}
                />
                <Th
                  label="Cost / task"
                  align="right"
                  active={sortKey === "costPerTask"}
                  dir={sortDir}
                  onClick={() => toggleSort("costPerTask")}
                />
                <Th
                  label="Tier"
                  align="right"
                  active={sortKey === "tier"}
                  dir={sortDir}
                  onClick={() => toggleSort("tier")}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <Row key={row.agentId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="text-sm font-semibold tracking-tight">Agent outcomes</h3>
      <span className="text-[11px] text-muted-foreground/70">Last 7 days</span>
    </div>
  );
}

function Th({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      scope="col"
      className={cn(
        "py-2 pr-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" ? "flex-row-reverse" : "flex-row",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

function Row({ row }: { row: AgentOutcome }) {
  const tier = tierOf(row.costPerTaskCents);
  return (
    <tr className="border-b border-border/20 last:border-0">
      <td className="py-2 pr-3">
        <Link
          to={agentUrl({ id: row.agentId, name: row.agentName })}
          className="font-medium text-foreground hover:underline"
        >
          {row.agentName ?? "Unassigned"}
        </Link>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums font-semibold">
        {row.resolvedCount}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
        {row.costCents === 0 ? "—" : friendlyCost(row.costCents / 100)}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
        {row.costPerTaskCents === null
          ? "—"
          : friendlyCost(row.costPerTaskCents / 100)}
      </td>
      <td className="py-2 pr-3 text-right">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
            tierClasses(tier),
          )}
        >
          {tierLabel(tier)}
        </span>
      </td>
    </tr>
  );
}
