/**
 * agent-questions routes — HTTP surface for the "agent asks the user a
 * clarifying question and blocks" flow.
 *
 *   POST   /issues/:id/questions            agent asks (agent auth)
 *   GET    /issues/:id/questions/:qid       agent polls for an answer
 *   GET    /companies/:id/questions/open    UI popup polls for pending
 *   POST   /questions/:qid/answer           user answers
 *   POST   /questions/:qid/dismiss          user says "your call"
 *
 * The ask endpoint is agent-only — humans don't create questions for
 * agents through this API. The answer/dismiss endpoints are user-only,
 * since an agent "answering" its own question would defeat the point.
 */
import { Router } from "express";
import type { Db } from "@mattparrytfc/db";
import {
  answerAgentQuestionSchema,
  askAgentQuestionSchema,
} from "@mattparrytfc/shared";
import { validate } from "../middleware/validate.js";
import {
  agentQuestionService,
  issueService,
} from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function agentQuestionRoutes(db: Db) {
  const router = Router();
  const svc = agentQuestionService(db);
  const issuesSvc = issueService(db);

  router.post(
    "/issues/:id/questions",
    validate(askAgentQuestionSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const issue = await issuesSvc.getById(id);
      if (!issue) {
        res.status(404).json({ error: "Issue not found" });
        return;
      }
      assertCompanyAccess(req, issue.companyId);

      const actor = getActorInfo(req);
      if (actor.actorType !== "agent" || !actor.agentId) {
        res.status(403).json({
          error: "Only agents may ask clarification questions",
        });
        return;
      }

      const row = await svc.ask(id, {
        question: req.body.question,
        context: req.body.context ?? null,
        fromAgentId: actor.agentId,
        runId: req.body.runId ?? actor.runId ?? null,
      });
      res.status(201).json(row);
    },
  );

  // Agents poll by id to see whether their question has been answered.
  router.get("/issues/:id/questions/:qid", async (req, res) => {
    const id = req.params.id as string;
    const qid = req.params.qid as string;
    const issue = await issuesSvc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);

    const row = await svc.getById(qid);
    if (!row || row.issueId !== id) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    res.json(row);
  });

  router.get(
    "/companies/:companyId/questions/open",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const rows = await svc.listOpenForCompany(companyId);
      res.json(rows);
    },
  );

  router.post(
    "/questions/:qid/answer",
    validate(answerAgentQuestionSchema),
    async (req, res) => {
      const qid = req.params.qid as string;
      const existing = await svc.getById(qid);
      if (!existing) {
        res.status(404).json({ error: "Question not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);

      const actor = getActorInfo(req);
      if (actor.actorType !== "user") {
        res.status(403).json({
          error: "Only humans may answer an agent's question",
        });
        return;
      }

      const row = await svc.answer(qid, {
        answer: req.body.answer,
        answeredByUserId: actor.actorId,
      });
      if (!row) {
        res.status(409).json({ error: "Question is no longer open" });
        return;
      }
      res.json(row);
    },
  );

  router.post("/questions/:qid/dismiss", async (req, res) => {
    const qid = req.params.qid as string;
    const existing = await svc.getById(qid);
    if (!existing) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const actor = getActorInfo(req);
    if (actor.actorType !== "user") {
      res.status(403).json({
        error: "Only humans may dismiss an agent's question",
      });
      return;
    }

    const row = await svc.dismiss(qid, { dismissedByUserId: actor.actorId });
    if (!row) {
      res.status(409).json({ error: "Question is no longer open" });
      return;
    }
    res.json(row);
  });

  return router;
}
