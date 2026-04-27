/**
 * Orchestra LLM bridge.
 *
 * The orchestra services (planner, reviewer, assembler) need a way to
 * call an LLM with a single prompt and get back a string response. The
 * existing adapter system is built for streaming Issue execution
 * (long-running, JSON-line stdout, cost markers, etc.) — too heavy for a
 * one-shot planner call.
 *
 * This module provides a minimal `runLLM(prompt) → string` interface
 * with one default implementation that hits the Anthropic Messages API
 * over `fetch`. No new SDK dependency; no extra node_modules.
 *
 * Configure via environment:
 *   ANTHROPIC_API_KEY        required for the default implementation
 *   PAPERCLIP_ORCHESTRA_MODEL  optional; defaults to "claude-sonnet-4-5"
 *
 * Swap in a different runLLM by passing one to the orchestra service.
 */

export type OrchestraRunLLM = (input: {
  systemPrompt?: string;
  prompt: string;
  /** Soft cap on output tokens. Defaults to 4096. */
  maxOutputTokens?: number;
  /** Hint to bias toward JSON output where possible. */
  expectJson?: boolean;
}) => Promise<{ text: string; rawCostUsd?: number }>;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessagesResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
}

export class OrchestraLLMNotConfiguredError extends Error {
  code = "ORCHESTRA_LLM_NOT_CONFIGURED";
  constructor(message = "ANTHROPIC_API_KEY is not set; orchestra LLM cannot run") {
    super(message);
    this.name = "OrchestraLLMNotConfiguredError";
  }
}

/**
 * Default runLLM that calls the Anthropic Messages API directly over
 * fetch. Throws OrchestraLLMNotConfiguredError if no API key is set —
 * caller should catch this and surface a clear "configure your key"
 * error to the user rather than 500ing.
 */
export const defaultAnthropicRunLLM: OrchestraRunLLM = async ({
  systemPrompt,
  prompt,
  maxOutputTokens,
}) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new OrchestraLLMNotConfiguredError();
  }
  const model = process.env.PAPERCLIP_ORCHESTRA_MODEL || DEFAULT_MODEL;

  const body = {
    model,
    max_tokens: maxOutputTokens ?? 4096,
    system: systemPrompt ?? undefined,
    messages: [{ role: "user", content: prompt }],
  };

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Anthropic API ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as AnthropicMessagesResponse;
  const text = (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic API returned no text content");
  }

  // Cost-derivation could be added here if we want to record an
  // orchestra-attributed CostEvent (input/output tokens × posted price).
  // Skipping for v0.1 — orchestra cost is derived from step Issue runs.

  return { text };
};

/**
 * Strip a JSON object out of a model response that may have leaked
 * markdown fences or stray prose despite our prompt's instructions.
 * Returns the trimmed JSON string ready to JSON.parse.
 */
export function extractJsonBlob(raw: string): string {
  const trimmed = raw.trim();

  // Fenced block: ```json … ``` or ``` … ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // First { … last } heuristic
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}
