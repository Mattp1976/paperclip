/**
 * PillRunChart — rounded pill-shaped bar chart of daily run activity.
 *
 * Modeled on the "Project Analytics" chart in the reference design:
 * - Filled pills for days with activity (stacked succeeded/failed/other)
 * - Dashed outline pills for days with zero runs (the "future" look)
 * - A subtle baseline, weekday labels, and a summary in the top-right
 */
import type { HeartbeatRun } from "@mattparrytfc/shared";
import { useMemo } from "react";

const DAYS_WINDOW = 14;

function getWindow(): { date: string; label: string; weekday: string }[] {
  const now = new Date();
  const out: { date: string; label: string; weekday: string }[] = [];
  for (let i = DAYS_WINDOW - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push({
      date: d.toISOString().slice(0, 10),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      weekday: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()],
    });
  }
  return out;
}

interface PillRunChartProps {
  runs: HeartbeatRun[];
}

export function PillRunChart({ runs }: PillRunChartProps) {
  const days = useMemo(() => getWindow(), []);

  const grouped = useMemo(() => {
    const g = new Map<string, { succeeded: number; failed: number; other: number }>();
    for (const d of days) g.set(d.date, { succeeded: 0, failed: 0, other: 0 });
    for (const run of runs) {
      const day = new Date(run.createdAt).toISOString().slice(0, 10);
      const entry = g.get(day);
      if (!entry) continue;
      if (run.status === "succeeded") entry.succeeded++;
      else if (run.status === "failed" || run.status === "timed_out") entry.failed++;
      else entry.other++;
    }
    return g;
  }, [days, runs]);

  const totals = days.map((d) => {
    const e = grouped.get(d.date)!;
    return { ...e, total: e.succeeded + e.failed + e.other };
  });
  const maxValue = Math.max(...totals.map((t) => t.total), 1);

  const weekTotal = totals.reduce((s, t) => s + t.total, 0);
  const weekSucceeded = totals.reduce((s, t) => s + t.succeeded, 0);
  const weekFailed = totals.reduce((s, t) => s + t.failed, 0);
  const successPct =
    weekTotal > 0 ? Math.round((weekSucceeded / weekTotal) * 100) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 pb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-foreground">Run activity</h3>
          <span className="text-[11px] text-muted-foreground/70">
            Last {DAYS_WINDOW} days
          </span>
        </div>
        <div className="flex items-baseline gap-2 text-right">
          <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground leading-none">
            {weekTotal}
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            {successPct !== null ? `${successPct}% success` : "No runs yet"}
            {weekFailed > 0 && ` · ${weekFailed} failed`}
          </p>
        </div>
      </div>

      <div className="relative flex flex-1 items-end gap-1.5 pt-1 min-h-[72px]">
        {days.map((d, i) => {
          const e = totals[i];
          const heightPct = e.total > 0 ? Math.max((e.total / maxValue) * 100, 12) : 0;
          const empty = e.total === 0;

          return (
            <div
              key={d.date}
              className="group/pill relative flex flex-1 flex-col items-stretch justify-end"
              title={`${d.date}: ${e.total} runs (${e.succeeded} succeeded, ${e.failed} failed)`}
            >
              {empty ? (
                // Dashed "empty" pill — matches the future-state look in the reference.
                <div
                  className="w-full rounded-full border border-dashed border-border/60 dark:border-border/40"
                  style={{ height: "18%" }}
                />
              ) : (
                <div
                  className="relative w-full overflow-hidden rounded-full transition-all duration-300 group-hover/pill:brightness-110"
                  style={{ height: `${heightPct}%`, minHeight: 14 }}
                >
                  {/* Stack: failed on top, other middle, succeeded base (green dominant) */}
                  <div className="flex h-full flex-col-reverse">
                    {e.succeeded > 0 && (
                      <div
                        className="bg-primary"
                        style={{ flex: e.succeeded }}
                      />
                    )}
                    {e.other > 0 && (
                      <div
                        className="bg-[#C8C0B4] dark:bg-[#7A7266]"
                        style={{ flex: e.other }}
                      />
                    )}
                    {e.failed > 0 && (
                      <div
                        className="bg-rose-deep dark:bg-rose-soft"
                        style={{ flex: e.failed }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        {days.map((d, i) => (
          <div
            key={d.date}
            className="flex flex-1 justify-center"
            aria-hidden
          >
            <span
              className={
                i === 0 || i === days.length - 1 || i === 7
                  ? "text-[9px] text-muted-foreground/70 tabular-nums"
                  : "text-[9px] text-muted-foreground/40"
              }
            >
              {i === 0 || i === days.length - 1 || i === 7 ? d.label : d.weekday}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Succeeded
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-deep" />
          Failed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#C8C0B4]" />
          Other
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-dashed border-border" />
          No runs
        </span>
      </div>
    </div>
  );
}
