/**
 * OpenRouter agent executor.
 *
 * Calls https://openrouter.ai/api/v1/chat/completions with the agent's
 * rendered prompt. Streams the assistant response via onLog using
 * TranscriptEntry-compatible JSON lines so the existing UI transcript
 * renderer treats it the same as a native Claude/Codex run.
 *
 * Returns AdapterExecutionResult with usage + cost extracted from the
 * OpenRouter response (no estimation needed — OpenRouter reports
 * exact USD spend per request).
 *
 * Phase A scope:
 *  - single-shot prompt → text response
 *  - no tool calling, file ops, shell, sessions
 *  - good for strategy / research / writing / analysis / legal / finance agents
 *
 * Phase B (future):
 *  - tool calling via OpenAI function-call protocol
 *  - file_read / file_write / bash tools so engineering agents can run
 *  - session continuity across heartbeats
 */
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@orqestra/adapter-utils";

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_PROMPT_TEMPLATE =
  "You are agent {{agent.id}} ({{agent.name}}). Continue your Orqestra work.";
const DEFAULT_SYSTEM_PROMPT =
  "You are an agent in an Orqestra autonomous company. Be concise, factual, and produce a complete deliverable. British English. Sentence case. Never invent progress that has not happened.";

interface OpenRouterChoice {
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string }>;
  };
  finish_reason?: string;
}

