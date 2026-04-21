/**
 * Standup service — the "PMO" daily snapshot that answers, per agent,
 * "what did you close yesterday, what are you working on today, what's
 * blocking you?"
 *
 * This is a read-only aggregation over the existing stores (issues,
 * heartbeat_runs, agent_peer_notes). We keep it in its own service so
 * callers don't need to hand-roll a half-dozen joins every time the PMO
 * surface or a Slack bot wants a status summary.
 *
 * Shape decisions:
 * - We return *only* agents that had any activity in the window. A
 *   company with 80 idle agents shouldn't yield 80 empty blocks.
 * - We use a rolling 24h window by default. Callers can pass a custom
 *   windowMs to generate e.g. "what happened over the long weekend".
 * - Peer-note-based blockers are surfaced against the agent they're
 *   *directed to* (toAgentId). If a note is broadcast (toAgentId null)
 *   we attach it to the issue's current assignee so it still surfaces
 *   to someone.
 */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@mattparrytfc/db";
import {
  agentPeerNotes,
  agents,
  heartbeatRuns,
  issues,
} from "@mattparrytfc/db";
import type {
  AgentStandupEntry,
  StandupBlocker,
  StandupIssueRef,
  StandupSnapshot,
} from "@mattparrytfc/shared";

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const TODAY_ISSUE_STATUSES = ["in_progress", "in_review", "todo"] as const;

export interface DailyStandupOptions {
  /** Milliseconds the window spans, ending at `now`. Default 24h. */
  windowMs?: number;
  /** Override the window end (useful in tests). Defaults to now(). */
  now?: Date;
}

