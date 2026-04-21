/**
 * Daily standup snapshot — the "PMO" view of what every agent in a
 * company did yesterday, what they're working on today, and what's in
 * their way.
 *
 * This is intentionally read-optimised (one payload, no N+1 follow-ups)
 * so the UI can render the whole page from a single request. If it grows
 * past ~a few hundred agents we'll need to paginate or stream, but that's
 * not today's problem.
 */
export interface StandupSnapshot {
  companyId: string;
  /** ISO timestamps describing the rolling window this snapshot covers. */
  windowStart: Date;
  windowEnd: Date;
  /** Per-agent standup entries, sorted by agent name for stable UI. */
  agents: AgentStandupEntry[];
  /**
   * Totals computed from the per-agent slices — handy for a header
   * summary tile. UI could derive these, but pre-computing keeps
   * rendering logic dumb.
   */
  totals: {
    /** Distinct agents that had any yesterday / today / blocker activity. */
    agentsReporting: number;
    completedYesterday: number;
    activeToday: number;
    blockers: number;
  };
}

export interface AgentStandupEntry {
  agent: {
    id: string;
    name: string;
    role: string | null;
    title: string | null;
    icon: string | null;
    status: string;
  };
  yesterday: StandupIssueRef[];
  today: StandupIssueRef[];
  blockers: StandupBlocker[];
  /** Heartbeat runs that finished in the window, keyed by outcome. */
  runs: {
    succeeded: number;
    failed: number;
    cancelled: number;
  };
}

export interface StandupIssueRef {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  priority: string;
  /** Populated for yesterday-completed; null for today-active. */
  completedAt: Date | null;
  updatedAt: Date;
}

/** A blocker is either a blocked issue or an unresolved peer-note flag. */
export type StandupBlocker =
  | {
      kind: "blocked_issue";
      issue: StandupIssueRef;
    }
  | {
      kind: "peer_note";
      noteId: string;
      noteKind: "help_request" | "blocker_flag";
      body: string;
      issue: StandupIssueRef;
      fromAgentId: string;
      toAgentId: string | null;
      createdAt: Date;
    };
