/**
 * Standup digest Markdown renderer — shared between the in-app preview
 * and the daily email body so the two can't drift. Per PLAN-30D W3:
 * "Standup page content must match the email digest. If they diverge,
 * one is wrong. Single source of truth, two renderers."
 *
 * The renderer is deliberately a plain function of the digest payload —
 * no templating framework, no React, no DOM. Given a `StandupDigest`
 * it returns a Markdown string that reads well in Gmail, Outlook, or
 * a plain-text terminal.
 *
 * Sections (in order, per the plan):
 *   1. Overnight work — what closed in the window, grouped by agent.
 *   2. Decisions pending — approvals awaiting a human.
 *   3. 24-hour plan — what's in-flight + blocked, grouped by agent.
 *   4. Cost — spend over the window.
 */
import type { AgentStandupEntry, StandupBlocker, StandupDigest, StandupIssueRef } from "./types/standup.js";

export interface RenderStandupDigestOptions {
  /** The company's display name, for the heading. */
  companyName?: string;
  /** Absolute base URL for building issue / approval links. No trailing slash. */
  appBaseUrl?: string;
}

/** Human-friendly currency formatting — mirrors `friendlyCost` in the UI. */
function formatMoney(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${Math.round(dollars).toLocaleString("en-US")}`;
  if (dollars >= 10) return `$${dollars.toFixed(0)}`;
  if (dollars >= 1) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(2)}`;
}

/** Short date for the heading — e.g. "Wed 23 Apr". */
function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function issueLine(issue: StandupIssueRef, appBaseUrl?: string): string {
  const identifier = issue.identifier ? `${issue.identifier} ` : "";
  const text = `${identifier}${issue.title}`.trim();
  if (!appBaseUrl) return text;
  return `[${text}](${appBaseUrl}/issues/${issue.id})`;
}

function blockerLine(blocker: StandupBlocker, appBaseUrl?: string): string {
  if (blocker.kind === "blocked_issue") {
    return `blocked · ${issueLine(blocker.issue, appBaseUrl)}`;
  }
  const label = blocker.noteKind === "help_request" ? "help wanted" : "flagged";
  const body = blocker.body.trim();
  const snippet = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  return `${label} · ${issueLine(blocker.issue, appBaseUrl)} — ${snippet}`;
}

function agentHeading(entry: AgentStandupEntry): string {
  if (entry.agent.title) return `${entry.agent.name} · ${entry.agent.title}`;
  return entry.agent.name;
}

/**
 * Render a `StandupDigest` to a Markdown string. Pure function, safe to
 * call from the server (to build the email body) or from the UI (to
 * preview it).
 */
export function renderStandupDigestMarkdown(
  digest: StandupDigest,
  options: RenderStandupDigestOptions = {},
): string {
  const { companyName, appBaseUrl } = options;
  const { snapshot, pendingApprovalsCount, windowSpendCents, generatedAt } = digest;

  const title = companyName ? `${companyName} · Standup` : "Standup";
  const dateLine = `${formatDateShort(generatedAt)} · ${snapshot.agents.length} agent${snapshot.agents.length === 1 ? "" : "s"} reporting`;

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`_${dateLine}_`);
  lines.push("");

  // ── 1. Overnight work ───────────────────────────────────────────────
  lines.push("## Overnight work");
  lines.push("");
  const agentsWithYesterday = snapshot.agents.filter((a) => a.yesterday.length > 0);
  if (agentsWithYesterday.length === 0) {
    lines.push("_Nothing closed in the window._");
  } else {
    for (const entry of agentsWithYesterday) {
      lines.push(`**${agentHeading(entry)}**`);
      for (const issue of entry.yesterday) {
        lines.push(`- ${issueLine(issue, appBaseUrl)}`);
      }
      lines.push("");
    }
  }
  lines.push("");

  // ── 2. Decisions pending ────────────────────────────────────────────
  lines.push("## Decisions pending");
  lines.push("");
  if (pendingApprovalsCount === 0) {
    lines.push("_No approvals waiting on you._");
  } else {
    const label =
      pendingApprovalsCount === 1
        ? "1 approval is waiting on you."
        : `${pendingApprovalsCount} approvals are waiting on you.`;
    if (appBaseUrl) {
      lines.push(`${label} [Review →](${appBaseUrl}/approvals)`);
    } else {
      lines.push(label);
    }
  }
  lines.push("");

  // ── 3. 24-hour plan ─────────────────────────────────────────────────
  lines.push("## 24-hour plan");
  lines.push("");
  const agentsActive = snapshot.agents.filter(
    (a) => a.today.length > 0 || a.blockers.length > 0,
  );
  if (agentsActive.length === 0) {
    lines.push("_No in-flight work or blockers._");
  } else {
    for (const entry of agentsActive) {
      lines.push(`**${agentHeading(entry)}**`);
      for (const issue of entry.today) {
        lines.push(`- ${issueLine(issue, appBaseUrl)}`);
      }
      for (const blocker of entry.blockers) {
        lines.push(`- ${blockerLine(blocker, appBaseUrl)}`);
      }
      lines.push("");
    }
  }
  lines.push("");

  // ── 4. Cost ─────────────────────────────────────────────────────────
  lines.push("## Cost");
  lines.push("");
  if (windowSpendCents === 0) {
    lines.push("_No metered spend in the window._");
  } else {
    lines.push(`${formatMoney(windowSpendCents)} spent in the last ${windowHoursLabel(snapshot.windowStart, snapshot.windowEnd)}.`);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** "24 hours" / "48 hours" / "7 days" etc. */
function windowHoursLabel(start: Date, end: Date): string {
  const hours = Math.round((end.getTime() - start.getTime()) / (60 * 60 * 1000));
  if (hours === 24) return "24 hours";
  if (hours === 48) return "48 hours";
  if (hours === 72) return "72 hours";
  if (hours > 0 && hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} hours`;
}
