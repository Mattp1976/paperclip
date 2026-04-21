/**
 * Route-level behaviour for the agent-peer-notes lane.
 *
 * The important contract: only actors with `type === "agent"` may POST a
 * new note (peer notes are expressly agent↔agent; humans use the regular
 * comment thread). All GET/ACK/RESOLVE operations are open to any actor
 * with access to the owning company.
 *
 * We mock the services layer so these tests stay fast and tightly scoped
 * to the route wiring, matching the pattern used by
 * issue-comment-reopen-routes.test.ts.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockPeerNoteService = vi.hoisted(() => ({
  listForIssue: vi.fn(),
  getById: vi.fn(),
  add: vi.fn(),
  acknowledge: vi.fn(),
  resolve: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => ({}),
  agentPeerNoteService: () => mockPeerNoteService,
  documentService: () => ({}),
  executionWorkspaceService: () => ({}),
  goalService: () => ({}),
  heartbeatService: () => ({
    wakeup: vi.fn(async () => undefined),
    reportRunActivity: vi.fn(async () => undefined),
  }),
  issueApprovalService: () => ({}),
  issueService: () => mockIssueService,
  logActivity: vi.fn(async () => undefined),
  projectService: () => ({}),
  routineService: () => ({}),
  workProductService: () => ({}),
}));

const ISSUE_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_AGENT_ID = "33333333-3333-4333-8333-333333333333";
const NOTE_ID = "44444444-4444-4444-8444-444444444444";
const RUN_ID = "55555555-5555-4555-8555-555555555555";

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
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

function boardActor(companyId = "company-1"): Actor {
  return {
    type: "board",
    userId: "local-board",
    companyIds: [companyId],
    source: "local_implicit",
    isInstanceAdmin: false,
  };
}

function agentActor(overrides: Partial<Extract<Actor, { type: "agent" }>> = {}): Actor {
  return {
    type: "agent",
    agentId: AGENT_ID,
    companyId: "company-1",
    runId: RUN_ID,
    source: "agent_jwt",
    ...overrides,
  };
}

function makeIssue() {
  return {
    id: ISSUE_ID,
    companyId: "company-1",
    status: "in_progress",
    assigneeAgentId: AGENT_ID,
    assigneeUserId: null,
  };
}

function makeNote(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    companyId: "company-1",
    issueId: ISSUE_ID,
    fromAgentId: AGENT_ID,
    toAgentId: OTHER_AGENT_ID,
    runId: RUN_ID,
    kind: "help_request",
    body: "stuck on auth token refresh",
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: new Date("2026-04-21T12:00:00.000Z"),
    ...overrides,
  };
}

describe("agent peer notes routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.getById.mockResolvedValue(makeIssue());
  });

  describe("GET /issues/:id/peer-notes", () => {
    it("returns notes when issue is accessible", async () => {
      mockPeerNoteService.listForIssue.mockResolvedValueOnce([makeNote()]);
      const res = await request(createApp(boardActor())).get(
        `/api/issues/${ISSUE_ID}/peer-notes`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockPeerNoteService.listForIssue).toHaveBeenCalledWith(ISSUE_ID);
    });

    it("404s when the issue is missing", async () => {
      mockIssueService.getById.mockResolvedValueOnce(null);
      const res = await request(createApp(boardActor())).get(
        `/api/issues/${ISSUE_ID}/peer-notes`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /issues/:id/peer-notes", () => {
    it("lets an agent author a note with run/target inferred from the actor", async () => {
      mockPeerNoteService.add.mockImplementationOnce(async (_id, input) =>
        makeNote({
          kind: input.kind,
          body: input.body,
          fromAgentId: input.fromAgentId,
          toAgentId: input.toAgentId ?? null,
          runId: input.runId ?? null,
        }),
      );
      const res = await request(createApp(agentActor()))
        .post(`/api/issues/${ISSUE_ID}/peer-notes`)
        .send({ kind: "help_request", body: "stuck on token refresh" });

      expect(res.status).toBe(201);
      expect(mockPeerNoteService.add).toHaveBeenCalledWith(ISSUE_ID, {
        kind: "help_request",
        body: "stuck on token refresh",
        fromAgentId: AGENT_ID,
        toAgentId: null,
        runId: RUN_ID,
      });
    });

    it("honours an explicit toAgentId from the body", async () => {
      mockPeerNoteService.add.mockResolvedValueOnce(makeNote({ toAgentId: OTHER_AGENT_ID }));
      const res = await request(createApp(agentActor()))
        .post(`/api/issues/${ISSUE_ID}/peer-notes`)
        .send({
          kind: "handoff",
          body: "picking up from here — owning the API integration",
          toAgentId: OTHER_AGENT_ID,
        });

      expect(res.status).toBe(201);
      expect(mockPeerNoteService.add).toHaveBeenCalledWith(
        ISSUE_ID,
        expect.objectContaining({ toAgentId: OTHER_AGENT_ID, kind: "handoff" }),
      );
    });

    it("refuses to let humans author peer notes", async () => {
      const res = await request(createApp(boardActor()))
        .post(`/api/issues/${ISSUE_ID}/peer-notes`)
        .send({ kind: "help_request", body: "hi from a human" });
      expect(res.status).toBe(403);
      expect(mockPeerNoteService.add).not.toHaveBeenCalled();
    });

    it("rejects unknown kinds at the validator", async () => {
      const res = await request(createApp(agentActor()))
        .post(`/api/issues/${ISSUE_ID}/peer-notes`)
        .send({ kind: "gossip", body: "not a valid kind" });
      expect(res.status).toBe(400);
      expect(mockPeerNoteService.add).not.toHaveBeenCalled();
    });

    it("404s when the issue is missing, without hitting the service", async () => {
      mockIssueService.getById.mockResolvedValueOnce(null);
      const res = await request(createApp(agentActor()))
        .post(`/api/issues/${ISSUE_ID}/peer-notes`)
        .send({ kind: "context_share", body: "heads up" });
      expect(res.status).toBe(404);
      expect(mockPeerNoteService.add).not.toHaveBeenCalled();
    });
  });

  describe("POST /issues/:id/peer-notes/:noteId/ack", () => {
    it("acknowledges an existing note scoped to the issue", async () => {
      mockPeerNoteService.getById.mockResolvedValueOnce(makeNote());
      mockPeerNoteService.acknowledge.mockResolvedValueOnce(
        makeNote({ acknowledgedAt: new Date("2026-04-21T12:30:00.000Z") }),
      );
      const res = await request(createApp(boardActor())).post(
        `/api/issues/${ISSUE_ID}/peer-notes/${NOTE_ID}/ack`,
      );
      expect(res.status).toBe(200);
      expect(mockPeerNoteService.acknowledge).toHaveBeenCalledWith(NOTE_ID);
    });

    it("404s when the note belongs to a different issue", async () => {
      mockPeerNoteService.getById.mockResolvedValueOnce(
        makeNote({ issueId: "99999999-9999-4999-8999-999999999999" }),
      );
      const res = await request(createApp(boardActor())).post(
        `/api/issues/${ISSUE_ID}/peer-notes/${NOTE_ID}/ack`,
      );
      expect(res.status).toBe(404);
      expect(mockPeerNoteService.acknowledge).not.toHaveBeenCalled();
    });
  });

  describe("POST /issues/:id/peer-notes/:noteId/resolve", () => {
    it("resolves an existing note", async () => {
      mockPeerNoteService.getById.mockResolvedValueOnce(makeNote());
      mockPeerNoteService.resolve.mockResolvedValueOnce(
        makeNote({ resolvedAt: new Date("2026-04-21T13:00:00.000Z") }),
      );
      const res = await request(createApp(boardActor())).post(
        `/api/issues/${ISSUE_ID}/peer-notes/${NOTE_ID}/resolve`,
      );
      expect(res.status).toBe(200);
      expect(mockPeerNoteService.resolve).toHaveBeenCalledWith(NOTE_ID);
    });

    it("404s for an unknown note id", async () => {
      mockPeerNoteService.getById.mockResolvedValueOnce(null);
      const res = await request(createApp(boardActor())).post(
        `/api/issues/${ISSUE_ID}/peer-notes/${NOTE_ID}/resolve`,
      );
      expect(res.status).toBe(404);
      expect(mockPeerNoteService.resolve).not.toHaveBeenCalled();
    });
  });
});
