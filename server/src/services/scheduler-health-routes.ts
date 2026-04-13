/**
 * Scheduler Health Routes — Phase 4: health visibility
 *
 * Exposes the scheduler's diagnostic state via HTTP endpoints so that:
 * - Railway's health checks can verify the scheduler is ticking
 * - The dashboard can display scheduler status
 * - On-call engineers can inspect the scheduler state via curl
 *
 * ## Endpoints
 *
 * GET /api/health/scheduler
 *   Returns scheduler diagnostics including running state, active jobs,
 *   tick count, uptime, missed-fire counts, and last error.
 *
 *   Response 200:
 *   {
 *     "status": "healthy" | "degraded" | "stopped",
 *     "scheduler": { ...SchedulerDiagnostics },
 *     "recovery": { ...RunAuditEntry[] } | null,
 *     "timestamp": "2026-04-13T..."
 *   }
 *
 *   - "healthy": scheduler running, no recent errors
 *   - "degraded": scheduler running but has recent failures
 *   - "stopped": scheduler not running
 *
 * GET /api/health/scheduler/runs
 *   Returns all non-terminal runs (queued, running) — useful for
 *   diagnosing stuck jobs. Requires the run recovery service.
 *
 * @see ./plugin-job-scheduler.ts — Scheduler
 * @see ./run-recovery.ts — Run recovery service
 */

import { Router } from "express";
import type { PluginJobScheduler } from "./plugin-job-scheduler.js";
import type { RunRecoveryService } from "./run-recovery.js";

export interface SchedulerHealthRoutesOptions {
  scheduler: PluginJobScheduler;
  runRecovery?: RunRecoveryService;
}

/**
 * How many minutes of "no ticks" constitutes a degraded state.
 * If the scheduler has been started but hasn't ticked in this window,
 * the health check returns "degraded".
 */
const TICK_STALENESS_MS = 5 * 60 * 1_000; // 5 minutes

export function createSchedulerHealthRoutes(
  options: SchedulerHealthRoutesOptions,
): Router {
  const { scheduler, runRecovery } = options;
  const router = Router();

  // GET /api/health/scheduler
  router.get("/", async (_req, res) => {
    try {
      const diag = scheduler.diagnostics();
      const now = Date.now();

      // Determine health status
      let status: "healthy" | "degraded" | "stopped" = "healthy";

      if (!diag.running) {
        status = "stopped";
      } else if (diag.totalFailureCount > 0 && diag.lastErrorAt) {
        // If the last error was within the last 5 minutes, mark degraded
        const lastErrorAge = now - new Date(diag.lastErrorAt).getTime();
        if (lastErrorAge < TICK_STALENESS_MS) {
          status = "degraded";
        }
      }

      // Check tick staleness — if running but no tick for 5+ minutes
      if (diag.running && diag.lastTickAt) {
        const lastTickAge = now - new Date(diag.lastTickAt).getTime();
        if (lastTickAge > TICK_STALENESS_MS) {
          status = "degraded";
        }
      }

      // Optionally include active run audit from recovery service
      let activeRuns = null;
      if (runRecovery) {
        try {
          activeRuns = await runRecovery.auditRunStates();
        } catch {
          // Non-critical — don't fail the health check
        }
      }

      const httpStatus = status === "stopped" ? 503 : 200;

      res.status(httpStatus).json({
        status,
        scheduler: diag,
        activeRuns: activeRuns
          ? {
              count: activeRuns.length,
              runs: activeRuns.slice(0, 50), // Cap at 50 for response size
            }
          : null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  });

  // GET /api/health/scheduler/runs — detailed active run audit
  router.get("/runs", async (_req, res) => {
    if (!runRecovery) {
      return res.status(501).json({
        error: "Run recovery service not available",
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const activeRuns = await runRecovery.auditRunStates();

      res.json({
        count: activeRuns.length,
        runs: activeRuns,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
