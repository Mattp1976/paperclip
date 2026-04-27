/**
 * Orchestra — outcome-led orchestration layer.
 *
 * The user's mental model: "Tell Paperclip what outcome you want and it will
 * plan, delegate, execute, review, refine and deliver the finished work."
 *
 * Orchestra introduces the Outcome as a top-level unit. An Outcome holds:
 *   - the brief (what the user wants)
 *   - one or more OrchestraPlans (versioned; latest active one runs)
 *   - OrchestraPlanSteps (each linked to an Issue once executing)
 *   - OrchestraReviews (quality control checkpoints)
 *   - one OutcomeFinalAssembly (the final deliverable synthesis)
 *
 * Execution itself is delegated to the existing heartbeat: a step's Issue
 * is what actually gets picked up and run. Orchestra is the planner +
 * reviewer + assembler layered on top — it does not replace the run loop.
 *
 * Naming: in DB and in code we keep the term "issue" for backwards compat
 * with the existing schema. UI copy uses "task" / "step".
 */

export const OUTCOME_STATUSES = [
  "draft",
  "planning",
  "awaiting_clarification",
  "ready_to_execute",
  "executing",
  "reviewing",
  "refining",
  "assembling",
  "delivered",
  "failed",
  "cancelled",
] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export const OUTCOME_PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type OutcomePriority = (typeof OUTCOME_PRIORITIES)[number];

export const OUTCOME_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type OutcomeRiskLevel = (typeof OUTCOME_RISK_LEVELS)[number];

export const OUTCOME_TARGET_FORMATS = [
  "report",
  "memo",
  "deck_outline",
  "email",
  "strategy",
  "audit",
  "research_brief",
  "custom",
] as const;
export type OutcomeTargetFormat = (typeof OUTCOME_TARGET_FORMATS)[number];

export const OUTCOME_EXECUTION_MODES = [
  "review_plan_first",
  "auto_run_if_low_risk",
] as const;
export type OutcomeExecutionMode = (typeof OUTCOME_EXECUTION_MODES)[number];

export const PLAN_STATUSES = [
  "draft",
  "approved",
  "executing",
  "superseded",
  "failed",
] as const;
export type OrchestraPlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STEP_STATUSES = [
  "pending",
  "ready",
  "assigned",
  "running",
  "blocked",
  "completed",
  "failed",
  "skipped",
] as const;
export type OrchestraPlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];

export const PLAN_STEP_TYPES = [
  "research",
  "analysis",
  "writing",
  "review",
  "synthesis",
  "decision",
  "delivery",
] as const;
export type OrchestraPlanStepType = (typeof PLAN_STEP_TYPES)[number];

export const REVIEW_STATUSES = [
  "pending",
  "passed",
  "needs_revision",
  "failed",
] as const;
export type OrchestraReviewStatus = (typeof REVIEW_STATUSES)[number];

export const ASSEMBLY_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "failed",
] as const;
export type OutcomeAssemblyStatus = (typeof ASSEMBLY_STATUSES)[number];

export const ORCHESTRA_EVENT_TYPES = [
  "outcome.created",
  "outcome.plan.started",
  "outcome.plan.created",
  "outcome.plan.requires_clarification",
  "outcome.plan.approved",
  "outcome.plan.failed",
  "outcome.execution.started",
  "outcome.step.assigned",
  "outcome.step.started",
  "outcome.step.completed",
  "outcome.step.failed",
  "outcome.step.review.started",
  "outcome.step.review.passed",
  "outcome.step.review.failed",
  "outcome.step.revision.created",
  "outcome.assembly.started",
  "outcome.assembly.completed",
  "outcome.delivered",
  "outcome.failed",
  "outcome.cancelled",
] as const;
export type OrchestraEventType = (typeof ORCHESTRA_EVENT_TYPES)[number];

// ─────────────────────────────────────────────────────────────────────────
// Entities
// ─────────────────────────────────────────────────────────────────────────