export function standupService(db: Db) {
  return {
    dailyForCompany: async (
      companyId: string,
      opts: DailyStandupOptions = {},
    ): Promise<StandupSnapshot> => {
      const windowEnd = opts.now ?? new Date();
      const windowStart = new Date(
        windowEnd.getTime() - (opts.windowMs ?? DEFAULT_WINDOW_MS),
      );

      // 1. Pull every agent in the company once so we can render
      //    metadata without an extra lookup per slice.
      const agentRows = await db
        .select({
          id: agents.id,
          name: agents.name,
          role: agents.role,
          title: agents.title,
          icon: agents.icon,
          status: agents.status,
        })
        .from(agents)
        .where(eq(agents.companyId, companyId));

      const agentById = new Map(agentRows.map((a) => [a.id, a]));

      // 2. Pull the issue slices in three queries — "completed in window",
      //    "open and assigned", and "blocked and assigned" — then bucket
      //    by assigneeAgentId in memory. We query by companyId so the
      //    assignee nullable doesn't defeat the index.
      const completedRows = await db
        .select()
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.status, "done"),
            gte(issues.completedAt, windowStart),
          ),
        )
        .orderBy(desc(issues.completedAt));

      const openRows = await db
        .select()
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            inArray(issues.status, TODAY_ISSUE_STATUSES as unknown as string[]),
          ),
        )
        .orderBy(desc(issues.updatedAt));

      const blockedRows = await db
        .select()
        .from(issues)
        .where(
          and(eq(issues.companyId, companyId), eq(issues.status, "blocked")),
        )
        .orderBy(desc(issues.updatedAt));

      // 3. Pull unresolved help_request / blocker_flag peer notes for the
      //    window. These surface as blockers, attached to the note's
      //    toAgentId (or the issue's assignee if broadcast).
      const peerNoteRows = await db
        .select({
          id: agentPeerNotes.id,
          issueId: agentPeerNotes.issueId,
          fromAgentId: agentPeerNotes.fromAgentId,
          toAgentId: agentPeerNotes.toAgentId,
          kind: agentPeerNotes.kind,
          body: agentPeerNotes.body,
          createdAt: agentPeerNotes.createdAt,
          resolvedAt: agentPeerNotes.resolvedAt,
        })
        .from(agentPeerNotes)
        .where(
          and(
            eq(agentPeerNotes.companyId, companyId),
            inArray(agentPeerNotes.kind, ["help_request", "blocker_flag"]),
            isNull(agentPeerNotes.resolvedAt),
          ),
        );

      // 4. Pull heartbeat run outcome tallies per agent in the window.
      const runRows = await db
        .select({
          agentId: heartbeatRuns.agentId,
          status: heartbeatRuns.status,
          count: sql<number>`count(*)`.as("count"),
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            gte(heartbeatRuns.finishedAt, windowStart),
          ),
        )
        .groupBy(heartbeatRuns.agentId, heartbeatRuns.status);

      // Build an issueId → companyRow map so peer notes can resolve
      // metadata without a per-note query. Only covers blocked+open for
      // the blocker-attachment path.
      const issueById = new Map(
        [...completedRows, ...openRows, ...blockedRows].map((row) => [row.id, row]),
      );

      // Additional lookup for peer-note issues we haven't already loaded.
      const missingIssueIds = peerNoteRows
        .map((n) => n.issueId)
        .filter((id) => !issueById.has(id));
      if (missingIssueIds.length > 0) {
        const extra = await db
          .select()
          .from(issues)
          .where(
            and(
              eq(issues.companyId, companyId),
              inArray(issues.id, missingIssueIds),
            ),
          );
        for (const row of extra) issueById.set(row.id, row);
      }

      // 5. Bucket everything by the agent they belong to.
      const entries = new Map<string, AgentStandupEntry>();
      function ensureEntry(agentId: string): AgentStandupEntry | null {
        const meta = agentById.get(agentId);
        if (!meta) return null;
        let entry = entries.get(agentId);
        if (!entry) {
          entry = {
            agent: {
              id: meta.id,
              name: meta.name,
              role: meta.role ?? null,
              title: meta.title ?? null,
              icon: meta.icon ?? null,
              status: meta.status,
            },
            yesterday: [],
            today: [],
            blockers: [],
            runs: { succeeded: 0, failed: 0, cancelled: 0 },
          };
          entries.set(agentId, entry);
        }
        return entry;
      }

      function toIssueRef(row: (typeof issueById extends Map<string, infer T> ? T : never)): StandupIssueRef {
        return {
          id: row.id,
          identifier: row.identifier,
          title: row.title,
          status: row.status,
          priority: row.priority,
          completedAt: row.completedAt ?? null,
          updatedAt: row.updatedAt,
        };
      }

      for (const row of completedRows) {
        if (!row.assigneeAgentId) continue;
        const entry = ensureEntry(row.assigneeAgentId);
        if (!entry) continue;
        entry.yesterday.push(toIssueRef(row));
      }
      for (const row of openRows) {
        if (!row.assigneeAgentId) continue;
        const entry = ensureEntry(row.assigneeAgentId);
        if (!entry) continue;
        entry.today.push(toIssueRef(row));
      }
      for (const row of blockedRows) {
        if (!row.assigneeAgentId) continue;
        const entry = ensureEntry(row.assigneeAgentId);
        if (!entry) continue;
        const blocker: StandupBlocker = {
          kind: "blocked_issue",
          issue: toIssueRef(row),
        };
        entry.blockers.push(blocker);
      }
      for (const note of peerNoteRows) {
        const issueRow = issueById.get(note.issueId);
        if (!issueRow) continue;
        const targetAgentId =
          note.toAgentId ?? issueRow.assigneeAgentId ?? null;
        if (!targetAgentId) continue;
        const entry = ensureEntry(targetAgentId);
        if (!entry) continue;
        entry.blockers.push({
          kind: "peer_note",
          noteId: note.id,
          noteKind: note.kind as "help_request" | "blocker_flag",
          body: note.body,
          issue: toIssueRef(issueRow),
          fromAgentId: note.fromAgentId,
          toAgentId: note.toAgentId ?? null,
          createdAt: note.createdAt,
        });
      }
      for (const row of runRows) {
        const entry = ensureEntry(row.agentId);
        if (!entry) continue;
        const count = Number(row.count);
        if (row.status === "succeeded") entry.runs.succeeded += count;
        else if (row.status === "failed" || row.status === "timed_out")
          entry.runs.failed += count;
        else if (row.status === "cancelled") entry.runs.cancelled += count;
      }

      // Only include agents with any activity. An agent with no
      // yesterday / today / blockers / runs is noise in a daily.
      const reporting = Array.from(entries.values()).filter(
        (entry) =>
          entry.yesterday.length > 0 ||
          entry.today.length > 0 ||
          entry.blockers.length > 0 ||
          entry.runs.succeeded + entry.runs.failed + entry.runs.cancelled > 0,
      );

      reporting.sort((a, b) => a.agent.name.localeCompare(b.agent.name));

      const totals = reporting.reduce(
        (acc, entry) => {
          acc.completedYesterday += entry.yesterday.length;
          acc.activeToday += entry.today.length;
          acc.blockers += entry.blockers.length;
          return acc;
        },
        { agentsReporting: reporting.length, completedYesterday: 0, activeToday: 0, blockers: 0 },
      );

      return {
        companyId,
        windowStart,
        windowEnd,
        agents: reporting,
        totals,
      };
    },
  };
}

export type StandupService = ReturnType<typeof standupService>;
