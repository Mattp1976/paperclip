/**
 * standup routes — single GET endpoint exposing the standupService.
 *
 * Anyone with access to the company can read this; it contains the same
 * information as the issues list and doesn't need a stronger guard.
 */
import { Router } from "express";
import type { Db } from "@mattparrytfc/db";
import { standupService } from "../services/standup.js";
import { assertCompanyAccess } from "./authz.js";

export function standupRoutes(db: Db) {
  const router = Router();
  const svc = standupService(db);

  router.get("/companies/:companyId/standup", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const windowParam = Number.parseInt(
      String(req.query.windowHours ?? ""),
      10,
    );
    const windowMs = Number.isFinite(windowParam) && windowParam > 0
      ? windowParam * 60 * 60 * 1000
      : undefined;

    const snapshot = await svc.dailyForCompany(companyId, { windowMs });
    res.json(snapshot);
  });

  return router;
}
