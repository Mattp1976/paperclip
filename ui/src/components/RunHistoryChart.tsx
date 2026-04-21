import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { heartbeatsApi } from "../api/heartbeats";
import { costsApi } from "../api/costs";
import { queryKeys } from "../lib/queryKeys";
import { formatCents, cn } from "../lib/utils";
import { CheckCircle2, Clock, Zap, DollarSign, Activity } from "lucide-react";
import type { HeartbeatRun } from "@mattparrytfc/shared";

/* ---- Helpers ---- */

function getLast14Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface DayBucket {
  date: string;
  succeeded: number;
  failed: number;
  cancelled: number;
  running: number;
  total: number;
  totalDurationSec: number;
  avgDurationSec: number;
}

function bucketRuns(runs: HeartbeatRun[], days: string[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const d of days) {
    map.set(d, {
      date: d,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      running: 0,
      total: 0,
      totalDurationSec: 0,
      avgDurationSec: 0,
    });
  }

  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const bucket = map.get(day);
    if (!bucket) continue;

    bucket.total += 1;
    if (run.status === "succeeded") bucket.succeeded += 1;
    else if (run.status === "failed" || run.status === "timed_out") bucket.failed += 1;
    else if (run.status === "cancelled") bucket.cancelled += 1;
    else bucket.running += 1;

    if (run.startedAt && run.finishedAt) {
      const dur = (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000;
      bucket.totalDurationSec += dur;
    }
  }

  for (const bucket of map.values()) {
    const completed = bucket.succeeded + bucket.failed + bucket.cancelled;
    bucket.avgDurationSec = completed > 0 ? bucket.totalDurationSec / completed : 0;
  }

  return days.map((d) => map.get(d)!);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

/* ---- Component ---- */

interface RunHistoryChartProps {
  companyId: string;
}

export function RunHistoryChart({ companyId }: RunHistoryChartProps) {
  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(companyId),
    queryFn: () => heartbeatsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: costSummary } = useQuery({
    queryKey: queryKeys.costs(companyId),
    queryFn: () => costsApi.summary(companyId),
    enabled: !!companyId,
  });

  const days = useMemo(() => getLast14Days(), []);
  const buckets = useMemo(() => bucketRuns(runs ?? [], days), [runs, days]);
  const maxTotal = useMemo(() => Math.max(...buckets.map((b) => b.total), 1), [buckets]);

  // Aggregate stats
  const totals = useMemo(() => {
    const t = { runs: 0, succeeded: 0, failed: 0, avgDurSec: 0, totalDurSec: 0, completed: 0 };
    for (const b of buckets) {
      t.runs += b.total;
      t.succeeded += b.succeeded;
      t.failed += b.failed;
      t.totalDurSec += b.totalDurationSec;
      t.completed += b.succeeded + b.failed + b.cancelled;
    }
    t.avgDurSec = t.completed > 0 ? t.totalDurSec / t.completed : 0;
    return t;
  }, [buckets]);

  const successRate = totals.runs > 0 ? (totals.succeeded / totals.runs) * 100 : 0;
  const totalCostCents = costSummary?.spendCents ?? 0;

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Run History — Last 14 Days
        </h3>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
        <KpiCard
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Total Runs"
          value={totals.runs.toLocaleString()}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
          label="Success Rate"
          value={`${successRate.toFixed(1)}%`}
          tone={successRate >= 90 ? "green" : successRate >= 70 ? "amber" : "red"}
        />
        <KpiCard
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Avg Duration"
          value={formatDuration(totals.avgDurSec)}
        />
        <KpiCard
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="Total Cost"
          value={formatCents(totalCostCents)}
        />
      </div>

      {/* Chart */}
      <div className="p-4">
        <div className="flex items-end gap-1 h-32">
          {buckets.map((bucket) => {
            const barHeight = maxTotal > 0 ? (bucket.total / maxTotal) * 100 : 0;
            const successPct = bucket.total > 0 ? (bucket.succeeded / bucket.total) * 100 : 0;
            const failPct = bucket.total > 0 ? (bucket.failed / bucket.total) * 100 : 0;
            const otherPct = 100 - successPct - failPct;

            return (
              <div
                key={bucket.date}
                className="flex-1 flex flex-col items-center gap-1 group relative"
              >
                {/* Tooltip */}
                <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 bg-popover border border-border shadow-md rounded px-2.5 py-1.5 text-[11px] whitespace-nowrap">
                  <p className="font-medium">{formatDay(bucket.date)}</p>
                  <p className="text-green-500">{bucket.succeeded} succeeded</p>
                  <p className="text-red-500">{bucket.failed} failed</p>
                  {bucket.cancelled > 0 && (
                    <p className="text-muted-foreground">{bucket.cancelled} cancelled</p>
                  )}
                  {bucket.running > 0 && (
                    <p className="text-blue-500">{bucket.running} running</p>
                  )}
                  {bucket.avgDurationSec > 0 && (
                    <p className="text-muted-foreground">Avg: {formatDuration(bucket.avgDurationSec)}</p>
                  )}
                </div>
                {/* Bar */}
                <div
                  className="w-full rounded-t overflow-hidden flex flex-col justify-end"
                  style={{ height: `${barHeight}%`, minHeight: bucket.total > 0 ? 4 : 0 }}
                >
                  {bucket.total > 0 && (
                    <>
                      <div
                        className="bg-sage-soft/80"
                        style={{ height: `${successPct}%`, minHeight: bucket.succeeded > 0 ? 2 : 0 }}
                      />
                      <div
                        className="bg-red-500/80"
                        style={{ height: `${failPct}%`, minHeight: bucket.failed > 0 ? 2 : 0 }}
                      />
                      <div
                        className="bg-muted-foreground/30"
                        style={{ height: `${otherPct}%`, minHeight: otherPct > 0 ? 1 : 0 }}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* Date labels */}
        <div className="flex gap-1 mt-1.5">
          {buckets.map((bucket, i) => (
            <div key={bucket.date} className="flex-1 text-center">
              {i % 3 === 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {formatDay(bucket.date)}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 justify-center">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm bg-sage-soft/80" />
            Succeeded
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500/80" />
            Failed
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" />
            Other
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---- KpiCard ---- */

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "green" | "amber" | "red";
}) {
  return (
    <div className="bg-white dark:bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "green" && "text-sage-ink",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "red" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}
