/**
 * @orqestra/adapter-openrouter-local — top-level exports.
 *
 * The actual server-side adapter logic lives under `./server`. This entry
 * exports the small UI/CLI-friendly bits: the model catalogue and the
 * agent configuration documentation snippet.
 */
import type { AdapterModel } from "@orqestra/adapter-utils";

/**
 * Curated list of OpenRouter model ids that work well as agents in
 * Orqestra. The full OpenRouter catalogue is much larger — these are
 * the recommended defaults across cost/quality bands.
 */
export const models: AdapterModel[] = [
  // Anthropic via OpenRouter
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4 (anthropic via OpenRouter)" },
  { id: "anthropic/claude-3.5-haiku", label: "Claude Haiku 3.5 (cheap, fast)" },
  // Google
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash (very cheap)" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  // OpenAI
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (very cheap)" },
  // Meta / open
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B (cheap)" },
];

export const agentConfigurationDoc = `# OpenRouter agent configuration

Adapter: openrouter_local

Calls OpenRouter's chat completions API with the agent's rendered prompt.
Returns the model's text response as the agent's work product. Cost is
captured from OpenRouter's response (no estimation needed).

Required environment:
- OPENROUTER_API_KEY  — your OpenRouter API key (sk-or-v1-...)

Core fields:
- model (string, optional): OpenRouter model id. Defaults to
  "anthropic/claude-sonnet-4" if not set on the agent.
- promptTemplate (string, optional): handlebars-style template rendered
  with agent + context info. Defaults to a sensible heartbeat prompt.
- maxOutputTokens (number, optional): cap on response length. Defaults
  to 4096.
- systemPrompt (string, optional): system message prepended to the
  conversation. Defaults to the agent's persona.

This adapter does not currently support tool calling, file operations,
or shell access. For agents that need those, use claude_local or
codex_local. Most strategy / research / writing / analysis / finance /
legal agents do not need tool calling — they produce text.
`;
