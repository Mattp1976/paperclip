/**
 * ExecutionState — single-glance answer to "what's happening right now?"
 *
 * Shows: progress bar (X of Y steps complete), the step currently in
 * flight, and an estimated remaining time. Designed so a non-technical
 * founder gets the answer in under 5 seconds.
 */
import { Activity, Clock, CheckCircle2, AlertCircle, Pause } from "lucide-react";
import type {
  OrchestraPlanStep,
  OutcomeStatus,
} from "@orqestra/shared";
import { SoftCard } from "@/components/SoftCard";
import { cn } from "@/lib/utils";

interface ExecutionStateProps {
  status: OutcomeStatus;
  steps: OrchestraPlanStep[];
  estimatedDurationMinutes: number | null;
  startedAt: Date | null;
}

export function ExecutionState({
  status,
  steps,
  estimatedDurationMinutes,
  startedAt,
}: ExecutionStateProps) {
  const total = steps.length;
  const completed = steps.filter((s) => s.status === "completed").length;
  const running = steps.find((s) => s.status === "running");
  const blocked = steps.find((s) => s.status === "blocked");
  const failed = steps.find((s) => s.status === "failed");
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

  const remainingHint = estimateRemaining(
    estimatedDurationMinutes,
    completed,
    total,
    startedAt,
  );

  const headline = headlineFor(status, running, blocked, failed);
  const headlineIcon = iconFor(status, running, blocked, failed);

  return (
    <SoftCard className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        {headlineIcon}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Right now
          </p>
          <p className="text-sm text-foreground/90 mt-0.5 leading-relaxed">
            {headline}
          </p>
        </div>
      </div>

      {total > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>
              <span className="text-foreground font-medium">{completed}</span>
              {" of "}
              <span className="text-foreground font-medium">{total}</span>
              {" steps complete"}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                progress === 100
                  ? "bg-emerald-500"
                  : status === "failed"
                    ? "bg-rose-400"
                    : "bg-primary",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {remainingHint ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {remainingHint}
        </div>
      ) : null}
    </SoftCard>
  );
}

function headlineFor(
  status: OutcomeStatus,
  running: OrchestraPlanStep | undefined,
  blocked: OrchestraPlanStep | undefined,
  failed: OrchestraPlanStep | undefined,
): string {
  if (failed) return `A step failed: ${failed.title}. Review needed`;
  if (blocked) return `Blocked on: ${blocked.title}`;
  if (running) return `Working on: ${running.title}`;
  if (status === "draft") return "Waiting for plan generation";
  if (status === "planning") return "Drafting the plan";
  if (status === "ready_to_execute") return "Plan drafted. Review and approve to start";
  if (status === "awaiting_clarification") return "Plan needs your input before continuing";
  if (status === "reviewing") return "Reviewing the latest work";
  if (status === "refining") return "Revising the latest output";
  if (status === "assembling") return "Assembling the final deliverable";
  if (status === "delivered") return "Delivered. Final work product is below";
  if (status === "cancelled") return "Cancelled";
  return "Idle";
}

function iconFor(
  status: OutcomeStatus,
  running: OrchestraPlanStep | undefined,
  blocked: OrchestraPlanStep | undefined,
  failed: OrchestraPlanStep | undefined,
) {
  if (failed) return <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />;
  if (blocked) return <Pause className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />;
  if (status === "delivered")
    return <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />;
  if (running)
    return (
      <Activity className="h-4 w-4 text-primary mt-0.5 shrink-0 animate-pulse" />
    );
  return <Activity className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />;
}

function estimateRemaining(
  estTotalMin: number | null,
  completed: number,
  total: number,
  startedAt: Date | null,
): string | null {
  if (estTotalMin == null || total === 0) return null;
  if (completed === total) return null;
  const remainingFraction = (total - completed) / total;
  const remainingMin = Math.round(estTotalMin * remainingFraction);
  if (remainingMin <= 0) return null;
  if (remainingMin < 60) return `About ${remainingMin} min remaining`;
  const h = Math.round((remainingMin / 60) * 10) / 10;
  if (h < 24) return `About ${h} h remaining`;
  return `About ${Math.round(h / 24)} days remaining`;
}
