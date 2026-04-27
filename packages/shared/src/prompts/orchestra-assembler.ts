/**
 * Orchestra assembler prompt — final synthesis stage.
 *
 * Once all required steps complete (and pass review), the assembler agent
 * is given:
 *   - the original outcome brief
 *   - the target format (report / memo / strategy / etc.)
 *   - the work products from each step (with provenance)
 *   - any voice / brand notes
 *
 * It returns one coherent final markdown deliverable plus an executive
 * summary, structure metadata, and any limitations or next-action
 * recommendations the user should know about.
 */

import type { OutcomeTargetFormat } from "../types/orchestra.js";

export interface AssemblerPromptInput {
  outcomeTitle: string;
  outcomeBrief: string;
  targetFormat: OutcomeTargetFormat;
  /** Voice / brand notes from the company settings, if any. */
  companyVoiceNotes?: string | null;
  /** Each work product with its source step + agent, in plan order. */
  sources: Array<{
    workProductId: string;
    stepTitle: string;
    stepType: string;
    agentName: string;
    body: string;
  }>;
}

const SCHEMA_HINT = `Return ONLY a JSON object matching this shape:

{
  "finalMarkdown": string,                            // the full deliverable in markdown
  "executiveSummary": string,                         // 3-5 sentence top-of-doc summary
  "structure": [                                      // headings used in finalMarkdown, with provenance
    { "heading": string, "sourceWorkProductIds": string[] }
  ],
  "unresolvedLimitations": string[],                  // anything the work could not address; empty if none
  "recommendedNextActions": string[]                  // specific follow-ups the user might want
}

Rules:
- Output JSON ONLY. No prose before or after. No markdown code fences (the finalMarkdown value is itself markdown — that is fine; it goes in a JSON string).
- finalMarkdown should be ready to ship — start with a top-level heading, include the executive summary up top, and follow the structure of the target format.
- Cite source steps inline where appropriate using the agent's name (e.g. "Per Lior's market scan, …").
- Do not invent facts not present in the source work products. If something is missing, say so in unresolvedLimitations.
- Match company voice if provided; otherwise use a calm, confident, business-ready tone.`;

const FORMAT_GUIDE: Record<OutcomeTargetFormat, string> = {
  report:
    "Multi-section report. Recommended sections: Executive Summary, Background, Key Findings, Analysis, Recommendations, Next Actions.",
  memo:
    "1-3 page memo. Tight, decision-oriented. Lead with the recommendation. Sections: Recommendation, Why Now, What We Know, What We Don't, Next Actions.",
  deck_outline:
    "Slide-by-slide outline as markdown. One H2 per slide, with bulleted body content under each. Aim for 8-15 slides.",
  email:
    "One email message. Subject line on first line as H1, then the body. Conversational but business-direct. Max 250 words unless the brief requires more.",
  strategy:
    "Strategy document. Sections: Context, Strategic Choices, Pillars, Execution Plan, Metrics, Risks. Opinionated and forward-looking.",
  audit:
    "Audit findings document. Sections: Scope, Methodology, Findings (numbered, severity-rated), Root Causes, Recommendations, Appendix.",
  research_brief:
    "Research brief. Sections: Question, Approach, Key Findings, Evidence Base, Open Questions, Sources.",
  custom:
    "Use the structure that best fits the brief and source materials. Default to a report structure.",
};

export function buildAssemblerPrompt(input: AssemblerPromptInput): string {
  const sourcesBlock = input.sources
    .map(
      (s, i) =>
        `### Source ${i + 1} — ${s.stepTitle} (by ${s.agentName}, type=${s.stepType}, id=${s.workProductId})\n${s.body}`,
    )
    .join("\n\n---\n\n");

  return `You are the Orchestra Assembler — the editor that takes the work of an agent fleet and turns it into one finished deliverable.

OUTCOME
${input.outcomeTitle}

ORIGINAL BRIEF
${input.outcomeBrief}

TARGET FORMAT
${input.targetFormat} — ${FORMAT_GUIDE[input.targetFormat]}
${input.companyVoiceNotes ? `\nCOMPANY VOICE\n${input.companyVoiceNotes}\n` : ""}

SOURCE WORK PRODUCTS (in plan order)
${sourcesBlock}

${SCHEMA_HINT}`;
}
