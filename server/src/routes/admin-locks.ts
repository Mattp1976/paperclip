/**
 * Admin Lock Management Routes — Phase 3: Checkout Lock Hardening
 *
 * Provides admin API endpoints for managing checkout locks on issues:
 *
 * - GET  /admin/locks/audit     — List all orphaned checkout locks
 * - POST /admin/locks/sweep     — Trigger an immediate lock sweep
 * - POST /admin/locks/:issueId/force-release — Force-release a specific lock
 * - GET  /admin/locks/status    — Sweeper status (running, last sweep time)
 * - POST /admin/locks/sweeper/start  — Start the background sweeper
 * - POST /admin/locks/sweeper/stop   — Stop the background sweeper
 *
 * The route factory also creates and manages the CheckoutLockRecoveryService,
 * starting the background sweeper automatically when the routes are mounted.
 *
 * @see ../services/checkout-lock-recovery.ts — Core recovery service
 * @see ../services/issues.ts — Checkout/release mechanism
 */

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns } from "@paperclipai/db";
import { eq, inArray } from "drizzle-orm";
import { createCheckoutLockRecoveryService } from "../services/checkout-lock-recovery.js";
import type { CheckoutLockRecoveryService } from "../services/checkout-lock-recovery.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminLockRoutesOptions {
  /** Drizzle database instance. */
  db: Db;
  /** Lock TTL in ms. Issues locked longer than this are considered orphaned. */
  lockTtlMs?: number;
  /** Background sweep interval in ms. */
  sweepIntervalMs?: number;
  /** Whether to auto-start the sweeper when routes are mounted. */
  autoStartSweeper?: boolean;
}

// ---------------------------------------------------------------------------
// Terminal run checker
// ---------------------------------------------------------------------------

/**
 * Check if a heartbeat run is terminal or missing.
 * This is injected into the CheckoutLockRecoveryService to avoid
 * circular imports with the issues service.
 */
function createIsRunTerminalOrMissing(db: Db) {
  const TERMINAL_STATUSES = ["completed", "failed", "cancelled", "timed_out"];

  return async function isRunTerminalOrMissing(runId: string): Promise<boolean> {
    const rows = await db
      .select({ id: heartbeatRuns.id, status: heartbeatRuns.status })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId));

    // Run doesn't exist → treat as terminal (orphaned reference)
    if (rows.length === 0) return true;

    // Run exists but is in a terminal state
    return TERMINAL_STATUSES.includes(rows[0].status);
  };
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function adminLockRoutes(options: AdminLockRoutesOptions) {
  const {
    db,
    lockTtlMs,
    sweepIntervalMs,
    autoStartSweeper = true,
  } = options;

  const log = logger.child({ route: "admin-locks" });
  const router = Router();

  // Create the recovery service
  const recoveryService = createCheckoutLockRecoveryService({
    db,
    lockTtlMs,
    sweepIntervalMs,
    isRunTerminalOrMissing: createIsRunTerminalOrMissing(db),
  });

  // Auto-start the sweeper if configured
  if (autoStartSweeper) {
    recoveryService.startSweeper();
    log.info("checkout lock sweeper auto-started with route mount");
  }

  // -------------------------------------------------------------------------
  // GET /admin/locks/audit — List all orphaned checkout locks
  // -------------------------------------------------------------------------
  router.get("/audit", async (_req, res) => {
    try {
      const entries = await recoveryService.auditOrphanedLocks();
      res.json({
        ok: true,
        orphanedLocks: entries,
        count: entries.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      log.error({ err }, "failed to audit orphaned locks");
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /admin/locks/sweep — Trigger an immediate lock sweep
  // -------------------------------------------------------------------------
  router.post("/sweep", async (_req, res) => {
    try {
      const result = await recoveryService.sweep();
      log.info({ releasedCount: result.releasedCount }, "manual lock sweep completed");
      res.json({
        ok: true,
        ...result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      log.error({ err }, "manual lock sweep failed");
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /admin/locks/:issueId/force-release — Force-release a specific lock
  // -------------------------------------------------------------------------
  router.post("/:issueId/force-release", async (req, res) => {
    const { issueId } = req.params;
    const reason = typeof req.body?.reason === "string"
      ? req.body.reason
      : "Admin force-release via API";

    try {
      const released = await recoveryService.forceRelease(issueId, reason);

      if (released) {
        log.info({ issueId, reason }, "force-released checkout lock");
        res.json({
          ok: true,
          released: true,
          issueId,
          reason,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.json({
          ok: true,
          released: false,
          issueId,
          message: "Issue was not locked or lock was already released",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      log.error({ err, issueId }, "force-release failed");
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /admin/locks/status — Sweeper status
  // -------------------------------------------------------------------------
  router.get("/status", (_req, res) => {
    res.json({
      ok: true,
      sweeper: {
        configured: true,
        lockTtlMs: lockTtlMs ?? 30 * 60 * 1000,
        sweepIntervalMs: sweepIntervalMs ?? 2 * 60 * 1000,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // POST /admin/locks/sweeper/start — Start the background sweeper
  // -------------------------------------------------------------------------
  router.post("/sweeper/start", (_req, res) => {
    try {
      recoveryService.startSweeper();
      log.info("checkout lock sweeper started via admin API");
      res.json({
        ok: true,
        message: "Sweeper started",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      log.error({ err }, "failed to start sweeper");
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /admin/locks/sweeper/stop — Stop the background sweeper
  // -------------------------------------------------------------------------
  router.post("/sweeper/stop", (_req, res) => {
    try {
      recoveryService.stopSweeper();
      log.info("checkout lock sweeper stopped via admin API");
      res.json({
        ok: true,
        message: "Sweeper stopped",
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      log.error({ err }, "failed to stop sweeper");
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return {
    router,
    /** Expose the service for programmatic access (e.g., from health checks). */
    recoveryService,
    /** Graceful shutdown — call this when the server is stopping. */
    shutdown() {
      recoveryService.stopSweeper();
      log.info("admin lock routes shut down");
    },
  };
}
