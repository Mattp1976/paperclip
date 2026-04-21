import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { heartbeatsApi } from "../api/heartbeats";
import { dashboardApi } from "../api/dashboard";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents } from "../lib/utils";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import type { HeartbeatRun } from "@mattparrytfc/shared";

/* ---- Types ---- */

interface ForecastData {
  dailyBurnCents: number;
  weeklyBurnCents: number;
  monthlyBurnCents: number;
  monthBudgetCents: number;
  monthSpentCents: number;
  projectedMonthEndCents: number;
  daysRemaining: number;
  budgetRemainingCents: number;
  overBudgetProjected: boolean;
  projectedOverageCents: number;
  burnTrend: "increasing" | "decreasing" | "stable";
  recentDailySpends: { date: string; cents: number }[];
}

/* ---- Helpers ---- */

/**
 * Derive daily spend from heartbeat runs (each run has cost events).
 * We bucket runs by day over the last 14 days and sum up their costs
 * from the cost-by-agent data to estimate daily burn.
 */
function computeForecast(
  monthBudgetCents: number,
  monthSpentCents: number,
  runs: HeartbeatRun[],
): ForecastData {
  // Build daily run counts for last 14 days
  const now = new Date();
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  // Count runs per day
  const runsByDay = new Map<string, number>();
  for (const d of days) runsByDay.set(d, 0);

  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    if (runsByDay.has(day)) {
      runsByDay.set(day, (runsByDay.get(day) ?? 0) + 1);
    }
  }

  // Estimate daily cost from month spend and days elapsed
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysElapsed = Math.max(1, Math.ceil((now.getTime() - startOfMonth.getTime()) / (24 * 60 * 60 * 1000)));
  const dailyBurnCents = daysElapsed > 0 ? monthSpentCents / daysElapsed : 0;

  // Build daily spend estimates from run distribution
  // Proportionally distribute month spend based on daily run counts
  const totalRuns14d = Array.from(runsByDay.values()).reduce((s, v) => s + v, 0);
  const recentDailySpends = days.map((d) => {
    const dayRuns = runsByDay.get(d) ?? 0;
    // Proportional estimate: if we know total month spend and how runs distribute
    const cents = totalRuns14d > 0
      ? Math.round((dayRuns / totalRuns14d) * monthSpentCents)
      : 0;
    return { date: d, cents };
  });

  const weeklyBurnCents = dailyBurnCents * 7;
  const monthlyBurnCents = dailyBurnCents * 30;

  // Days remaining in current month
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = Math.max(0, endOfMonth.getDate() - now.getDate());

  // Projected month-end spend
  const projectedMonthEndCents = monthSpentCents + dailyBurnCents * daysRemaining;

  const budgetRemainingCents = monthBudgetCents - monthSpentCents;
  const overBudgetProjected =
    monthBudgetCents > 0 && projectedMonthEndCents > monthBudgetCents;
  const projectedOverageCents = overBudgetProjected
    ? projectedMonthEndCents - monthBudgetCents
    : 0;

  // Burn trend: compare first half vs second half of last 7 days of spends
  let burnTrend: "increasing" | "decreasing" | "stable" = "stable";
  const last7Spends = recentDailySpends.slice(-7);
  if (last7Spends.length >= 4) {
    const mid = Math.floor(last7Spends.length / 2);
    const firstHalf = last7Spends.slice(0, mid);
    const secondHalf = last7Spends.slice(mid);
    const avgFirst = firstHalf.reduce((s, r) => s + r.cents, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, r) => s + r.cents, 0) / secondHalf.length;
    const change = avgFirst > 0 ? (avgSecond - avgFirst) / avgFirst : 0;
    if (change > 0.15) burnTrend = "increasing";
    else if (change < -0.15) burnTrend = "decreasing";
  }

  return {
    dailyBurnCents,
    weeklyBurnCents,
    monthlyBurnCents,
    monthBudgetCents,
    monthSpentCents,
    projectedMonthEndCents,
    daysRemaining,
    budgetRemainingCents,
    overBudgetProjected,
    projectedOverageCents,
    burnTrend,
    recentDailySpends,
  };
}

/* ---- Component ---- */

