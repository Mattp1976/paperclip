/**
 * Output routers — post-run delivery of agent output to external destinations.
 *
 * Flow:
 *   1. A heartbeat run reaches a terminal status.
 *   2. The heartbeat service calls `dispatchForRun` (wire-up lives in
 *      heartbeat.ts, after the existing `releaseIssueExecutionAndPromote`
 *      call — search for "dispatchForRun" there once wired).
 *   3. We look up enabled routers matching the run (company, optionally
 *      project, plus any `filter` constraints).
 *   4. For each match we invoke the provider-specific sender.
 *   5. Each successful delivery becomes an `issue_work_products` row so it
 *      shows up in the UI alongside PRs, preview URLs, etc.
 *
 * Providers are dispatched by name. Adding a new one means: extend
 * OUTPUT_ROUTER_PROVIDERS, write a sender module under `./routers/<name>`,
 * register it in `providerRegistry` below.
 *
 * All state is persisted — there's no in-memory router list — so settings
 * survive restarts and the desktop shell can expose them through the
 * normal HTTP API.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@mattparrytfc/db";
import { outputRouters } from "@mattparrytfc/db";
import type {
  OutputRouter,
  OutputRouterCreateRequest,
  OutputRouterDeliveryResult,
  OutputRouterFilter,
  OutputRouterProvider,
  OutputRouterUpdateRequest,
} from "@mattparrytfc/shared";
import { OUTPUT_ROUTER_PROVIDERS } from "@mattparrytfc/shared";
import { sendViaSlackWebhook } from "./routers/slack.js";
import { sendViaGoogleDrive } from "./routers/google-drive.js";
import { sendViaGmail } from "./routers/gmail.js";

type OutputRouterRow = typeof outputRouters.$inferSelect;

function toOutputRouter(row: OutputRouterRow): OutputRouter {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId ?? null,
    name: row.name,
    provider: row.provider as OutputRouterProvider,
    config: (row.config as Record<string, unknown>) ?? {},
    filter: (row.filter as OutputRouterFilter | null) ?? null,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isKnownProvider(v: string): v is OutputRouterProvider {
  return (OUTPUT_ROUTER_PROVIDERS as readonly string[]).includes(v);
}

/**
 * Input shape the heartbeat service hands us when a run finishes.
 * Deliberately minimal — routers don't need to know the whole run record,
 * just enough to address the destination and format a message.
 */
export interface RunDispatchContext {
  companyId: string;
  projectId: string | null;
  issueId: string | null;
  runId: string;
  agentId: string;
  agentName: string;
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  startedAt: Date | null;
  finishedAt: Date | null;
  costUsd: number | null;
  /** Human-readable one-liner derived from resultJson (see heartbeat-run-summary). */
  summary: string | null;
  /** Raw run result for providers that want to attach more than the summary. */
  resultJson: Record<string, unknown> | null;
}

/** Result of dispatching to a single router; returned so callers can log / audit. */
export interface RunDispatchEntry {
  routerId: string;
  provider: OutputRouterProvider;
  result: OutputRouterDeliveryResult;
  workProductId: string | null;
  error?: string;
}

/** Shape the heartbeat service needs to record delivery as a work product. */
export interface WorkProductWriter {
  createForIssue(
    issueId: string,
    companyId: string,
    data: {
      projectId?: string | null;
      type: string;
      provider: string;
      externalId?: string | null;
      title: string;
      url?: string | null;
      status: string;
      summary?: string | null;
      metadata?: Record<string, unknown> | null;
      createdByRunId?: string | null;
    },
  ): Promise<{ id: string } | null>;
}

