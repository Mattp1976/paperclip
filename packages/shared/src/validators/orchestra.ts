/**
 * Zod validators for Orchestra requests + LLM JSON contracts.
 *
 * The LLM-result schemas (planner/reviewer/assembler) are deliberately
 * forgiving on extra keys but strict on required structure, because
 * planner JSON parsing is on the critical path. The orchestra service
 * retries with a "repair" prompt once on validation failure.
 */
import { z } from "zod";
import {
  OUTCOME_PRIORITIES,
  OUTCOME_RISK_LEVELS,
  OUTCOME_TARGET_FORMATS,
  OUTCOME_EXECUTION_MODES,
  PLAN_STEP_TYPES,
} from "../types/orchestra.js";

const enumOf = <T extends readonly string[]>(values: T) =>
  z.enum(values as unknown as [string, ...string[]]);

const outcomePrioritySchema = enumOf(OUTCOME_PRIORITIES);
const outcomeRiskLevelSchema = enumOf(OUTCOME_RISK_LEVELS);
const outcomeTargetFormatSchema = enumOf(OUTCOME_TARGET_FORMATS);
const outcomeExecutionModeSchema = enumOf(OUTCOME_EXECUTION_MODES);
const planStepTypeSchema = enumOf(PLAN_STEP_TYPES);

export const createOutcomeSchema = z.object({
  title: z.string().min(1).max(200),
  brief: z.string().min(1).max(8000),
  targetFormat: outcomeTargetFormatSchema.optional(),
  priority: outcomePrioritySchema.optional(),
  deadline: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  budgetLimitCents: z.number().int().nonnegative().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  preferredAgentIds: z.array(z.string().uuid()).optional(),
  executionMode: outcomeExecutionModeSchema.optional(),
  templateId: z.string().min(1).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateOutcomeInput = z.infer<typeof createOutcomeSchema>;

export const updateOutcomeSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    brief: z.string().min(1).max(8000).optional(),
    priority: outcomePrioritySchema.optional(),
    deadline: z.string().datetime({ offset: true }).nullable().optional(),
    budgetLimitCents: z.number().int().nonnegative().nullable().optional(),
    targetFormat: outcomeTargetFormatSchema.optional(),
    executionMode: outcomeExecutionModeSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateOutcomeInput = z.infer<typeof updateOutcomeSchema>;

export const approvePlanSchema = z.object({
  planId: z.string().uuid(),
  /** Optional comment surfaced in the activity feed. */
  comment: z.string().max(1000).optional(),
});
export type ApprovePlanInput = z.infer<typeof approvePlanSchema>;

// ─────────────────────────────────────────────────────────────────────────
// LLM result schemas — used to validate the strict JSON returned by the
// planner / reviewer / assembler agents before we persist it.
// ─────────────────────────────────────────────────────────────────────────

const plannerStepSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(2000),
  stepType: planStepTypeSchema,
  dependencies: z.array(z.number().int().nonnegative()).default([]),
  recommendedAgentType: z.string().min(1).max(60),
  acceptanceCriteria: z
    .array(
      z.object({
        criterion: z.string().min(1),
        howToVerify: z.string().optional(),
      }),
    )
    .default([]),
  reviewCriteria: z.array(z.string().min(1)).default([]),
  outputRequirement: z.string().min(1).max(1000),
});

export const plannerLLMResultSchema = z.object({
  outcomeSummary: z.string().min(1),
  assumptions: z.array(z.string()).default([]),
  missingInputs: z
    .array(
      z.object({
        field: z.string().min(1),
        question: z.string().min(1),
        required: z.boolean(),
      }),
    )
    .default([]),
  riskLevel: outcomeRiskLevelSchema,
  estimatedCostCents: z.number().int().nonnegative(),
  estimatedDurationMinutes: z.number().int().nonnegative(),
  confidenceScore: z.number().min(0).max(1),
  steps: z.array(plannerStepSchema).min(1).max(40),
});
export type PlannerLLMResultParsed = z.infer<typeof plannerLLMResultSchema>;

export const reviewerLLMResultSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(100),
  comments: z.string().default(""),
  gaps: z.array(z.string()).default([]),
  revisionInstructions: z.string().default(""),
  recommendedNextAction: z.enum(["accept", "revise", "escalate"]),
});
export type ReviewerLLMResultParsed = z.infer<typeof reviewerLLMResultSchema>;

export const assemblerLLMResultSchema = z.object({
  finalMarkdown: z.string().min(1),
  executiveSummary: z.string().default(""),
  structure: z
    .array(
      z.object({
        heading: z.string().min(1),
        sourceWorkProductIds: z.array(z.string()),
      }),
    )
    .default([]),
  unresolvedLimitations: z.array(z.string()).default([]),
  recommendedNextActions: z.array(z.string()).default([]),
});
export type AssemblerLLMResultParsed = z.infer<typeof assemblerLLMResultSchema>;
