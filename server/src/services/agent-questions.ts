/**
 * agent-questions service — storage for blocking clarification questions
 * from agents to humans. See `packages/db/src/schema/agent_questions.ts`
 * for the table and rationale.
 *
 * Behaviour is deliberately simple:
 *   - `ask`: agent inserts an open question
 *   - `listOpenForCompany`: the UI popup polls this to show unanswered
 *     questions (hydrated with agent + issue for label rendering)
 *   - `getById`: agents poll by id to see if their question has been
 *     answered (so they can unblock)
 *   - `answer` / `dismiss`: human side of the loop
 *
 * We do not cascade to run state here — the agent runtime is expected
 * to check `status` on its next heartbeat and proceed accordingly.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@orqestra/db";
import { agentQuestions, agents, issues } from "@orqestra/db";
import type { AgentQuestionForUser } from "@orqestra/shared";
import { notFound } from "../errors.js";

export interface AskAgentQuestionInput {
  question: string;
  context?: string | null;
  fromAgentId: string;
  runId?: string | null;
}

export function agentQuestionService(db: Db) {
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
    ask: async (issueId: string, input: AskAgentQuestionInput) => {
      const companyId = await resolveIssueCompany(issueId);
      const [row] = await db
        .insert(agentQuestions)
        .values({
          companyId,
          issueId,
          fromAgentId: input.fromAgentId,
          runId: input.runId ?? null,
          question: input.question,
          context: input.context ?? null,
        })
        .returning();
      return row;
    },

    getById: async (id: string) =>
      db
        .select()
        .from(agentQuestions)
        .where(eq(agentQuestions.id, id))
        .then((rows) => rows[0] ?? null),

    listOpenForCompany: async (companyId: string): Promise<AgentQuestionForUser[]> => {
      const rows = await db
        .select({
          q: agentQuestions,
          agentId: agents.id,
          agentName: agents.name,
          agentTitle: agents.title,
          issueId: issues.id,
          issueIdentifier: issues.identifier,
          issueTitle: issues.title,
        })
        .from(agentQuestions)
        .innerJoin(agents, eq(agents.id, agentQuestions.fromAgentId))
        .innerJoin(issues, eq(issues.id, agentQuestions.issueId))
        .where(
          and(
            eq(agentQuestions.companyId, companyId),
            eq(agentQuestions.status, "open"),
          ),
        )
        .orderBy(desc(agentQuestions.createdAt));

      return rows.map((r) => ({
        id: r.q.id,
        companyId: r.q.companyId,
        issueId: r.q.issueId,
        fromAgentId: r.q.fromAgentId,
        runId: r.q.runId,
        question: r.q.question,
        context: r.q.context,
        status: r.q.status as AgentQuestionForUser["status"],
        answer: r.q.answer,
        answeredByUserId: r.q.answeredByUserId,
        answeredAt: r.q.answeredAt,
        createdAt: r.q.createdAt,
        updatedAt: r.q.updatedAt,
        agent: {
          id: r.agentId,
          name: r.agentName,
          title: r.agentTitle,
        },
        issue: {
          id: r.issueId,
          identifier: r.issueIdentifier,
          title: r.issueTitle,
        },
      }));
    },

    answer: async (id: string, input: { answer: string; answeredByUserId: string }) => {
      const [row] = await db
        .update(agentQuestions)
        .set({
          status: "answered",
          answer: input.answer,
          answeredByUserId: input.answeredByUserId,
          answeredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(agentQuestions.id, id), eq(agentQuestions.status, "open")))
        .returning();
      return row ?? null;
    },

    dismiss: async (id: string, input: { dismissedByUserId: string }) => {
      const [row] = await db
        .update(agentQuestions)
        .set({
          status: "dismissed",
          answer: "",
          answeredByUserId: input.dismissedByUserId,
          answeredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(agentQuestions.id, id), eq(agentQuestions.status, "open")))
        .returning();
      return row ?? null;
    },
  };
}

export type AgentQuestionService = ReturnType<typeof agentQuestionService>;
