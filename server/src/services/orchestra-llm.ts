/**
 * Orchestra LLM bridge.
 *
 * The orchestra services (planner, reviewer, assembler) and the narrator
 * need a way to call an LLM with a single prompt and get back a string
 * response. The existing adapter system is built for streaming Issue
 * execution (long-running, JSON-line stdout, cost markers, etc.) — too
 * heavy for a one-shot LLM call.
 *
 * This module provides a minimal `runLLM(prompt) → string` interface
 * with two implementations selectable by env var, both hitting the
 * provider's API over `fetch`. No new SDK dependency.
 *
 * Configure via environment:
 *   PAPERCLIP_ORCHESTRA_PROVIDER  "anthropic" (default) | "openrouter"
 *   PAPERCLIP_ORCHESTRA_MODEL     optional model override
 *
 *   For provider=anthropic:
 *     ANTHROPIC_API_KEY           required
 *     model defaults to "claude-sonnet-4-5"
 *
 *   For provider=openrouter:
 *     OPENROUTER_API_KEY          required
 *     model defaults to "anthropic/claude-sonnet-4"
 *     (use any OpenRouter model id, e.g. "openai/gpt-4o-mini",
 *      "google/gemini-2.0-flash-001", "anthropic/claude-3.5-haiku")
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
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-4";

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
  const model =
    process.env.PAPERCLIP_ORCHESTRA_MODEL || ANTHROPIC_DEFAULT_MODEL;

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

// ─────────────────────────────────────────────────────────────────────────
// OpenRouter implementation
// ─────────────────────────────────────────────────────────────────────────

interface OpenRouterMessagesResponse {
  choices?: Array<{
    message?: { content?: string | Array<{ type: string; text?: string }> };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: string | number };
}

/**
 * runLLM via OpenRouter's OpenAI-compatible chat completions endpoint.
 * Lets us route to any OpenRouter-supported model (Claude, GPT, Gemini,
 * Llama, etc.) under a single billing relationship.
 *
 * Throws OrchestraLLMNotConfiguredError if OPENROUTER_API_KEY is unset.
 */
export const openRouterRunLLM: OrchestraRunLLM = async ({
  systemPrompt,
  prompt,
  maxOutputTokens,
}) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OrchestraLLMNotConfiguredError(
      "OPENROUTER_API_KEY is not set; orchestra LLM cannot run via OpenRouter",
    );
  }
  const model =
    process.env.PAPERCLIP_ORCHESTRA_MODEL || OPENROUTER_DEFAULT_MODEL;

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const body = {
    model,
    messages,
    max_tokens: maxOutputTokens ?? 4096,
  };

  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      // Optional attribution headers for the OpenRouter dashboard.
      "http-referer":
        process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL || "https://www.orqestra.run",
      "x-title": "Orqestra",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter API ${res.status} ${res.statusText}: ${errText.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as OpenRouterMessagesResponse;
  if (json.error) {
    throw new Error(
      `OpenRouter error: ${json.error.message ?? "unknown error"}`,
    );
  }

  const first = json.choices?.[0]?.message?.content;
  let text = "";
  if (typeof first === "string") {
    text = first.trim();
  } else if (Array.isArray(first)) {
    text = first
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();
  }

  if (!text) {
    throw new Error("OpenRouter API returned no text content");
  }

  return { text };
};

// ─────────────────────────────────────────────────────────────────────────
// Default selector — chooses provider based on env at call time so a hot
// env-var swap (Railway redeploy) takes effect without code changes.
// ─────────────────────────────────────────────────────────────────────────

export const defaultRunLLM: OrchestraRunLLM = async (input) => {
  const provider = (
    process.env.PAPERCLIP_ORCHESTRA_PROVIDER || "anthropic"
  ).toLowerCase();
  if (provider === "openrouter") return openRouterRunLLM(input);
  return defaultAnthropicRunLLM(input);
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
