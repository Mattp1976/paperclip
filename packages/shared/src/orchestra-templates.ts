/**
 * Orchestra outcome templates.
 *
 * Pre-shaped briefs that pre-fill the "Start an outcome" form with
 * production-quality framing. The hero example is the Strategic Market
 * Intelligence Report (per the Orchestra brief's §7).
 *
 * Templates aren't a separate execution path — they're just text +
 * recommended target format. The planner does the actual decomposition
 * once the user clicks "Start outcome".
 */

import type {
  OutcomeTargetFormat,
  OutcomeExecutionMode,
} from "./types/orchestra.js";

export interface OrchestraTemplate {
  id: string;
  name: string;
  /** Short tag line for the picker. */
  tagline: string;
  /** Optional longer description shown when expanded. */
  description: string;
  defaultTitle: string;
  defaultBrief: string;
  defaultTargetFormat: OutcomeTargetFormat;
  defaultExecutionMode: OutcomeExecutionMode;
  /** Human-readable example of when to use it. */
  example: string;
  /** Iconic emoji for the picker chip. Tasteful. Single character. */
  icon?: string;
}

export const STRATEGIC_MARKET_INTELLIGENCE_REPORT: OrchestraTemplate = {
  id: "strategic_market_intelligence_report",
  name: "Strategic Market Intelligence Report",
  tagline: "Polished report on a market, product or audience.",
  description:
    "Decomposes into market research, competitor scan, trend analysis, " +
    "risk review, strategic synthesis, quality review, and final assembly. " +
    "Produces a publication-ready report with executive summary, key " +
    "findings, opportunities, and recommended next actions.",
  defaultTitle:
    "Strategic market intelligence report: [your market or product]",
  defaultBrief: [
    "Subject: [the market, product, or audience you want intelligence on]",
    "",
    "Target audience for this report: [who reads this — board, sales team, exec team, founder]",
    "",
    "Key question we want answered: [the one decision this report should inform]",
    "",
    "Region (optional): [global / UK / US / Europe / specific cities]",
    "Timeframe (optional): [next 12 months / next quarter / next 3 years]",
    "",
    "Specific things to include if possible:",
    "- Top 3-5 competitors and their positioning",
    "- Recent funding / M&A activity in the space",
    "- Regulatory or political risk factors",
    "- Customer / buyer trends we should know",
    "- One opinionated strategic recommendation we can act on",
    "",
    "Tone: confident, analytical, business-direct. No buzzwords.",
  ].join("\n"),
  defaultTargetFormat: "report",
  defaultExecutionMode: "review_plan_first",
  example:
    'e.g. "Strategic market intelligence report on the UK fintech infrastructure space"',
  icon: "🎯",
};

export const COMPETITOR_BATTLECARD: OrchestraTemplate = {
  id: "competitor_battlecard",
  name: "Competitor Battlecard",
  tagline: "Side-by-side comparison + winning angles.",
  description:
    "Researches one competitor, builds a feature/positioning matrix, " +
    "identifies their weaknesses, and writes the talking points your " +
    "team uses to win deals against them.",
  defaultTitle: "Competitor battlecard: [competitor name]",
  defaultBrief: [
    "Competitor: [name + URL]",
    "",
    "Our product / positioning: [what we do, who for]",
    "",
    "What I want to know:",
    "- How they're positioned and priced",
    "- Where they're stronger than us — be honest",
    "- Where we're stronger than them",
    "- 3-5 winning angles we can lead with on a sales call",
    "- Recent product moves / funding / churn signals",
  ].join("\n"),
  defaultTargetFormat: "memo",
  defaultExecutionMode: "review_plan_first",
  example: 'e.g. "Battlecard: Glean (vs us)"',
  icon: "⚔️",
};

export const CLIENT_PROPOSAL: OrchestraTemplate = {
  id: "client_proposal",
  name: "Client Proposal",
  tagline: "Polished proposal from a brief.",
  description:
    "Takes a client brief and produces a structured proposal with " +
    "context, our understanding, recommended approach, deliverables, " +
    "team, timeline, and pricing placeholder.",
  defaultTitle: "Proposal: [client] — [project]",
  defaultBrief: [
    "Client: [name, sector, size]",
    "",
    "What they're asking for: [their stated brief, in their words]",
    "",
    "Our read on what they actually need: [your interpretation]",
    "",
    "Constraints: [budget signal, timeline, must-haves, must-avoids]",
    "",
    "Deliverables we can offer:",
    "- [deliverable 1]",
    "- [deliverable 2]",
    "",
    "Tone: [warm + assured / formal / casual]",
  ].join("\n"),
  defaultTargetFormat: "report",
  defaultExecutionMode: "review_plan_first",
  example: 'e.g. "Proposal: Acme — brand refresh and launch comms"',
  icon: "📝",
};

export const ORCHESTRA_TEMPLATES: OrchestraTemplate[] = [
  STRATEGIC_MARKET_INTELLIGENCE_REPORT,
  COMPETITOR_BATTLECARD,
  CLIENT_PROPOSAL,
];

export function getOrchestraTemplate(id: string): OrchestraTemplate | null {
  return ORCHESTRA_TEMPLATES.find((t) => t.id === id) ?? null;
}
