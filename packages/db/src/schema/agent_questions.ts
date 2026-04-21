/**
 * agent_questions — blocking clarification questions from agents to humans.
 *
 * When an agent hits genuine ambiguity mid-run that only the user can
 * resolve (e.g. "should I file under Q1 or Q2?", "which account?"), it
 * writes a question here instead of guessing. The run holds open while
 * the question is unanswered; the UI surfaces a popup/toast so the user
 * can respond without navigating anywhere. Once the user answers, the
 * agent polls this record on its next heartbeat and resumes with the
 * answer in hand.
 *
 * Kept separate from `approvals` and `agent_peer_notes` because the
 * shape is different: free-text answer (not approve/reject, not
 * agent-to-agent addressing). Status machine is deliberately tiny:
 *   - open: waiting on the user
 *   - answered: user typed a response; agent should read `answer`
 *   - dismissed: user said "nope, use your best judgement" — agent
 *     treats this as "no clarification available, proceed"
 *
 * Indexed on (companyId, status) so the UI's "are there any open
 * questions?" query is cheap.
 */
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const AGENT_QUESTION_STATUSES = ["open", "answered", "dismissed"] as const;
export type AgentQuestionStatus = (typeof AGENT_QUESTION_STATUSES)[number];

export const agentQuestions = pgTable(
  "agent_questions",
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
    /** The run that paused to ask. Lets the UI link back and lets the
     * agent's next heartbeat know it was blocked on this question. */
    runId: uuid("run_id").references(() => heartbeatRuns.id),
    /** What the agent is asking. Should be short — one clarifying
     * question, not a wall of context. */
    question: text("question").notNull(),
    /** Optional context the agent thinks the user needs to answer well
     * (e.g. "I saw these three candidate categories"). Rendered below
     * the question in the popup. */
    context: text("context"),
    status: text("status").notNull().default("open"),
    /** Populated when status transitions away from open. Free-text for
     * "answered", empty string for "dismissed" (agent treats null/empty
     * as "user declined to clarify"). */
    answer: text("answer"),
    answeredByUserId: text("answered_by_user_id"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("agent_questions_company_status_idx").on(
      table.companyId,
      table.status,
    ),
    issueIdx: index("agent_questions_issue_idx").on(table.issueId),
    runIdx: index("agent_questions_run_idx").on(table.runId),
  }),
);

export type AgentQuestion = typeof agentQuestions.$inferSelect;
export type AgentQuestionInsert = typeof agentQuestions.$inferInsert;
