/**
 * Run Recovery Service — Phase 2: eliminate ghost runs
 *
 * Ghost runs occur when the server crashes or restarts while job runs are
 * in `queued` or `running` status. Without recovery, these runs:
 *
 * - Permanently block their parent job via overlap prevention
 * - Show as "running" in the dashboard forever
 * - Never produce a result or error
 *
 * ## How it works
 *
 * 1. **Startup recovery** — On server boot, `recoverStaleRuns()` scans the
 *    `plugin_job_runs` table for runs in `queued` or `running` status and
 *    marks them as `failed` with a recovery error message. This clears the
 *    overlap lock so the scheduler can dispatch fresh runs.
 *
 * 2. **Heartbeat sweeper** — A periodic sweep (default every 60s) checks
 *    for `running` runs whose `lastHeartbeatAt` is older than the TTL
 *    (default 5 minutes). These are presumed crashed and marked `failed`.
 *    The scheduler calls `touchHeartbeat(runId)` during execution to keep
 *    runs alive.
 *
 * 3. **Run state audit** — `auditRunStates()` returns a diagnostic snapshot
 *    of all non-terminal runs, useful for the health endpoint.
 *
 * @see PLUGIN_SPEC.md §17 — Scheduled Jobs
 * @see ./plugin-job-scheduler.ts — Scheduler (calls heartbeat during dispatch)
 * @see ./plugin-job-store.ts — Persistence layer
 */

