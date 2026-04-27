/**
 * Orchestra routes — outcome lifecycle API.
 *
 *   POST   /companies/:companyId/orchestra/outcomes              create
 *   GET    /companies/:companyId/orchestra/outcomes              list
 *   GET    /orchestra/outcomes/:id                               read
 *   POST   /orchestra/outcomes/:id/cancel                        cancel
 *   POST   /orchestra/outcomes/:id/plan                          (Phase 2.5) generate plan via planner
 *   POST   /orchestra/outcomes/:id/approve-plan                  approve + start execution
 *   POST   /orchestra/outcomes/:id/assemble                      (Phase 6) trigger assembler — stub
 *   GET    /orchestra/outcomes/:id/events                        timeline
 *
 * Auth: company-scoped. Outcomes can be created by either humans or
 * agents (a manager agent can spawn an outcome for their team), but the
 * `createdByUserId` is set only for human callers.
 *
 * Status: Phase 3 — CRUD + cancel + approve-plan are implemented.
 * `plan` and `assemble` return 501 Not Implemented until the planner +
 * assembler services land.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@mattparrytfc/db";
import { outcomes } from "@mattparrytfc/db";
import {
  createOutcomeSchema,
  approvePlanSchema,
} from "@mattparrytfc/shared";
import { validate } from "../middleware/validate.js";
import { orchestraService } from "../services/orchestra.js";
import { assertCompanyAccess } from "./authz.js";

export function orchestraRoutes(db: Db) {
  const router = Router();
  const svc = orchestraService(db);

  // ─── List + create on company scope ────────────────────────────────

  router.get("/companies/:companyId/orchestra/outcomes", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const items = await svc.list(companyId);
    res.json(items);
  });

  router.post(
    "/companies/:companyId/orchestra/outcomes",
    validate(createOutcomeSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const createdByUserId = req.actor.userId ?? null;
      const outcome = await svc.create(companyId, req.body, createdByUserId);
      res.status(201).json(outcome);
    },
  );

  // ─── Read / actions on a single outcome ────────────────────────────

  router.get("/orchestra/outcomes/:id", async (req, res) => {
    const id = req.params.id as string;
    const companyId = await resolveCompanyForOutcome(db, id);
    if (!companyId) {
      res.status(404).json({ error: "Outcome not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const detail = await svc.getDetail(companyId, id);
    res.json(detail);
  });

  router.post("/orchestra/outcomes/:id/cancel", async (req, res) => {
    const id = req.params.id as string;
    const companyId = await resolveCompanyForOutcome(db, id);
    if (!companyId) {
      res.status(404).json({ error: "Outcome not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason : undefined;
    const outcome = await svc.cancel(companyId, id, reason);
    res.json(outcome);
  });

  router.post(
    "/orchestra/outcomes/:id/approve-plan",
    validate(approvePlanSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const companyId = await resolveCompanyForOutcome(db, id);
      if (!companyId) {
        res.status(404).json({ error: "Outcome not found" });
        return;
      }
      assertCompanyAccess(req, companyId);
      const result = await svc.approvePlan({
        companyId,
        outcomeId: id,
        planId: req.body.planId,
      });
      res.json(result);
    },
  );

  router.get("/orchestra/outcomes/:id/events", async (req, res) => {
    const id = req.params.id as string;
    const companyId = await resolveCompanyForOutcome(db, id);
    if (!companyId) {
      res.status(404).json({ error: "Outcome not found" });
      return;
    }
    assertCompanyAccess(req, companyId);
    const events = await svc.listEvents(companyId, id);
    res.json(events);
  });

  // ─── Phase 2.5 / Phase 6 — pending implementation ──────────────────

  router.post("/orchestra/outcomes/:id/plan", async (req, res) => {
    res.status(501).json({
      error:
        "Planner not yet wired. Coming in next iteration: orchestra-planner service.",
      hint: "For now, persist a plan directly via the orchestra service from a script or test, then call /approve-plan.",
    });
  });

  router.post("/orchestra/outcomes/:id/assemble", async (req, res) => {
    res.status(501).json({
      error:
        "Assembler not yet wired. Coming in next iteration: orchestra-assembler service.",
    });
  });

  return router;
}

async function resolveCompanyForOutcome(
  db: Db,
  outcomeId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ companyId: outcomes.companyId })
    .from(outcomes)
    .where(eq(outcomes.id, outcomeId));
  return row?.companyId ?? null;
}