export function BudgetForecast({ companyId }: { companyId: string }) {
  const { data: dashboard } = useQuery({
    queryKey: queryKeys.dashboard(companyId),
    queryFn: () => dashboardApi.summary(companyId),
    enabled: !!companyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(companyId),
    queryFn: () => heartbeatsApi.list(companyId),
    enabled: !!companyId,
  });

  const forecast = useMemo(() => {
    if (!runs || !dashboard) return null;
    return computeForecast(
      dashboard.costs.monthBudgetCents,
      dashboard.costs.monthSpendCents,
      runs,
    );
  }, [runs, dashboard]);

  if (!forecast) {
    return (
      <div className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] px-4 py-6 text-center text-sm text-muted-foreground">
        Loading forecast...
      </div>
    );
  }

  const maxDailySpend = Math.max(...forecast.recentDailySpends.map((d) => d.cents), 1);

  return (
    <div className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/30 flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Budget Forecast</span>
        <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {forecast.daysRemaining}d remaining
        </span>
      </div>

      {/* Alert banner if over budget projected */}
      {forecast.overBudgetProjected && (
        <div className="px-4 py-2.5 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
          <span className="text-xs text-destructive">
            Projected to exceed budget by{" "}
            <span className="font-semibold">
              {formatCents(forecast.projectedOverageCents)}
            </span>{" "}
            at current burn rate
          </span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-px bg-border">
        <ForecastKpi
          label="Daily Burn"
          value={formatCents(forecast.dailyBurnCents)}
          trend={forecast.burnTrend}
        />
        <ForecastKpi
          label="Monthly Projection"
          value={formatCents(forecast.projectedMonthEndCents)}
          alert={forecast.overBudgetProjected}
        />
        <ForecastKpi
          label="Budget Remaining"
          value={
            forecast.monthBudgetCents > 0
              ? formatCents(forecast.budgetRemainingCents)
              : "Unlimited"
          }
          positive={forecast.budgetRemainingCents > 0}
        />
      </div>

      {/* Burn rate sparkline */}
      {forecast.recentDailySpends.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[11px] text-muted-foreground mb-2">
            Estimated daily spend — last {forecast.recentDailySpends.length} days
          </p>
          <div className="flex items-end gap-0.5 h-16">
            {forecast.recentDailySpends.map((d) => {
              const height = maxDailySpend > 0 ? (d.cents / maxDailySpend) * 100 : 0;
              const isOverAvg = d.cents > forecast.dailyBurnCents * 1.3;
              return (
                <div
                  key={d.date}
                  className="flex-1 group relative"
                >
                  <div
                    className={cn(
                      "w-full rounded-t transition-colors",
                      isOverAvg
                        ? "bg-red-500/60 hover:bg-red-500/80"
                        : "bg-blue-500/40 hover:bg-blue-500/60",
                    )}
                    style={{ height: `${height}%`, minHeight: d.cents > 0 ? 2 : 0 }}
                  />
                  {/* Tooltip */}
                  <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 bg-popover border border-border shadow-md rounded px-2 py-1 text-[10px] whitespace-nowrap">
                    <p className="font-medium">{d.date}</p>
                    <p>{formatCents(d.cents)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Budget line indicator */}
          {forecast.monthBudgetCents > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 border-t border-dashed border-amber-500/50" />
              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                Daily budget target:{" "}
                {formatCents(
                  Math.round(
                    forecast.monthBudgetCents /
                      new Date(
                        new Date().getFullYear(),
                        new Date().getMonth() + 1,
                        0,
                      ).getDate(),
                  ),
                )}
                /day
              </span>
            </div>
          )}
        </div>
      )}

      {/* Projection bar */}
      {forecast.monthBudgetCents > 0 && (
        <div className="px-5 py-3 border-t border-border/30">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-muted-foreground">Budget utilization</span>
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                forecast.overBudgetProjected
                  ? "text-destructive"
                  : "text-sage-ink",
              )}
            >
              {Math.round(
                (forecast.monthSpentCents / forecast.monthBudgetCents) * 100,
              )}
              % used
            </span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden relative">
            {/* Actual spend */}
            <div
              className={cn(
                "h-full rounded-full transition-all",
                forecast.overBudgetProjected ? "bg-red-500" : "bg-blue-500",
              )}
              style={{
                width: `${Math.min(
                  100,
                  (forecast.monthSpentCents / forecast.monthBudgetCents) * 100,
                )}%`,
              }}
            />
            {/* Projected indicator */}
            <div
              className="absolute top-0 h-full w-0.5 bg-amber-500"
              style={{
                left: `${Math.min(
                  100,
                  (forecast.projectedMonthEndCents / forecast.monthBudgetCents) * 100,
                )}%`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">
              {formatCents(forecast.monthSpentCents)} spent
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatCents(forecast.monthBudgetCents)} budget
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Sub-components ---- */

function ForecastKpi({
  label,
  value,
  trend,
  alert,
  positive,
}: {
  label: string;
  value: string;
  trend?: "increasing" | "decreasing" | "stable";
  alert?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <span className="text-[11px]">{label}</span>
        {trend === "increasing" && (
          <TrendingUp className="h-3 w-3 text-red-500" />
        )}
        {trend === "decreasing" && (
          <TrendingDown className="h-3 w-3 text-green-500" />
        )}
      </div>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          alert && "text-destructive",
          positive === true && "text-sage-ink",
          positive === false && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
