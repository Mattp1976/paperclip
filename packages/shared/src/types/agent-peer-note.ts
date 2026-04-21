/**
 * AgentPeerNote — a note one agent leaves for another on the same task.
 *
 * See `packages/db/src/schema/agent_peer_notes.ts` for storage and the
 * motivation for keeping this distinct from `IssueComment`.
 */

export const AGENT_PEER_NOTE_KINDS = [
  "help_request",
  "context_share",
  "blocker_flag",
  "handoff",
  "mentor_nudge",
] as const;

export type AgentPeerNoteKind = (typeof AGENT_PEER_NOTE_KINDS)[number];

export interface AgentPeerNote {
  id: string;
  companyId: string;
  issueId: string;
  fromAgentId: string;
  /** Null = broadcast to anyone on the task. */
  toAgentId: string | null;
  /** The run that originated this note, if any. */
  runId: string | null;
  kind: AgentPeerNoteKind;
  body: string;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
}
