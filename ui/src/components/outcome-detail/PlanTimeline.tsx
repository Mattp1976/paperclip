/**
 * PlanTimeline — vertical timeline of plan steps with live status,
 * the agent each one is routed to, and the step type.
 *
 * Reuses the same step taxonomy as the planner preview but adds a
 * real status pill so the user can watch progress unfold.
 */
import {
  Circle,
  CheckCircle2,
  Loader2,
  XCircle,
  AlertCircle,
  CircleSlash,
  Pause,
} from "lucide-react";
import type {
  OrchestraPlanStep,
  OrchestraPlanStepStatus,
  OrchestraPlanStepType,
} from "@orqestra/shared";
import { SoftCard } from "@/components/SoftCard";
import { cn } from "@/lib/utils";

const STEP_TYPE_TONE: Record<OrchestraPlanStepType, string> = {
  research:
    "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  analysis:
    "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  writing:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  review:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  synthesis:
    "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  decision:
    "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  delivery:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const STEP_TYPE_LABEL: Record<OrchestraPlanStepType, string> = {
  research: "Research",
  analysis: "Analysis",
  writing: "Writing",
  review: "Review",
  synthesis: "Synthesis",
  decision: "Decision",
  delivery: "Delivery",
};

const STEP_STATUS_LABEL: Record<OrchestraPlanStepStatus, string> = {
  pending: "Waiting on dependencies",
  ready: "Ready to start",
  assigned: "Assigned",
  running: "In progress",
  blocked: "Blocked",
  completed: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

interface PlanTimelineProps {
  steps: OrchestraPlanStep[];
  agentNameById: Record<string, string>;
}

export function PlanTimeline({ steps, agentNameById }: PlanTimelineProps) {
  const ordered = [...steps].sort((a, b) => a.ordinal - b.ordinal);

  if (ordered.length === 0) {
    return (
      <SoftCard className="p-5">
        <p className="text-sm text-muted-foreground">No plan yet</p>
      </SoftCard>
    );
  }

  return (
    <SoftCard className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">
        Plan timeline
      </h2>
      <ol className="space-y-0 relative">
        {ordered.map((step, idx) => (
          <StepRow
            key={step.id}
            step={step}
            ordinal={idx + 1}
            isLast={idx === ordered.length - 1}
            agentName={
              step.assignedAgentId
                ? agentNameById[step.assignedAgentId] ?? null
                : step.recommendedAgentId
                  ? agentNameById[step.recommendedAgentId] ?? null
                  : null
            }
          />
        ))}
      </ol>
    </SoftCard>
  );
}

function StepRow({
  step,
  ordinal,
  isLast,
  agentName,
}: {
  step: OrchestraPlanStep;
  ordinal: number;
  isLast: boolean;
  agentName: string | null;
}) {
  return (
    <li className="flex gap-3 relative">
      {/* Connector line */}
      {!isLast ? (
        <span
          aria-hidden="true"
          className="absolute left-[11px] top-7 h-[calc(100%-12px)] w-px bg-border/60"
        />
      ) : null}

      {/* Status icon */}
      <div className="shrink-0 pt-0.5 z-10">
        <StatusGlyph status={step.status} />
      </div>

      {/* Step content */}
      <div className="min-w-0 flex-1 pb-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-mono text-muted-foreground">
            {ordinal}.
          </span>
          <span className="text-sm font-medium text-foreground">
            {step.title}
          </span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded",
              STEP_TYPE_TONE[step.stepType],
            )}
          >
            {STEP_TYPE_LABEL[step.stepType]}
          </span>
        </div>
        {step.description ? (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
            {step.description}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{STEP_STATUS_LABEL[step.status]}</span>
          {agentName ? (
            <span>
              <span className="text-foreground/60">·</span>{" "}
              <span className="text-foreground/80">Route to:</span>{" "}
              <span className="font-medium text-foreground">{agentName}</span>
            </span>
          ) : null}
          {step.revisionCount > 0 ? (
            <span>
              <span className="text-foreground/60">·</span> revision{" "}
              {step.revisionCount}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function StatusGlyph({ status }: { status: OrchestraPlanStepStatus }) {
  switch (status) {
    case "completed":
      return (
        <CheckCircle2 className="h-[22px] w-[22px] text-emerald-600 fill-emerald-50 dark:fill-transparent" />
      );
    case "running":
      return (
        <Loader2 className="h-[22px] w-[22px] text-primary animate-spin" />
      );
    case "failed":
      return <XCircle className="h-[22px] w-[22px] text-rose-600" />;
    case "blocked":
      return <Pause className="h-[22px] w-[22px] text-amber-600" />;
    case "skipped":
      return <CircleSlash className="h-[22px] w-[22px] text-muted-foreground" />;
    case "ready":
    case "assigned":
      return <AlertCircle className="h-[22px] w-[22px] text-blue-500" />;
    case "pending":
    default:
      return (
        <Circle className="h-[22px] w-[22px] text-muted-foreground/50" />
      );
  }
}
