/**
 * agent_peer_notes — lightweight peer messages between agents on a task.
 *
 * This table is the storage layer for agent-to-agent collaboration: one
 * agent leaving a note for another agent working the same task.
 * Typical examples:
 *   - junior agent flags a blocker and asks a senior to take a look
 *   - senior agent pastes context/guidance for a junior mid-run
 *   - one agent hands a task off to another, including what they tried
 *
 * Kept intentionally separate from `issue_comments` even though shapes
 * rhyme, because:
 *   - peer notes have an addressing model (`toAgentId` + optional
 *     acknowledgement/resolution), not the flat authorship model of
 *     comments
 *   - surfacing these in the UI is a different pattern ("agent whisper"
 *     in a dedicated lane) than general human conversation
 *   - agents writing these will go through a distinct tool, not the
 *     normal comment API
 *
 * When `toAgentId` is null the note is broadcast to anyone working on
 * the task (e.g. the manager agent sharing context with the team).
 */
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const AGENT_PEER_NOTE_KINDS = [
  "help_request",
  "context_share",
  "blocker_flag",
  "handoff",
  "mentor_nudge",
] as const;
export type AgentPeerNoteKind = (typeof AGENT_PEER_NOTE_KINDS)[number];

export const agentPeerNotes = pgTable(
  "agent_peer_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id),
    fromAgentId: uuid("from_agent_id")
      .notNull()
      .references(() => agents.id),
    /** Null = broadcast to anyone on the task. */
    toAgentId: uuid("to_agent_id").references(() => agents.id),
    /** The run that originated this note, if any. Lets the UI link back
     * to the exact stream where the agent hit the wall. */
    runId: uuid("run_id").references(() => heartbeatRuns.id),
    /** One of AGENT_PEER_NOTE_KINDS — validated at the application
     * layer because Postgres text enums are a pain to evolve. */
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdx: index("agent_peer_notes_issue_idx").on(table.issueId),
    companyIdx: index("agent_peer_notes_company_idx").on(table.companyId),
    toAgentIdx: index("agent_peer_notes_to_agent_idx").on(table.toAgentId),
    companyIssueCreatedIdx: index("agent_peer_notes_company_issue_created_idx").on(
      table.companyId,
      table.issueId,
      table.createdAt,
    ),
  }),
);

export type AgentPeerNote = typeof agentPeerNotes.$inferSelect;
export type AgentPeerNoteInsert = typeof agentPeerNotes.$inferInsert;
