/**
 * Orchestra reviewer prompt — quality control checkpoint after a step run.
 *
 * The reviewer agent reads the step's acceptance criteria, the produced
 * work product, and renders a pass/fail verdict with specific gaps and
 * revision instructions if the work is weak.
 *
 * Returns strict JSON conforming to `reviewerLLMResultSchema`.
 */

export interface ReviewerPromptInput {
  outcomeTitle: string;
  outcomeBrief: string;
  stepTitle: string;
  stepDescription: string;
  acceptanceCriteria: Array<{ criterion: string; howToVerify?: string }>;
  reviewCriteria: string[];
  outputRequirement: string | null;
  /** Markdown body of the work product produced by the step. */
  workProductBody: string;
  /** Where the step is in the revision loop. */
  revisionAttempt: number;
  maxRevisions: number;
}

const SCHEMA_HINT = `Return ONLY a JSON object matching this shape:

{
  "pass": boolean,                       // true if the work meets all acceptance criteria
  "score": integer,                      // 0..100 quality score
  "comments": string,                    // your overall verdict in 2-4 sentences
  "gaps": string[],                      // specific things missing or wrong; empty if pass
  "revisionInstructions": string,        // concrete instructions if work needs revision; "" if pass
  "recommendedNextAction": "accept" | "revise" | "escalate"
}

Rules:
- Output JSON ONLY. No prose before or after. No code fences.
- "accept" means the work is ready to feed into the next step / final assembly.
- "revise" means it can be saved with one more pass — populate revisionInstructions specifically.
- "escalate" means the brief itself may be wrong or the work cannot be salvaged — surface to the user.
- Be honest. Don't pass weak work. Don't fail strong work over nitpicks.
- If the work is on the boundary, lean toward "accept" if score >= 70 and gaps are minor.`;

export function buildReviewerPrompt(input: ReviewerPromptInput): string {
  const acceptanceBlock = input.acceptanceCriteria
    .map(
      (c, i) =>
        `${i + 1}. ${c.criterion}${c.howToVerify ? ` — verify: ${c.howToVerify}` : ""}`,
    )
    .join("\n") || "(none specified)";

  const reviewBlock =
    input.reviewCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n") ||
    "(no extra review criteria)";

  return `You are the Orchestra Reviewer — quality control for autonomous work. You read what an agent produced and decide whether it meets the brief.

OUTCOME
${input.outcomeTitle}

ORIGINAL BRIEF
${input.outcomeBrief}

STEP UNDER REVIEW
${input.stepTitle}

WHAT THE STEP WAS ASKED TO DO
${input.stepDescription}

ACCEPTANCE CRITERIA (must all be met for "pass")
${acceptanceBlock}

ADDITIONAL REVIEW CRITERIA
${reviewBlock}

EXPECTED OUTPUT
${input.outputRequirement ?? "(not specified)"}

REVISION CONTEXT
This is revision attempt ${input.revisionAttempt} of ${input.maxRevisions} maximum. If you recommend revising past the cap, escalate instead.

WORK PRODUCT
---
${input.workProductBody}
---

${SCHEMA_HINT}`;
}
