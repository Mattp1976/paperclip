/**
 * Fleet templates — install a pre-wired team into an existing company.
 *
 * Endpoints:
 *   GET  /fleet-templates                                      — list catalog
 *   GET  /fleet-templates/:templateId                          — one template
 *   POST /companies/:companyId/fleet-templates/:templateId/install
 *
 * Install flow:
 *   1. Create agents in reporting-order (CEOs first), building a slug→id map.
 *   2. Create projects, building a name→id map.
 *   3. Create starter tasks assigned to agents (via slug) and the first project.
 *
 * v0.1 notes:
 *   - Routines are ignored here — their trigger setup is a separate concern
 *     we'll layer on once the base install pattern is proven.
 *   - Agents inherit the caller's adapterType (defaulting to `claude_code`)
 *     and start at budget 0 unless the template overrides it.
 */
import { Router } from "express";
import type { Db } from "@orqestra/db";
import { FLEET_TEMPLATES, getFleetTemplate, type FleetTemplate } from "@orqestra/shared";
import { agentService, projectService, issueService } from "../services/index.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

interface InstallSummary {
  templateId: string;
  companyId: string;
  agents: { slug: string; id: string; name: string }[];
  projects: { name: string; id: string }[];
  starterTasks: { title: string; id: string; assigneeAgentId: string | null }[];
  skipped: { routines: number };
}

function publicTemplate(template: FleetTemplate) {
  return {
    id: template.id,
    name: template.name,
    tagline: template.tagline,
    description: template.description,
    icon: template.icon,
    color: template.color,
    bgColor: template.bgColor,
    bestFor: template.bestFor,
    agentCount: template.agents.length,
    projectCount: template.projects.length,
    routineCount: template.routines.length,
    starterTaskCount: template.starterTasks.length,
    agents: template.agents.map((a) => ({
      slug: a.slug,
      name: a.name,
      role: a.role,
      title: a.title,
      reportsToSlug: a.reportsToSlug ?? null,
      capabilities: a.capabilities,
    })),
    projects: template.projects.map((p) => ({ name: p.name, description: p.description })),
    routines: template.routines.map((r) => ({
      title: r.title,
      description: r.description ?? null,
      assigneeSlug: r.assigneeSlug,
      cadence: r.cadence,
    })),
    starterTasks: template.starterTasks.map((t) => ({
      title: t.title,
      description: t.description,
      priority: t.priority,
      assigneeSlug: t.assigneeSlug,
    })),
  };
}

export function fleetTemplateRoutes(db: Db) {
  const router = Router();
  const agents = agentService(db);
  const projects = projectService(db);
  const issues = issueService(db);

  router.get("/fleet-templates", (_req, res) => {
    res.json(FLEET_TEMPLATES.map(publicTemplate));
  });

  router.get("/fleet-templates/:templateId", (req, res) => {
    const template = getFleetTemplate(req.params.templateId as string);
    if (!template) {
      res.status(404).json({ error: "Fleet template not found" });
      return;
    }
    res.json(publicTemplate(template));
  });

  router.post("/companies/:companyId/fleet-templates/:templateId/install", async (req, res) => {
    const companyId = req.params.companyId as string;
    const templateId = req.params.templateId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);

    const template = getFleetTemplate(templateId);
    if (!template) {
      res.status(404).json({ error: "Fleet template not found" });
      return;
    }

    // ── Step 1: create agents in topological (reporting) order ──────────
    const slugToAgentId = new Map<string, string>();
    const createdAgents: InstallSummary["agents"] = [];
    const remaining = [...template.agents];

    // Loop until every agent is placed or we can't make progress.
    while (remaining.length > 0) {
      const readyIdx = remaining.findIndex(
        (a) => !a.reportsToSlug || slugToAgentId.has(a.reportsToSlug),
      );
      if (readyIdx === -1) {
        res.status(422).json({
          error: "Fleet template has an unresolved reportsTo chain",
          unresolved: remaining.map((a) => ({ slug: a.slug, reportsToSlug: a.reportsToSlug })),
        });
        return;
      }
      const spec = remaining.splice(readyIdx, 1)[0]!;
      const reportsTo = spec.reportsToSlug ? slugToAgentId.get(spec.reportsToSlug) ?? null : null;

      const created = await agents.create(companyId, {
        name: spec.name,
        role: spec.role,
        title: spec.title,
        capabilities: spec.capabilities,
        adapterType: spec.adapterType,
        reportsTo,
        budgetMonthlyCents: spec.budgetMonthlyCents ?? 0,
        status: "idle",
        // Stash the fleet origin so we can trace which agents came from which
        // template install later.
        metadata: {
          fleetTemplateId: template.id,
          fleetTemplateSlug: spec.slug,
        },
      });

      slugToAgentId.set(spec.slug, created.id);
      createdAgents.push({ slug: spec.slug, id: created.id, name: created.name });
    }

    // ── Step 2: create projects ────────────────────────────────────────
    const createdProjects: InstallSummary["projects"] = [];
    for (const p of template.projects) {
      const created = await projects.create(companyId, {
        name: p.name,
        description: p.description,
      });
      createdProjects.push({ name: created.name, id: created.id });
    }
    const firstProjectId = createdProjects[0]?.id ?? null;

    // ── Step 3: starter tasks ──────────────────────────────────────────
    const createdTasks: InstallSummary["starterTasks"] = [];
    for (const t of template.starterTasks) {
      const assigneeAgentId = slugToAgentId.get(t.assigneeSlug) ?? null;
      if (!assigneeAgentId) {
        // Bad template wiring — but we've already written agents/projects;
        // log and skip rather than abort.
        continue;
      }
      const issue = await issues.create(companyId, {
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: "backlog",
        projectId: firstProjectId,
        assigneeAgentId,
        originKind: "manual",
      });
      createdTasks.push({
        title: issue.title,
        id: issue.id,
        assigneeAgentId,
      });
    }

    const summary: InstallSummary = {
      templateId: template.id,
      companyId,
      agents: createdAgents,
      projects: createdProjects,
      starterTasks: createdTasks,
      skipped: { routines: template.routines.length },
    };
    res.status(201).json(summary);
  });

  return router;
}
