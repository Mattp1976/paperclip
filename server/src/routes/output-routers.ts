/**
 * output-routers routes — CRUD surface for per-company post-run delivery routes.
 *
 *   GET    /companies/:companyId/output-routers    list
 *   POST   /companies/:companyId/output-routers    create
 *   GET    /output-routers/:id                     read one
 *   PATCH  /output-routers/:id                     update
 *   DELETE /output-routers/:id                     remove
 *
 * Routers themselves are just config rows — actual delivery happens in
 * `server/src/services/output-routers.ts` when heartbeat finishes a run.
 * We deliberately do NOT validate provider-specific `config` shape at the
 * HTTP layer: the service/sender modules will surface a readable error if
 * the config is missing a secret id or recipients, and doing it twice adds
 * drift risk. Envelope fields (name, provider, enabled, filter) are
 * schema-validated below.
 *
 * Auth: company-scoped. Agents can read but not mutate — adding new
 * routers is a human-only action (avoids an agent silently fan-out'ing
 * messages to a Slack channel nobody configured).
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@orqestra/db";
import { outputRouters } from "@orqestra/db";
import {
  createOutputRouterSchema,
  updateOutputRouterSchema,
} from "@orqestra/shared";
import { validate } from "../middleware/validate.js";
import { forbidden } from "../errors.js";
import {
  outputRouterService,
  secretService,
  workProductService,
} from "../services/index.js";
import { assertCompanyAccess } from "./authz.js";

export function outputRouterRoutes(db: Db) {
  const router = Router();
  const secretsSvc = secretService(db);
  const workProducts = workProductService(db);
  const svc = outputRouterService(db, {
    resolveSecret: (companyId, secretId) =>
      secretsSvc.resolveSecretValue(companyId, secretId, "latest"),
    workProducts,
  });

  router.get("/companies/:companyId/output-routers", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await svc.list(companyId);
    res.json(rows);
  });

  router.post(
    "/companies/:companyId/output-routers",
    validate(createOutputRouterSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      if (req.actor.type === "agent") {
        throw forbidden("Agents cannot create output routers");
      }

      const row = await svc.create(companyId, {
        name: req.body.name,
        provider: req.body.provider,
        projectId: req.body.projectId ?? null,
        config: req.body.config,
        filter: req.body.filter ?? null,
        enabled: req.body.enabled,
      });
      if (!row) {
        res.status(500).json({ error: "Failed to create output router" });
        return;
      }
      res.status(201).json(row);
    },
  );

  router.get("/output-routers/:id", async (req, res) => {
    const id = req.params.id as string;
    // We don't know the company until we read the row, so fetch without
    // scoping first, then assert. Attackers can't enumerate because the
    // 404 and 403 branches look identical from the outside (both return
    // no row) and the id space is uuid.
    const existing = await findAcrossCompanies(db, id);
    if (!existing) {
      res.status(404).json({ error: "Output router not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    res.json(existing);
  });

  router.patch(
    "/output-routers/:id",
    validate(updateOutputRouterSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const existing = await findAcrossCompanies(db, id);
      if (!existing) {
        res.status(404).json({ error: "Output router not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);
      if (req.actor.type === "agent") {
        throw forbidden("Agents cannot modify output routers");
      }

      const row = await svc.update(existing.companyId, id, req.body);
      if (!row) {
        res.status(404).json({ error: "Output router not found" });
        return;
      }
      res.json(row);
    },
  );

  router.delete("/output-routers/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await findAcrossCompanies(db, id);
    if (!existing) {
      res.status(404).json({ error: "Output router not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);
    if (req.actor.type === "agent") {
      throw forbidden("Agents cannot delete output routers");
    }

    const row = await svc.remove(existing.companyId, id);
    if (!row) {
      res.status(404).json({ error: "Output router not found" });
      return;
    }
    res.status(204).end();
  });

  return router;
}

/**
 * Helper for the id-only routes. We need to read the row before we know
 * which company owns it (so we can authorize). The company-scoped service
 * methods require the caller to already know companyId; doing the
 * ownership check here keeps the service layer narrow.
 */
async function findAcrossCompanies(db: Db, id: string) {
  const rows = await db
    .select()
    .from(outputRouters)
    .where(eq(outputRouters.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId ?? null,
    name: row.name,
    provider: row.provider,
    config: row.config ?? {},
    filter: row.filter ?? null,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
