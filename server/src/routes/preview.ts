/**
 * Public, unauthenticated /api/preview endpoint.
 *
 * Used by the marketing landing page to give a visitor a "wow moment"
 * before any sign-in: they type one sentence describing what they want,
 * and we return a plausible plan, team, cost and time estimate.
 *
 * Strategy:
 *   1. If ANTHROPIC_API_KEY is set, call Claude Haiku with a tight prompt
 *      that asks for structured JSON. Targets <2s response.
 *   2. If the LLM call fails or the key is missing, fall back to a
 *      sensible deterministic template so the user still sees something.
 *
 * No persistence. No user data stored. Pure transient inference.
 */
import { Router } from "express";

interface PreviewResponse {
  outcome: string;
  steps: string[];
  agents: { name: string; role: string }[];
  costEstimate: number;
  timeEstimate: string;
}

const SYSTEM_PROMPT = `You are Orqestra's plan-preview generator.

Given a user's one-sentence outcome, return a plausible plan that an AI workforce could execute.

Return ONLY a JSON object with this exact shape — no preamble, no fences, no commentary:

{
  "outcome": "<a clean rephrasing in 6-12 words, sentence case>",
  "steps": ["<6-8 plan steps, each 4-8 words, sentence case>"],
  "agents": [
    {"name": "<role title>", "role": "<one short verb-led description, 4-8 words>"}
  ],
  "costEstimate": <integer GBP, between 8 and 80>,
  "timeEstimate": "<X minutes or X hours, plausible for the work>"
}

Rules:
- British English. Sentence case. No hype. No jargon. No "AI-powered".
- 3-5 agents.
- Cost should reflect real Anthropic / OpenRouter token spend (£0.20-£0.80 typical) PLUS a notional £20-£60 platform charge for the orchestration. Round to nearest pound.
- Time should be in minutes for most tasks. Use hours only for genuinely long work.
- If the input is gibberish, return a generic but useful research plan rather than refusing.`;

function defaultPreview(input: string): PreviewResponse {
  const trimmed = input.trim().slice(0, 80);
  return {
    outcome: trimmed.length > 0 ? trimmed : "Your outcome",
    steps: [
      "Define the scope",
      "Gather the inputs",
      "Synthesise the findings",
      "Draft the deliverable",
      "Review and iterate",
      "Finalise the output",
    ],
    agents: [
      { name: "Strategy lead", role: "scope and structure the work" },
      { name: "Research analyst", role: "gather and verify inputs" },
      { name: "Senior writer", role: "draft the deliverable" },
      { name: "Reviewer", role: "critique and approve" },
    ],
    costEstimate: 28,
    timeEstimate: "16 minutes",
  };
}

function clampPreview(raw: unknown): PreviewResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const outcome = typeof r.outcome === "string" && r.outcome.length > 0 ? r.outcome.slice(0, 200) : null;
  if (!outcome) return null;

  const steps = Array.isArray(r.steps)
    ? r.steps.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, 10)
    : null;
  if (!steps || steps.length < 3) return null;

  const agents = Array.isArray(r.agents)
    ? r.agents
        .map((a) => {
          if (!a || typeof a !== "object") return null;
          const ao = a as Record<string, unknown>;
          const name = typeof ao.name === "string" ? ao.name : null;
          const role = typeof ao.role === "string" ? ao.role : null;
          if (!name || !role) return null;
          return { name: name.slice(0, 80), role: role.slice(0, 120) };
        })
        .filter((x): x is { name: string; role: string } => x !== null)
        .slice(0, 6)
    : null;
  if (!agents || agents.length < 2) return null;

  const costNum = typeof r.costEstimate === "number" ? r.costEstimate : Number(r.costEstimate);
  const costEstimate = Number.isFinite(costNum) ? Math.max(5, Math.min(200, Math.round(costNum))) : 28;

  const timeEstimate = typeof r.timeEstimate === "string" && r.timeEstimate.length > 0
    ? r.timeEstimate.slice(0, 40)
    : "15 minutes";

  return { outcome, steps, agents, costEstimate, timeEstimate };
}

export function previewRoutes(): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const rawInput = typeof req.body?.input === "string" ? req.body.input : "";
    const input = rawInput.trim().slice(0, 600);

    if (!input) {
      res.status(400).json({ error: "input required" });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.json(defaultPreview(input));
      return;
    }

    // Cap the upstream request at ~5s to keep the page snappy.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 800,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: input }],
        }),
      });

      clearTimeout(timeoutId);

      if (!upstream.ok) {
        res.json(defaultPreview(input));
        return;
      }

      const json = (await upstream.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = json.content?.[0]?.text ?? "";

      // Pull the first JSON object out of the text — Haiku usually
      // returns clean JSON, but be defensive about preambles or fences.
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        res.json(defaultPreview(input));
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        res.json(defaultPreview(input));
        return;
      }

      const clamped = clampPreview(parsed);
      res.json(clamped ?? defaultPreview(input));
    } catch {
      clearTimeout(timeoutId);
      res.json(defaultPreview(input));
    }
  });

  return router;
}
