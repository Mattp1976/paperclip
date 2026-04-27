/**
 * Slack webhook sender.
 *
 * Uses incoming webhooks rather than the full Slack API because:
 *   - No OAuth dance for v0.1.
 *   - User drops a URL into company_secrets; we resolve + POST.
 *   - Works equally well for Slack and any webhook-compatible clone.
 *
 * We can't get a permalink back from a bare webhook — the response is
 * usually just "ok". The work product gets `externalId: null` and a best-
 * effort `url` pointing at the workspace root if the webhook URL exposes
 * it. A richer Slack provider (bot token, chat.postMessage, permalinks)
 * is a follow-up.
 */
import type { OutputRouter, OutputRouterDeliveryResult } from "@orqestra/shared";
import type { SlackWebhookRouterConfig } from "@orqestra/shared";
import type { RunDispatchContext } from "../output-routers.js";

export interface SenderArgs {
  router: OutputRouter;
  run: RunDispatchContext;
  resolveSecret: (secretId: string) => Promise<string>;
  fetch: typeof globalThis.fetch;
}

function readConfig(router: OutputRouter): SlackWebhookRouterConfig {
  const cfg = router.config as Partial<SlackWebhookRouterConfig>;
  if (!cfg || typeof cfg.webhookSecretId !== "string" || cfg.webhookSecretId.length === 0) {
    throw new Error(
      `Slack router ${router.id} is missing webhookSecretId — configure a company secret holding the incoming webhook URL`,
    );
  }
  return {
    webhookSecretId: cfg.webhookSecretId,
    channel: cfg.channel ?? null,
    messagePrefix: cfg.messagePrefix ?? null,
  };
}

function formatMessage(router: OutputRouter, ctx: RunDispatchContext): string {
  const cfg = readConfig(router);
  const lines: string[] = [];
  const prefix = cfg.messagePrefix?.trim();
  if (prefix) lines.push(prefix);

  const icon =
    ctx.status === "succeeded"
      ? ":white_check_mark:"
      : ctx.status === "failed"
        ? ":x:"
        : ctx.status === "timed_out"
          ? ":hourglass:"
          : ":black_circle_for_record:";
  lines.push(`${icon} *${ctx.agentName}* — run ${ctx.status}`);

  if (ctx.summary) {
    // Slack message size is generous but truncate just in case — 3500
    // chars keeps us clear of the 4000-char limit with headroom.
    const trimmed =
      ctx.summary.length > 3500 ? `${ctx.summary.slice(0, 3500)}…` : ctx.summary;
    lines.push(trimmed);
  }

  const metaBits: string[] = [];
  if (ctx.costUsd != null) metaBits.push(`$${ctx.costUsd.toFixed(4)}`);
  if (ctx.finishedAt && ctx.startedAt) {
    const ms = ctx.finishedAt.getTime() - ctx.startedAt.getTime();
    if (Number.isFinite(ms) && ms > 0) metaBits.push(`${Math.round(ms / 1000)}s`);
  }
  if (metaBits.length > 0) lines.push(`_${metaBits.join(" · ")}_`);

  return lines.join("\n");
}

export async function sendViaSlackWebhook(args: SenderArgs): Promise<OutputRouterDeliveryResult> {
  const cfg = readConfig(args.router);
  const webhookUrl = (await args.resolveSecret(cfg.webhookSecretId)).trim();

  if (!webhookUrl.startsWith("https://")) {
    throw new Error(
      `Slack router ${args.router.id} resolved webhook is not an https URL — refusing to send`,
    );
  }

  const text = formatMessage(args.router, args.run);
  const body: Record<string, unknown> = { text };
  if (cfg.channel) body.channel = cfg.channel;

  const res = await args.fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`Slack webhook returned ${res.status}: ${details.slice(0, 500)}`);
  }

  return {
    externalId: null,
    url: null,
    summary: `Posted to Slack (${args.router.name})`,
    status: "active",
    metadata: {
      httpStatus: res.status,
      channel: cfg.channel ?? null,
      postedAt: new Date().toISOString(),
    },
  };
}