interface OpenRouterChatResponse {
  id?: string;
  model?: string;
  choices?: OpenRouterChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
  error?: { message?: string; code?: string | number };
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta } = ctx;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return failureResult({
      message: "OPENROUTER_API_KEY is not set",
      code: "openrouter_no_api_key",
    });
  }

  const model = asString(config.model, DEFAULT_MODEL);
  const maxOutputTokens = asNumber(
    config.maxOutputTokens,
    asNumber(config.maxTokens, DEFAULT_MAX_TOKENS),
  );
  const promptTemplate = asString(config.promptTemplate, DEFAULT_PROMPT_TEMPLATE);
  const systemPrompt = asString(config.systemPrompt, DEFAULT_SYSTEM_PROMPT);

  const renderedPrompt = renderTemplate(promptTemplate, {
    agent,
    runId,
    context,
  });

  // Optional context-driven prefix from the heartbeat (e.g. session
  // handoff notes). We fold it into the user message so the model sees
  // the same shape every time.
  const sessionHandoff = asString(context.paperclipSessionHandoffMarkdown, "").trim();
  const composedPrompt = sessionHandoff
    ? `${sessionHandoff}\n\n${renderedPrompt}`
    : renderedPrompt;

  const body = {
    model,
    max_tokens: maxOutputTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: composedPrompt },
    ],
  };

  // Optional meta callback — surfaces the request shape in the run log
  // for debugging without leaking the API key.
  if (onMeta) {
    await onMeta({
      adapterType: "openrouter_local",
      command: `POST ${OPENROUTER_URL}`,
      env: { OPENROUTER_API_KEY: "<set>" },
      prompt: composedPrompt,
      promptMetrics: {
        promptCharacters: composedPrompt.length,
        systemCharacters: systemPrompt.length,
      },
      context: { model, maxOutputTokens },
    });
  }

  // Up-front init line so the UI shows "Starting" with the model.
  await emitTranscriptLine(onLog, {
    kind: "init",
    ts: new Date().toISOString(),
    model,
    sessionId: runId,
  });
  await emitTranscriptLine(onLog, {
    kind: "user",
    ts: new Date().toISOString(),
    text: composedPrompt,
  });

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer":
          process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL ||
          "https://www.orqestra.run",
        "x-title": "Orqestra",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await onLog("stderr", `[openrouter] network error: ${message}\n`);
    return failureResult({
      message: `OpenRouter network error: ${message}`,
      code: "openrouter_network_error",
      provider: "openrouter",
      model,
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    await onLog(
      "stderr",
      `[openrouter] HTTP ${res.status}: ${errText.slice(0, 500)}\n`,
    );
    return failureResult({
      message: `OpenRouter HTTP ${res.status}: ${errText.slice(0, 200)}`,
      code: `openrouter_http_${res.status}`,
      provider: "openrouter",
      model,
      meta: { status: res.status, body: errText.slice(0, 500) },
    });
  }

  const json = (await res.json()) as OpenRouterChatResponse;
  if (json.error) {
    const message = json.error.message ?? "Unknown OpenRouter error";
    await onLog("stderr", `[openrouter] error: ${message}\n`);
    return failureResult({
      message,
      code: `openrouter_error_${json.error.code ?? "unknown"}`,
      provider: "openrouter",
      model,
    });
  }

  const text = extractText(json);
  if (!text) {
    return failureResult({
      message: "OpenRouter returned no assistant content",
      code: "openrouter_empty_response",
      provider: "openrouter",
      model: json.model ?? model,
    });
  }

  // Stream the assistant text through onLog so the UI transcript shows it.
  await emitTranscriptLine(onLog, {
    kind: "assistant",
    ts: new Date().toISOString(),
    text,
  });

  const usage = json.usage ?? {};
  const inputTokens = numberOrZero(usage.prompt_tokens);
  const outputTokens = numberOrZero(usage.completion_tokens);
  const costUsd =
    typeof usage.cost === "number" && Number.isFinite(usage.cost)
      ? usage.cost
      : null;

  // Final result line — completes the transcript with the canonical
  // result shape so the existing UI metric widgets pick up tokens + cost.
  await emitTranscriptLine(onLog, {
    kind: "result",
    ts: new Date().toISOString(),
    text,
    inputTokens,
    outputTokens,
    cachedTokens: 0,
    costUsd: costUsd ?? 0,
    subtype: json.choices?.[0]?.finish_reason ?? "stop",
    isError: false,
    errors: [],
  });

  const durationMs = Date.now() - startedAt;
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    usage: {
      inputTokens,
      outputTokens,
    },
    provider: "openrouter",
    biller: "openrouter",
    model: json.model ?? model,
    billingType: "metered_api",
    costUsd: costUsd ?? null,
    summary: text.slice(0, 240),
    resultJson: {
      durationMs,
      finishReason: json.choices?.[0]?.finish_reason ?? null,
      openrouterId: json.id ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function renderTemplate(
  template: string,
  data: { agent: { id: string; name: string }; runId: string; context: Record<string, unknown> },
): string {
  return template
    .replace(/\{\{\s*agent\.id\s*\}\}/g, data.agent.id)
    .replace(/\{\{\s*agent\.name\s*\}\}/g, data.agent.name)
    .replace(/\{\{\s*runId\s*\}\}/g, data.runId)
    .replace(/\{\{\s*context\.([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
      const v = (data.context as Record<string, unknown>)[key];
      return typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
    });
}

function extractText(json: OpenRouterChatResponse): string {
  const c = json.choices?.[0]?.message?.content;
  if (typeof c === "string") return c.trim();
  if (Array.isArray(c)) {
    return c
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();
  }
  return "";
}

function numberOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

async function emitTranscriptLine(
  onLog: AdapterExecutionContext["onLog"],
  entry: Record<string, unknown>,
): Promise<void> {
  // The UI's stdout-line parser is JSONL-aware. We emit one JSON object
  // per line on stdout, matching the TranscriptEntry shapes.
  await onLog("stdout", JSON.stringify(entry) + "\n");
}

function failureResult(input: {
  message: string;
  code: string;
  provider?: string;
  model?: string;
  meta?: Record<string, unknown>;
}): AdapterExecutionResult {
  return {
    exitCode: 1,
    signal: null,
    timedOut: false,
    errorMessage: input.message,
    errorCode: input.code,
    errorMeta: input.meta,
    provider: input.provider ?? "openrouter",
    model: input.model ?? null,
    billingType: "metered_api",
  };
}

