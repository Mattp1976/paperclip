/**
 * AgentQuestion — a blocking clarification from an agent to the user.
 *
 * See `packages/db/src/schema/agent_questions.ts` for the storage model
 * and UX rationale (short question + optional context, user answers in
 * a popup, agent resumes on next heartbeat).
 */

export const AGENT_QUESTION_STATUSES = ["open", "answered", "dismissed"] as const;

export type AgentQuestionStatus = (typeof AGENT_QUESTION_STATUSES)[number];

export interface AgentQuestion {
  id: string;
  companyId: string;
  issueId: string;
  fromAgentId: string;
  runId: string | null;
  question: string;
  /** Optional extra context the agent wants the user to see. */
  context: string | null;
  status: AgentQuestionStatus;
  answer: string | null;
  answeredByUserId: string | null;
  answeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Hydrated variant the popup uses — knows the agent and task it came
 * from so we can render a useful label. */
export interface AgentQuestionForUser extends AgentQuestion {
  agent: {
    id: string;
    name: string;
    title: string | null;
  };
  issue: {
    id: string;
    identifier: string | null;
    title: string;
  };
}
