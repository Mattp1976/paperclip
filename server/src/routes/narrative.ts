/**
 * Narrative routes — plain-English summaries of system state.
 *
 *   GET /companies/:companyId/narrative
 *   GET /orchestra/outcomes/:id/narrative
 *
 * The work happens in services/narrator.ts. This route file is thin.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@orqestra/db";
import { outcomes } from "@orqestra/db";
import { narratorService } from "../services/narrator.js";
import { assertCompanyAccess } from "./authz.js";

export function narrativeRoutes(db: Db) {
  const router = Router();
  const narrator = narratorService(db);

  router.get("/companies/:companyId/narrative", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await narrator.forCompany(companyId);
    res.json(result);
  });

  router.get("/orchestra/outcomes/:id/narrative", async (req, res) => {
    const id = req.params.id as string;
    const [row] = await db
      .select({ companyId: outcomes.companyId })
      .from(outcomes)
      .where(eq(outcomes.id, id));
    if (!row) {
      res.status(404).json({ error: "Outcome not found" });
      return;
    }
    assertCompanyAccess(req, row.companyId);
    const result = await narrator.forOutcome(id);
    if (!result) {
      res.status(404).json({ error: "Outcome not found" });
      return;
    }
    res.json(result);
  });

  return router;
}