export interface Outcome {
  id: string;
  companyId: string;
  projectId: string | null;
  createdByUserId: string | null;
  title: string;
  brief: string;
  status: OutcomeStatus;
  priority: OutcomePriority;
  riskLevel: OutcomeRiskLevel | null;
  budgetLimitCents: number | null;
  deadline: Date | null;
  targetFormat: OutcomeTargetFormat;
  executionMode: OutcomeExecutionMode;
  /** Agent doing planning/orchestration. Defaults to the company CEO. */
  orchestratorAgentId: string | null;
  /** Final IssueWorkProduct id once delivered. */
  finalWorkProductId: string | null;
  /** Free-form metadata for hero workflow templates etc. */
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrchestraPlanRiskItem {
  description: string;
  likelihood?: "low" | "medium" | "high";
  mitigation?: string;
}

export interface OrchestraPlanRequiredInput {
  field: string;
  question: string;
  required: boolean;
}

export interface OrchestraPlan {
  id: string;
  outcomeId: string;
  companyId: string;
  version: number;
  status: OrchestraPlanStatus;
  summary: string;
  assumptions: string[];
  risks: OrchestraPlanRiskItem[];
  requiredInputs: OrchestraPlanRequiredInput[];
  estimatedCostCents: number | null;
  estimatedDurationMinutes: number | null;
  /** 0 – 1 self-assessed confidence from the planner. */
  confidenceScore: number | null;
  createdByAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrchestraStepAcceptanceCriterion {
  /** Short label, e.g. "covers all top-3 competitors". */
  criterion: string;
  /** Optional how-to-check guidance for the reviewer agent. */
  howToVerify?: string;
}

export interface OrchestraPlanStep {
  id: string;
  planId: string;
  outcomeId: string;
  companyId: string;
  parentStepId: string | null;
  /** Order within the plan (used for stable display + tie-breaking). */
  ordinal: number;
  title: string;
  description: string;
  stepType: OrchestraPlanStepType;
  status: OrchestraPlanStepStatus;
  recommendedAgentId: string | null;
  assignedAgentId: string | null;
  /** The Issue carrying out this step (set once assigned). */
  issueId: string | null;
  dependsOnStepIds: string[];
  acceptanceCriteria: OrchestraStepAcceptanceCriterion[];
  reviewCriteria: string[];
  outputRequirement: string | null;
  /** Number of revision passes already attempted. */
  revisionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrchestraReview {
  id: string;
  outcomeId: string;
  planId: string;
  stepId: string | null;
  reviewedWorkProductId: string | null;
  reviewerAgentId: string;
  status: OrchestraReviewStatus;
  /** 0 – 100. */
  score: number | null;
  comments: string | null;
  /** Surfaced to the producer agent when revision is needed. */
  revisionInstructions: string | null;
  /** Specific gaps the reviewer flagged. */
  gaps: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OutcomeFinalAssembly {
  id: string;
  outcomeId: string;
  planId: string;
  assemblerAgentId: string;
  status: OutcomeAssemblyStatus;
  sourceWorkProductIds: string[];
  /** Headings + ordered references the assembler used. */
  structure: Array<{ heading: string; sourceWorkProductIds: string[] }> | null;
  finalMarkdown: string | null;
  finalSummary: string | null;
  unresolvedLimitations: string[];
  recommendedNextActions: string[];
  /** Optional final work product id once persisted. */
  finalWorkProductId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────
// Request / response shapes
// ─────────────────────────────────────────────────────────────────────────

export interface CreateOutcomeRequest {
  title: string;
  brief: string;
  targetFormat?: OutcomeTargetFormat;
  priority?: OutcomePriority;
  deadline?: string | null; // ISO
  budgetLimitCents?: number | null;
  projectId?: string | null;
  preferredAgentIds?: string[];
  executionMode?: OutcomeExecutionMode;
  /** Optional template id (e.g. "strategic_market_intelligence_report"). */
  templateId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OutcomeListItem {
  id: string;
  title: string;
  brief: string;
  status: OutcomeStatus;
  priority: OutcomePriority;
  riskLevel: OutcomeRiskLevel | null;
  targetFormat: OutcomeTargetFormat;
  deadline: Date | null;
  budgetLimitCents: number | null;
  costSoFarCents: number;
  stepsCompleted: number;
  stepsTotal: number;
  finalWorkProductId: string | null;
  assignedAgentIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OutcomeDetail extends Outcome {
  costSoFarCents: number;
  /** Latest active plan (executing or approved). Older versions are in `history`. */
  plan: OrchestraPlan | null;
  steps: OrchestraPlanStep[];
  reviews: OrchestraReview[];
  finalAssembly: OutcomeFinalAssembly | null;
  history: { plans: OrchestraPlan[] };
}

export interface OrchestraTimelineEvent {
  id: string;
  outcomeId: string;
  type: OrchestraEventType;
  /** Friendly summary for the timeline UI. */
  message: string;
  data: Record<string, unknown> | null;
  occurredAt: Date;
}

export interface PlannerLLMResult {
  outcomeSummary: string;
  assumptions: string[];
  missingInputs: OrchestraPlanRequiredInput[];
  riskLevel: OutcomeRiskLevel;
  estimatedCostCents: number;
  estimatedDurationMinutes: number;
  confidenceScore: number;
  steps: Array<{
    title: string;
    description: string;
    stepType: OrchestraPlanStepType;
    dependencies: number[]; // ordinals
    recommendedAgentType: string; // "ceo" | "specialist" | "manager" | role hint
    acceptanceCriteria: OrchestraStepAcceptanceCriterion[];
    reviewCriteria: string[];
    outputRequirement: string;
  }>;
}

export interface ReviewerLLMResult {
  pass: boolean;
  score: number;
  comments: string;
  gaps: string[];
  revisionInstructions: string;
  recommendedNextAction: "accept" | "revise" | "escalate";
}

export interface AssemblerLLMResult {
  finalMarkdown: string;
  executiveSummary: string;
  structure: Array<{ heading: string; sourceWorkProductIds: string[] }>;
  unresolvedLimitations: string[];
  recommendedNextActions: string[];
}
