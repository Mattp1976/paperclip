/**
 * GeneratedPlanPreview — what the user sees after the planner returns.
 *
 * Lays out the proposed work in confidence-building order:
 *   - one-line summary
 *   - estimated cost · duration · confidence
 *   - the steps (numbered, with assigned agent + step type chip)
 *   - assumptions the planner is making
 *   - risks the planner flagged
 *   - clarifying questions (if the planner couldn't decide alone)
 *
 * Voice: factual, not hypey. Show what we know. Show what we don't.
 */
import {
  Sparkles,
  Coins,
  Clock,
  Gauge,
  ListChecks,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import type {
  OutcomeDetail,
  OrchestraPlanStep,
  OrchestraPlanStepType,
  OrchestraPlanRequiredInput,
} from "@orqestra/shared";
import { SoftCard } from "@/components/SoftCard";
import { friendlyCost, cn } from "@/lib/utils";

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

interface GeneratedPlanPreviewProps {
  detail: OutcomeDetail;
  /** Names keyed by agent id, fetched from the agents query. */
  agentNameById: Record<string, string>;
}

export function GeneratedPlanPreview({
  detail,
  agentNameById,
}: GeneratedPlanPreviewProps) {
  const plan = detail.plan;
  if (!plan) return null;

  const steps = [...detail.steps].sort((a, b) => a.ordinal - b.ordinal);
  const requiredMissing = plan.requiredInputs.filter((m) => m.required);

  return (
    <div className="space-y-5">
      {/* Headline summary */}
      <SoftCard className="p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Proposed plan
            </p>
            <p className="text-[15px] leading-relaxed text-foreground">
              {plan.summary}
            </p>
          </div>
        </div>
      </SoftCard>

      {/* Cost · time · confidence row */}
      <div className="grid grid-cols-3 gap-3">
        <Stat
          icon={Coins}
          label="Estimated cost"
          value={
            plan.estimatedCostCents != null
              ? friendlyCost(plan.estimatedCostCents / 100)
              : "—"
          }
          hint="Approximate. Live cost shown once running"
        />
        <Stat
          icon={Clock}
          label="Estimated time"
          value={formatDuration(plan.estimatedDurationMinutes)}
          hint="From start to delivered"
        />
        <Stat
          icon={Gauge}
          label="Planner confidence"
          value={
            plan.confidenceScore != null
              ? `${Math.round(plan.confidenceScore * 100)}%`
              : "—"
          }
          hint={confidenceHint(plan.confidenceScore)}
        />
      </div>

      {/* Steps timeline */}
      <SoftCard className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            {steps.length} step{steps.length === 1 ? "" : "s"}
          </h2>
        </div>
        <ol className="space-y-3">
          {steps.map((step, idx) => (
            <StepRow
              key={step.id}
              step={step}
              ordinal={idx + 1}
              agentName={
                step.recommendedAgentId
                  ? agentNameById[step.recommendedAgentId] ?? null
                  : null
              }
            />
          ))}
        </ol>
      </SoftCard>

      {/* Assumptions */}
      {plan.assumptions.length > 0 && (
        <SoftCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            What the planner is assuming
          </h2>
          <ul className="space-y-1.5">
            {plan.assumptions.map((a, i) => (
              <li
                key={i}
                className="text-sm text-muted-foreground leading-relaxed flex gap-2"
              >
                <span className="text-foreground/40 select-none">·</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </SoftCard>
      )}

      {/* Risks */}
      {plan.risks.length > 0 && (
        <SoftCard className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-foreground">Risks</h2>
          </div>
          <ul className="space-y-2">
            {plan.risks.map((r, i) => (
              <li
                key={i}
                className="text-sm text-muted-foreground leading-relaxed"
              >
                <span className="text-foreground">{r.description}</span>
                {r.mitigation ? (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Mitigation: {r.mitigation}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </SoftCard>
      )}

      {/* Clarifying questions — only if blocking */}
      {requiredMissing.length > 0 && (
        <SoftCard className="p-5 border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            <h2 className="text-sm font-semibold text-foreground">
              The planner needs your input before running
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Add answers to your brief and re-plan
          </p>
          <ul className="space-y-2">
            {requiredMissing.map((q: OrchestraPlanRequiredInput) => (
              <li key={q.field} className="text-sm leading-relaxed">
                <span className="font-medium text-foreground">
                  {q.question}
                </span>
              </li>
            ))}
          </ul>
        </SoftCard>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <SoftCard className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      {hint ? (
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          {hint}
        </p>
      ) : null}
    </SoftCard>
  );
}

function StepRow({
  step,
  ordinal,
  agentName,
}: {
  step: OrchestraPlanStep;
  ordinal: number;
  agentName: string | null;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {ordinal}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
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
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {step.description}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {agentName ? (
            <>
              <span className="text-foreground/80">Route to:</span>{" "}
              <span className="font-medium text-foreground">{agentName}</span>
            </>
          ) : (
            <span className="italic">No agent matched yet</span>
          )}
        </p>
      </div>
    </li>
  );
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.round((minutes / 60) * 10) / 10;
  if (h < 24) return `${h} h`;
  const d = Math.round((h / 24) * 10) / 10;
  return `${d} days`;
}

function confidenceHint(score: number | null): string {
  if (score == null) return "Planner did not score";
  if (score >= 0.8) return "High — brief was clear";
  if (score >= 0.5) return "Medium — some assumptions made";
  return "Low — consider adding more context";
}