import { and, eq, lt, or, isNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { pluginJobRuns, pluginJobs } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default interval between heartbeat sweeps (60 seconds). */
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/** Default heartbeat TTL — runs without a heartbeat for this long are stale (5 minutes). */
const DEFAULT_HEARTBEAT_TTL_MS = 5 * 60 * 1_000;

/** Error message applied to runs recovered at startup. */
const STARTUP_RECOVERY_ERROR = "Server restarted during execution — run terminated by recovery sweep";

/** Error message applied to runs that exceeded heartbeat TTL. */
const HEARTBEAT_TIMEOUT_ERROR = "Run exceeded heartbeat TTL — presumed crashed";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunRecoveryOptions {
  /** Drizzle database instance. */
  db: Db;
  /** Interval between heartbeat sweeps in ms (default: 60s). */
  sweepIntervalMs?: number;
  /** Heartbeat TTL in ms (default: 5min). Runs without a heartbeat for this
   *  long are presumed crashed. */
  heartbeatTtlMs?: number;
}

export interface RecoveryResult {
  /** Number of runs recovered (marked failed). */
  recoveredCount: number;
  /** IDs of recovered runs. */
  recoveredRunIds: string[];
}

export interface RunAuditEntry {
  runId: string;
  jobId: string;
  pluginId: string;
  status: string;
  trigger: string;
  startedAt: Date | null;
  lastHeartbeatAt: Date | null;
  ageMs: number;
}

export interface RunRecoveryService {
  /**
   * Recover stale runs at server startup.
   * Should be called once, before the scheduler starts ticking.
   */
  recoverStaleRuns(): Promise<RecoveryResult>;

  /**
   * Start the periodic heartbeat sweeper.
   * Runs in the background, checking for runs that have exceeded the
   * heartbeat TTL and marking them as failed.
   */
  startHeartbeatSweeper(): void;

  /**
   * Stop the heartbeat sweeper.
   */
  stopHeartbeatSweeper(): void;

  /**
   * Touch the heartbeat for an active run.
   * The scheduler should call this periodically during job execution.
   */
  touchHeartbeat(runId: string): Promise<void>;

  /**
   * Audit all non-terminal runs (queued, running).
   * Useful for health/diagnostics endpoints.
   */
  auditRunStates(): Promise<RunAuditEntry[]>;
}
// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createRunRecoveryService(
  options: RunRecoveryOptions,
): RunRecoveryService {
  const {
    db,
    sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS,
    heartbeatTtlMs = DEFAULT_HEARTBEAT_TTL_MS,
  } = options;

  const log = logger.child({ service: "run-recovery" });
  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  // -----------------------------------------------------------------------
  // Startup recovery
  // -----------------------------------------------------------------------

  async function recoverStaleRuns(): Promise<RecoveryResult> {
    const now = new Date();

    // Find all runs in non-terminal states (queued or running)
    const staleRuns = await db
      .select({ id: pluginJobRuns.id, jobId: pluginJobRuns.jobId, status: pluginJobRuns.status })
      .from(pluginJobRuns)
      .where(
        or(
          eq(pluginJobRuns.status, "queued"),
          eq(pluginJobRuns.status, "running"),
        ),
      );

    if (staleRuns.length === 0) {
      log.info("startup recovery: no stale runs found");
      return { recoveredCount: 0, recoveredRunIds: [] };
    }

    log.warn(
      { count: staleRuns.length },
      "startup recovery: found stale runs from previous server instance",
    );

    const recoveredRunIds: string[] = [];

    for (const run of staleRuns) {
      try {
        await db
          .update(pluginJobRuns)
          .set({
            status: "failed" as any,
            error: STARTUP_RECOVERY_ERROR,
            finishedAt: now,
          })
          .where(
            and(
              eq(pluginJobRuns.id, run.id),
              or(
                eq(pluginJobRuns.status, "queued"),
                eq(pluginJobRuns.status, "running"),
              ),
            ),
          );

        recoveredRunIds.push(run.id);

        log.info(
          { runId: run.id, jobId: run.jobId, previousStatus: run.status },
          "startup recovery: marked stale run as failed",
        );
      } catch (err) {
        log.error(
          { runId: run.id, err: err instanceof Error ? err.message : String(err) },
          "startup recovery: failed to recover run",
        );
      }
    }

    log.info(
      { recoveredCount: recoveredRunIds.length, total: staleRuns.length },
      "startup recovery complete",
    );

    return {
      recoveredCount: recoveredRunIds.length,
      recoveredRunIds,
    };
  }
  // -----------------------------------------------------------------------
  // Heartbeat sweeper
  // -----------------------------------------------------------------------

  async function sweepStaleHeartbeats(): Promise<void> {
    const cutoff = new Date(Date.now() - heartbeatTtlMs);

    try {
      const staleRuns = await db
        .select({ id: pluginJobRuns.id, jobId: pluginJobRuns.jobId })
        .from(pluginJobRuns)
        .where(
          and(
            eq(pluginJobRuns.status, "running"),
            or(
              lt(pluginJobRuns.lastHeartbeatAt, cutoff),
              and(
                isNull(pluginJobRuns.lastHeartbeatAt),
                lt(pluginJobRuns.startedAt, cutoff),
              ),
            ),
          ),
        );

      if (staleRuns.length === 0) return;

      log.warn(
        { count: staleRuns.length, cutoff: cutoff.toISOString() },
        "heartbeat sweep: found runs exceeding TTL",
      );

      for (const run of staleRuns) {
        await db
          .update(pluginJobRuns)
          .set({
            status: "failed" as any,
            error: HEARTBEAT_TIMEOUT_ERROR,
            finishedAt: new Date(),
          })
          .where(
            and(
              eq(pluginJobRuns.id, run.id),
              eq(pluginJobRuns.status, "running"),
            ),
          );

        log.info(
          { runId: run.id, jobId: run.jobId },
          "heartbeat sweep: marked stale run as failed",
        );
      }
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "heartbeat sweep error",
      );
    }
  }

  function startHeartbeatSweeper(): void {
    if (sweepTimer) return;
    sweepTimer = setInterval(() => {
      void sweepStaleHeartbeats();
    }, sweepIntervalMs);
    log.info(
      { sweepIntervalMs, heartbeatTtlMs },
      "heartbeat sweeper started",
    );
  }

  function stopHeartbeatSweeper(): void {
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
    log.info("heartbeat sweeper stopped");
  }

  // -----------------------------------------------------------------------
  // Heartbeat touch
  // -----------------------------------------------------------------------

  async function touchHeartbeat(runId: string): Promise<void> {
    await db
      .update(pluginJobRuns)
      .set({ lastHeartbeatAt: new Date() })
      .where(eq(pluginJobRuns.id, runId));
  }

  // -----------------------------------------------------------------------
  // Audit
  // -----------------------------------------------------------------------

  async function auditRunStates(): Promise<RunAuditEntry[]> {
    const now = Date.now();

    const activeRuns = await db
      .select()
      .from(pluginJobRuns)
      .where(
        or(
          eq(pluginJobRuns.status, "queued"),
          eq(pluginJobRuns.status, "running"),
        ),
      );

    return activeRuns.map((run) => ({
      runId: run.id,
      jobId: run.jobId,
      pluginId: run.pluginId,
      status: run.status,
      trigger: run.trigger,
      startedAt: run.startedAt,
      lastHeartbeatAt: run.lastHeartbeatAt ?? null,
      ageMs: now - (run.createdAt?.getTime() ?? now),
    }));
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    recoverStaleRuns,
    startHeartbeatSweeper,
    stopHeartbeatSweeper,
    touchHeartbeat,
    auditRunStates,
  };
}