export interface OutputRouterDeps {
  /**
   * Resolve a companySecrets value to its plaintext string. The sender
   * modules call this to fetch webhook URLs / API tokens at dispatch time
   * (never cached — secrets rotate).
   */
  resolveSecret(companyId: string, secretId: string): Promise<string>;
  /** For writing delivery receipts back to issue_work_products. */
  workProducts: WorkProductWriter;
  /** Optional fetch override for tests. Defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
}

function matchesFilter(filter: OutputRouterFilter | null, ctx: RunDispatchContext): boolean {
  if (!filter) return ctx.status === "succeeded"; // default: success only
  const statuses = filter.statuses ?? ["succeeded"];
  if (!statuses.includes(ctx.status)) return false;
  if (filter.agentIds && filter.agentIds.length > 0) {
    if (!filter.agentIds.includes(ctx.agentId)) return false;
  }
  if (typeof filter.minCostUsd === "number") {
    if ((ctx.costUsd ?? 0) < filter.minCostUsd) return false;
  }
  return true;
}

export function outputRouterService(db: Db, deps: OutputRouterDeps) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;

  async function list(companyId: string) {
    const rows = await db
      .select()
      .from(outputRouters)
      .where(eq(outputRouters.companyId, companyId))
      .orderBy(desc(outputRouters.updatedAt));
    return rows.map(toOutputRouter);
  }

  async function get(companyId: string, id: string) {
    const row = await db
      .select()
      .from(outputRouters)
      .where(and(eq(outputRouters.companyId, companyId), eq(outputRouters.id, id)))
      .then((rows) => rows[0] ?? null);
    return row ? toOutputRouter(row) : null;
  }

  async function create(companyId: string, input: OutputRouterCreateRequest) {
    if (!isKnownProvider(input.provider)) {
      throw new Error(`Unknown output router provider: ${input.provider}`);
    }
    const row = await db
      .insert(outputRouters)
      .values({
        companyId,
        projectId: input.projectId ?? null,
        name: input.name,
        provider: input.provider,
        config: input.config,
        filter: (input.filter ?? null) as Record<string, unknown> | null,
        enabled: input.enabled ?? true,
      })
      .returning()
      .then((rows) => rows[0] ?? null);
    return row ? toOutputRouter(row) : null;
  }

  async function update(companyId: string, id: string, patch: OutputRouterUpdateRequest) {
    const row = await db
      .update(outputRouters)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
        ...(patch.config !== undefined ? { config: patch.config } : {}),
        ...(patch.filter !== undefined
          ? { filter: patch.filter as Record<string, unknown> | null }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(outputRouters.companyId, companyId), eq(outputRouters.id, id)))
      .returning()
      .then((rows) => rows[0] ?? null);
    return row ? toOutputRouter(row) : null;
  }

  async function remove(companyId: string, id: string) {
    const row = await db
      .delete(outputRouters)
      .where(and(eq(outputRouters.companyId, companyId), eq(outputRouters.id, id)))
      .returning()
      .then((rows) => rows[0] ?? null);
    return row ? toOutputRouter(row) : null;
  }

  /**
   * Find routers that should fire for this run, given scope and filter.
   * Company-wide routers (projectId=null) match every run; project-scoped
   * routers only match runs in that project.
   */
  async function findMatches(ctx: RunDispatchContext): Promise<OutputRouter[]> {
    const rows = await db
      .select()
      .from(outputRouters)
      .where(
        and(eq(outputRouters.companyId, ctx.companyId), eq(outputRouters.enabled, true)),
      );
    return rows
      .map(toOutputRouter)
      .filter((r) => r.projectId === null || r.projectId === ctx.projectId)
      .filter((r) => matchesFilter(r.filter, ctx));
  }

  function senderFor(provider: OutputRouterProvider) {
    switch (provider) {
      case "slack_webhook":
        return sendViaSlackWebhook;
      case "google_drive":
        return sendViaGoogleDrive;
      case "gmail":
        return sendViaGmail;
    }
  }

  /**
   * Hook called by heartbeat.ts after a run reaches a terminal state.
   * Never throws — delivery failures are captured in the returned entries
   * so a bad webhook doesn't crash the heartbeat pipeline.
   */
  async function dispatchForRun(ctx: RunDispatchContext): Promise<RunDispatchEntry[]> {
    const matches = await findMatches(ctx);
    const entries: RunDispatchEntry[] = [];

    for (const router of matches) {
      const sender = senderFor(router.provider);
      let result: OutputRouterDeliveryResult;
      let errorMsg: string | undefined;

      try {
        result = await sender({
          router,
          run: ctx,
          resolveSecret: (secretId) => deps.resolveSecret(ctx.companyId, secretId),
          fetch: fetchImpl,
        });
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err);
        result = {
          externalId: null,
          url: null,
          summary: `Delivery failed: ${errorMsg}`,
          status: "failed",
          metadata: { error: errorMsg },
        };
      }

      let workProductId: string | null = null;
      if (ctx.issueId) {
        // Only persist a work product if the run is tied to an issue —
        // detached runs (e.g. ad-hoc standups) still fire routers but
        // don't have an issue to attach receipts to.
        const wp = await deps.workProducts
          .createForIssue(ctx.issueId, ctx.companyId, {
            projectId: ctx.projectId,
            type: "artifact",
            provider: router.provider,
            externalId: result.externalId,
            title: router.name,
            url: result.url,
            status: result.status,
            summary: result.summary,
            metadata: {
              ...(result.metadata ?? {}),
              routerId: router.id,
              runId: ctx.runId,
            },
            createdByRunId: ctx.runId,
          })
          .catch(() => null);
        workProductId = wp?.id ?? null;
      }

      entries.push({
        routerId: router.id,
        provider: router.provider,
        result,
        workProductId,
        error: errorMsg,
      });
    }

    return entries;
  }

  return {
    list,
    get,
    create,
    update,
    remove,
    findMatches,
    dispatchForRun,
  };
}

export type OutputRouterService = ReturnType<typeof outputRouterService>;
