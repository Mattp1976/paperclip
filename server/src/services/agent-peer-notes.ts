/**
 * agent-peer-notes service — storage-layer for agent-to-agent notes
 * scoped to a task. See `packages/db/src/schema/agent_peer_notes.ts` for
 * the table, and `packages/shared/src/types/agent-peer-note.ts` for the
 * wire type.
 *
 * Kept deliberately thin: no redaction, no activity logging, no
 * wake-up side-effects. Agents leaving notes for each other are a
 * different collaboration surface from human comments, so we'd rather
 * grow this module as needs are identified than pre-empt behaviour.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@orqestra/db";
import { agentPeerNotes, issues } from "@orqestra/db";
import type { AgentPeerNoteKind } from "@orqestra/shared";
import { notFound } from "../errors.js";

const MAX_PEER_NOTE_PAGE_LIMIT = 500;

export interface AddAgentPeerNoteInput {
  kind: AgentPeerNoteKind;
  body: string;
  fromAgentId: string;
  toAgentId?: string | null;
  runId?: string | null;
}

export function agentPeerNoteService(db: Db) {
  async function resolveIssueCompany(issueId: string): Promise<string> {
    const row = await db
      .select({ companyId: issues.companyId })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Issue not found");
    return row.companyId;
  }

  return {
    listForIssue: async (
      issueId: string,
      opts?: { limit?: number | null },
    ) => {
      const limit =
        opts?.limit && opts.limit > 0
          ? Math.min(Math.floor(opts.limit), MAX_PEER_NOTE_PAGE_LIMIT)
          : null;
      const baseQuery = db
        .select()
        .from(agentPeerNotes)
        .where(eq(agentPeerNotes.issueId, issueId))
        .orderBy(desc(agentPeerNotes.createdAt), desc(agentPeerNotes.id));
      return limit ? await baseQuery.limit(limit) : await baseQuery;
    },

    getById: async (noteId: string) =>
      db
        .select()
        .from(agentPeerNotes)
        .where(eq(agentPeerNotes.id, noteId))
        .then((rows) => rows[0] ?? null),

    add: async (issueId: string, input: AddAgentPeerNoteInput) => {
      const companyId = await resolveIssueCompany(issueId);
      const [note] = await db
        .insert(agentPeerNotes)
        .values({
          companyId,
          issueId,
          fromAgentId: input.fromAgentId,
          toAgentId: input.toAgentId ?? null,
          runId: input.runId ?? null,
          kind: input.kind,
          body: input.body,
        })
        .returning();
      return note;
    },

    acknowledge: async (noteId: string) => {
      const [note] = await db
        .update(agentPeerNotes)
        .set({ acknowledgedAt: new Date() })
        .where(and(eq(agentPeerNotes.id, noteId)))
        .returning();
      return note ?? null;
    },

    resolve: async (noteId: string) => {
      const [note] = await db
        .update(agentPeerNotes)
        .set({ resolvedAt: new Date() })
        .where(eq(agentPeerNotes.id, noteId))
        .returning();
      return note ?? null;
    },
  };
}

export type AgentPeerNoteService = ReturnType<typeof agentPeerNoteService>;
