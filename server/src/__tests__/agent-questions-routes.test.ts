/**
 * Route-level behaviour for the agent-asks-question lane.
 *
 * The agent↔human clarification loop has tight auth rules:
 *   - only agents may POST a new question
 *   - only humans may answer or dismiss
 *   - answer/dismiss are gated by status=open at the DB layer, so the
 *     route returns 409 when the service reports the row is no longer
 *     available
 *
 * We mock the services layer (same pattern as agent-peer-notes-routes)
 * so these tests stay fast and tightly scoped to the route wiring.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentQuestionRoutes } from "../routes/agent-questions.js";
import { errorHandler } from "../middleware/index.js";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockQuestionService = vi.hoisted(() => ({
  ask: vi.fn(),
  getById: vi.fn(),
  listOpenForCompany: vi.fn(),
  answer: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  agentQuestionService: () => mockQuestionService,
  issueService: () => mockIssueService,
}));

const COMPANY_ID = "company-1";
const ISSUE_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";
const QUESTION_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";

type Actor =
  | {
      type: "agent";
      agentId: string;
      companyId: string;
      runId?: string | null;
      source: "agent_jwt";
    }
  | {
      type: "board";
      userId: string;
      companyIds: string[];
      source: "local_implicit";
      isInstanceAdmin: boolean;
    };

function createApp(actor: Actor) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", agentQuestionRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function boardActor(companyId = COMPANY_ID): Actor {
  return {
    type: "board",
    userId: USER_ID,
    companyIds: [companyId],
    source: "local_implicit",
    isInstanceAdmin: false,
  };
}

function agentActor(overrides: Partial<Extract<Actor, { type: "agent" }>> = {}): Actor {
  return {
    type: "agent",
    agentId: AGENT_ID,
    companyId: COMPANY_ID,
    runId: RUN_ID,
    source: "agent_jwt",
    ...overrides,
  };
}

function makeIssue() {
  return {
    id: ISSUE_ID,
    companyId: COMPANY_ID,
    status: "in_progress",
    assigneeAgentId: AGENT_ID,
    assigneeUserId: null,
  };
}

function makeQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: QUESTION_ID,
    companyId: COMPANY_ID,
    issueId: ISSUE_ID,
    fromAgentId: AGENT_ID,
    runId: RUN_ID,
    question: "Which S3 bucket should I use for nightly exports?",
    context: null,
    status: "open",
    answer: null,
    answeredByUserId: null,
    answeredAt: null,
    createdAt: new Date("2026-04-21T12:00:00.000Z"),
    updatedAt: new Date("2026-04-21T12:00:00.000Z"),
    ...overrides,
  };
}

describe("agent question routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.getById.mockResolvedValue(makeIssue());
  });

  describe("POST /issues/:id/questions", () => {
    it("lets an agent ask a question and pipes the runId through", async () => {
      mockQuestionService.ask.mockImplementationOnce(async (_id, input) =>
        makeQuestion({
          question: input.question,
          context: input.context,
          runId: input.runId,
        }),
      );
      const res = await request(createApp(agentActor()))
        .post(`/api/issues/${ISSUE_ID}/questions`)
        .send({
          question: "Which S3 bucket should I use for nightly exports?",
          context: "Needed before next scheduled run.",
        });

      expect(res.status).toBe(201);
      expect(mockQuestionService.ask).toHaveBeenCalledWith(ISSUE_ID, {
        question: "Which S3 bucket should I use for nightly exports?",
        context: "Needed before next scheduled run.",
        fromAgentId: AGENT_ID,
        runId: RUN_ID,
      });
    });

    it("refuses to let humans ask on behalf of an agent", async () => {
      const res = await request(createApp(boardActor()))
        .post(`/api/issues/${ISSUE_ID}/questions`)
        .send({ question: "hi from a human" });
      expect(res.status).toBe(403);
      expect(mockQuestionService.ask).not.toHaveBeenCalled();
    });

    it("rejects an empty question at the validator", async () => {
      const res = await request(createApp(agentActor()))
        .post(`/api/issues/${ISSUE_ID}/questions`)
        .send({ question: "" });
      expect(res.status).toBe(400);
      expect(mockQuestionService.ask).not.toHaveBeenCalled();
    });

    it("404s when the issue is missing without hitting the service", async () => {
      mockIssueService.getById.mockResolvedValueOnce(null);
      const res = await request(createApp(agentActor()))
        .post(`/api/issues/${ISSUE_ID}/questions`)
        .send({ question: "where do I write logs?" });
      expect(res.status).toBe(404);
      expect(mockQuestionService.ask).not.toHaveBeenCalled();
    });
  });

  describe("GET /issues/:id/questions/:qid", () => {
    it("returns the question when it belongs to the issue", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(makeQuestion());
      const res = await request(createApp(agentActor())).get(
        `/api/issues/${ISSUE_ID}/questions/${QUESTION_ID}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(QUESTION_ID);
    });

    it("404s when the question belongs to another issue", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(
        makeQuestion({ issueId: "99999999-9999-4999-8999-999999999999" }),
      );
      const res = await request(createApp(agentActor())).get(
        `/api/issues/${ISSUE_ID}/questions/${QUESTION_ID}`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /companies/:companyId/questions/open", () => {
    it("returns the hydrated open-question list for a company", async () => {
      mockQuestionService.listOpenForCompany.mockResolvedValueOnce([makeQuestion()]);
      const res = await request(createApp(boardActor())).get(
        `/api/companies/${COMPANY_ID}/questions/open`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockQuestionService.listOpenForCompany).toHaveBeenCalledWith(COMPANY_ID);
    });
  });

  describe("POST /questions/:qid/answer", () => {
    it("lets a human answer and records who answered", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(makeQuestion());
      mockQuestionService.answer.mockResolvedValueOnce(
        makeQuestion({
          status: "answered",
          answer: "use paperclip-nightly-prod",
          answeredByUserId: USER_ID,
        }),
      );
      const res = await request(createApp(boardActor()))
        .post(`/api/questions/${QUESTION_ID}/answer`)
        .send({ answer: "use paperclip-nightly-prod" });

      expect(res.status).toBe(200);
      expect(mockQuestionService.answer).toHaveBeenCalledWith(QUESTION_ID, {
        answer: "use paperclip-nightly-prod",
        answeredByUserId: USER_ID,
      });
    });

    it("refuses to let agents answer their own question", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(makeQuestion());
      const res = await request(createApp(agentActor()))
        .post(`/api/questions/${QUESTION_ID}/answer`)
        .send({ answer: "answering myself" });
      expect(res.status).toBe(403);
      expect(mockQuestionService.answer).not.toHaveBeenCalled();
    });

    it("returns 409 when the service reports the row is no longer open", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(makeQuestion());
      mockQuestionService.answer.mockResolvedValueOnce(null);
      const res = await request(createApp(boardActor()))
        .post(`/api/questions/${QUESTION_ID}/answer`)
        .send({ answer: "too late" });
      expect(res.status).toBe(409);
    });

    it("404s for an unknown question id", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(null);
      const res = await request(createApp(boardActor()))
        .post(`/api/questions/${QUESTION_ID}/answer`)
        .send({ answer: "hello" });
      expect(res.status).toBe(404);
      expect(mockQuestionService.answer).not.toHaveBeenCalled();
    });

    it("rejects empty answers at the validator", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(makeQuestion());
      const res = await request(createApp(boardActor()))
        .post(`/api/questions/${QUESTION_ID}/answer`)
        .send({ answer: "" });
      expect(res.status).toBe(400);
      expect(mockQuestionService.answer).not.toHaveBeenCalled();
    });
  });

  describe("POST /questions/:qid/dismiss", () => {
    it("lets a human dismiss an open question", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(makeQuestion());
      mockQuestionService.dismiss.mockResolvedValueOnce(
        makeQuestion({ status: "dismissed", answeredByUserId: USER_ID }),
      );
      const res = await request(createApp(boardActor())).post(
        `/api/questions/${QUESTION_ID}/dismiss`,
      );
      expect(res.status).toBe(200);
      expect(mockQuestionService.dismiss).toHaveBeenCalledWith(QUESTION_ID, {
        dismissedByUserId: USER_ID,
      });
    });

    it("refuses to let agents dismiss a question", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(makeQuestion());
      const res = await request(createApp(agentActor())).post(
        `/api/questions/${QUESTION_ID}/dismiss`,
      );
      expect(res.status).toBe(403);
      expect(mockQuestionService.dismiss).not.toHaveBeenCalled();
    });

    it("returns 409 when the service reports the row is no longer open", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(makeQuestion());
      mockQuestionService.dismiss.mockResolvedValueOnce(null);
      const res = await request(createApp(boardActor())).post(
        `/api/questions/${QUESTION_ID}/dismiss`,
      );
      expect(res.status).toBe(409);
    });

    it("404s for an unknown question id", async () => {
      mockQuestionService.getById.mockResolvedValueOnce(null);
      const res = await request(createApp(boardActor())).post(
        `/api/questions/${QUESTION_ID}/dismiss`,
      );
      expect(res.status).toBe(404);
      expect(mockQuestionService.dismiss).not.toHaveBeenCalled();
    });
  });
});
