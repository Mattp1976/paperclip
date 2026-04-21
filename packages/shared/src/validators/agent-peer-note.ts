import { z } from "zod";
import { AGENT_PEER_NOTE_KINDS } from "../types/agent-peer-note.js";

export const addAgentPeerNoteSchema = z.object({
  kind: z.enum(AGENT_PEER_NOTE_KINDS),
  body: z.string().min(1).max(10_000),
  /** Null / omitted = broadcast. */
  toAgentId: z.string().uuid().nullable().optional(),
  /** Optional origin run id. */
  runId: z.string().uuid().nullable().optional(),
});

export type AddAgentPeerNote = z.infer<typeof addAgentPeerNoteSchema>;
