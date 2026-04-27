/**
 * Orchestra planner prompt builder.
 *
 * The planner is asked to return STRICT JSON conforming to
 * `plannerLLMResultSchema`. We deliberately spell out the schema in the
 * prompt rather than relying on tool-use, because the planner can be any
 * adapter (Anthropic / OpenAI / process-based Claude Code) and the
 * lowest common denominator is "produce JSON in this shape, nothing else".
 *
 * On parse failure the orchestra service retries once with a repair prompt
 * (see `buildPlannerRepairPrompt`).
 */

import type {
  OutcomeTargetFormat,
  OutcomePriority,
} from "../types/orchestra.js";

export interface PlannerPromptInput {
  outcomeTitle: string;
  outcomeBrief: string;
  targetFormat: OutcomeTargetFormat;
  priority: OutcomePriority;
  deadline: string | null;
  budgetLimitCents: number | null;
  /** Names + roles of agents the planner can route work to. */
  availableAgents: Array<{
    id: string;
    name: string;
    role: string;
    title: string;
    capabilitiesShort: string;
  }>;
  /** Optional template id (e.g. hero workflow) to bias the plan. */
  templateId?: string | null;
  /** Companies have voice / brand notes; surfaced to keep tone consistent. */
  companyVoiceNotes?: string | null;
}

const SCHEMA_HINT = `Return ONLY a JSON object matching this shape:

{
  "outcomeSummary": string,                     // your one-paragraph reading of the brief
  "assumptions": string[],                      // explicit assumptions you are making
  "missingInputs": [                            // things the user MUST clarify before execution; empty if none
    { "field": string, "question": string, "required": boolean }
  ],
  "riskLevel": "low" | "medium" | "high" | "critical",
  "estimatedCostCents": integer,                // rough total LLM spend across all steps, in cents
  "estimatedDurationMinutes": integer,
  "confidenceScore": number,                    // 0..1 — your confidence the plan will succeed as written
  "steps": [                                    // 3..15 steps typically; max 40
    {
      "title": string,
      "description": string,
      "stepType": "research" | "analysis" | "writing" | "review" | "synthesis" | "decision" | "delivery",
      "dependencies": integer[],                // ordinals (0-indexed) of other steps that must complete first
      "recommendedAgentType": string,           // e.g. "specialist:research", "manager", "ceo", or a specific agent id
      "acceptanceCriteria": [
        { "criterion": string, "howToVerify": string }
      ],
      "reviewCriteria": string[],               // what a reviewer agent should check for
      "outputRequirement": string               // what the step must produce (markdown report, table, etc.)
    }
  ]
}

Rules:
- Output JSON ONLY. No prose before or after. No markdown code fences.
- Steps should be granular enough that one agent can finish each in one pass.
- The final step should usually be type "synthesis" or "delivery".
- Include a "review" step before final delivery if the work is high-stakes.
- If essential info is missing, populate missingInputs and keep steps minimal — the orchestra layer will gate execution on clarification.
- Keep estimatedCostCents realistic. A typical research step is ~50-200 cents; a writing step ~100-500 cents.
- confidenceScore < 0.5 means the orchestra layer will surface a "low confidence" badge to the user.`;

export function buildPlannerPrompt(input: PlannerPromptInput): string {
  const agentsBlock = input.availableAgents
    .map(
      (a) =>
        `- ${a.id} | ${a.name} (${a.role} – ${a.title}): ${a.capabilitiesShort}`,
    )
    .join("\n");

  const constraints: string[] = [];
  if (input.budgetLimitCents != null) {
    constraints.push(
      `Hard budget cap: ${input.budgetLimitCents} cents (≈ $${(input.budgetLimitCents / 100).toFixed(2)}).`,
    );
  }
  if (input.deadline) {
    constraints.push(`Deadline: ${input.deadline}.`);
  }
  if (input.priority) {
    constraints.push(`Priority: ${input.priority}.`);
  }

  return `You are the Orchestra Planner — the strategic layer of an autonomous work platform. Your job is to take a high-level outcome the user wants, decompose it into an executable plan, and select the right agents.

OUTCOME TITLE
${input.outcomeTitle}

OUTCOME BRIEF
${input.outcomeBrief}

TARGET FORMAT
${input.targetFormat}

CONSTRAINTS
${constraints.length ? constraints.map((c) => `- ${c}`).join("\n") : "- none specified"}

AVAILABLE AGENTS (use ids in recommendedAgentType when a specific agent is the obvious fit)
${agentsBlock || "- (no agents available; recommend role types only)"}
${input.templateId ? `\nTEMPLATE\nThis outcome is being executed under template "${input.templateId}". Bias the plan toward that template's standard structure where appropriate.\n` : ""}${input.companyVoiceNotes ? `\nCOMPANY VOICE\n${input.companyVoiceNotes}\n` : ""}

${SCHEMA_HINT}`;
}

export function buildPlannerRepairPrompt(
  originalPrompt: string,
  badResponse: string,
  parseError: string,
): string {
  return `Your previous response could not be parsed as the required JSON schema.

Parse error:
${parseError}

Your previous response (truncated to 4000 chars):
${badResponse.slice(0, 4000)}

Please re-issue ONLY the corrected JSON. No prose, no code fences. Same schema as before.

Original task for reference:
${originalPrompt}`;
}
