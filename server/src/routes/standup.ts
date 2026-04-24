/**
 * standup routes — single GET endpoint exposing the standupService.
 *
 * Anyone with access to the company can read this; it contains the same
 * information as the issues list and doesn't need a stronger guard.
 */
import { Router } from "express";
import type { Db } from "@mattparrytfc/db";
import { renderStandupDigestMarkdown } from "@mattparrytfc/shared";
import { standupService } from "../services/standup.js";
import { companyService } from "../services/companies.js";
import { assertCompanyAccess } from "./authz.js";

export function standupRoutes(db: Db) {
  const router = Router();
  const svc = standupService(db);
  const companies = companyService(db);

  function parseWindowHours(raw: unknown): number | undefined {
    const parsed = Number.parseInt(String(raw ?? ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return parsed * 60 * 60 * 1000;
  }

  router.get("/companies/:companyId/standup", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const windowMs = parseWindowHours(req.query.windowHours);
    const snapshot = await svc.dailyForCompany(companyId, { windowMs });
    res.json(snapshot);
  });

  /**
   * Daily digest — the raw payload plus a pre-rendered Markdown body
   * the UI can drop into an email or copy to the clipboard. Same
   * renderer the 08:00 cron job will use, so the two can't drift.
   */
  router.get("/companies/:companyId/standup/digest", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const windowMs = parseWindowHours(req.query.windowHours);
    const [digest, company] = await Promise.all([
      svc.dailyDigest(companyId, { windowMs }),
      companies.getById(companyId),
    ]);
    const markdown = renderStandupDigestMarkdown(digest, {
      companyName: company?.name,
    });
    res.json({ digest, markdown });
  });

  return router;
}
