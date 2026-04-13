/**
 * PluginJobScheduler — tick-based scheduler for plugin scheduled jobs.
 *
 * Phase 4 Hardening Changes:
 * 1. Tick jitter — setTimeout self-reschedule with ±15% random jitter
 *    (prevents thundering herd in multi-instance deployments)
 * 2. Missed-fire catch-up — detects jobs overdue by >2x tick interval,
 *    fires ONE catch-up run and fast-forwards the schedule pointer
 * 3. Extended diagnostics — uptimeMs, missedFireCount, dispatch/failure
 *    totals, lastError tracking for the health endpoint
 *
 * @see PLUGIN_SPEC.md §17 — Scheduled Jobs
 * @see ./plugin-job-store.ts — Persistence layer
 * @see ./cron.ts — Cron parsing utilities
 * @see ./run-recovery.ts — Ghost run recovery (Phase 2)
 */

import { and, eq, lte, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { pluginJobs, pluginJobRuns } from "@paperclipai/db";
import type { PluginJobStore } from "./plugin-job-store.js";
import type { PluginWorkerManager } from "./plugin-worker-manager.js";
import type { RunRecoveryService } from "./run-recovery.js";
import { parseCron, nextCronTick, validateCron } from "./cron.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default interval between scheduler ticks (30 seconds). */
const DEFAULT_TICK_INTERVAL_MS = 30_000;

/** Default timeout for a runJob RPC call (5 minutes). */
const DEFAULT_JOB_TIMEOUT_MS = 5 * 60 * 1_000;

/** Maximum number of concurrent job executions across all plugins. */
const DEFAULT_MAX_CONCURRENT_JOBS = 10;

/** Interval for heartbeat touches during job execution (30 seconds). */
const HEARTBEAT_TOUCH_INTERVAL_MS = 30_000;

/**
 * Phase 4: Maximum jitter added to each tick interval (±15% of tick interval).
 * Prevents thundering herd when multiple scheduler instances tick in lockstep.
 */
const TICK_JITTER_RATIO = 0.15;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PluginJobSchedulerOptions {
  db: Db;
  jobStore: PluginJobStore;
  workerManager: PluginWorkerManager;
  tickIntervalMs?: number;
  jobTimeoutMs?: number;
  maxConcurrentJobs?: number;
  /** Run recovery service for heartbeat and ghost run detection (Phase 2). */
  runRecovery?: RunRecoveryService;
  /**
   * Phase 4: Threshold in ms before a job is considered a missed fire.
   * Default: 2× tickIntervalMs.
   */
  missedFireThresholdMs?: number;
}

export interface TriggerJobResult {
  runId: string;
  jobId: string;
}

/**
 * Phase 4: Extended diagnostics for health endpoint.
 */
export interface SchedulerDiagnostics {
  running: boolean;
  activeJobCount: number;
  activeJobIds: string[];
  tickCount: number;
  lastTickAt: string | null;
  /** Phase 4: Uptime in milliseconds since the scheduler started. */
  uptimeMs: number;
  /** Phase 4: Total missed-fire catch-ups since start. */
  missedFireCount: number;
  /** Phase 4: Total jobs dispatched since start. */
  totalDispatchCount: number;
  /** Phase 4: Total dispatch failures since start. */
  totalFailureCount: number;
  /** Phase 4: Last error message (if any). */
  lastError: string | null;
  /** Phase 4: Timestamp of last error (ISO 8601). */
  lastErrorAt: string | null;
}

export interface PluginJobScheduler {
  start(): Promise<void>;
  stop(): void;
  registerPlugin(pluginId: string): Promise<void>;
  unregisterPlugin(pluginId: string): Promise<void>;
  triggerJob(jobId: string, trigger?: "manual" | "retry"): Promise<TriggerJobResult>;
  tick(): Promise<void>;
  diagnostics(): SchedulerDiagnostics;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createPluginJobScheduler(
  options: PluginJobSchedulerOptions,
): PluginJobScheduler {
  const {
    db,
    jobStore,
    workerManager,
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
    jobTimeoutMs = DEFAULT_JOB_TIMEOUT_MS,
    maxConcurrentJobs = DEFAULT_MAX_CONCURRENT_JOBS,
    runRecovery,
    missedFireThresholdMs = 2 * tickIntervalMs,
  } = options;

  const log = logger.child({ service: "plugin-job-scheduler" });

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  let tickTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const activeJobs = new Set<string>();
  let tickCount = 0;
  let lastTickAt: Date | null = null;
  let tickInProgress = false;

  // Phase 4: Extended state for health visibility
  let startedAt: Date | null = null;
  let missedFireCount = 0;
  let totalDispatchCount = 0;
  let totalFailureCount = 0;
  let lastError: string | null = null;
  let lastErrorAt: Date | null = null;

  // -----------------------------------------------------------------------
  // Phase 4: Tick jitter — prevent thundering herd
  // -----------------------------------------------------------------------

  /**
   * Compute the next tick delay with random jitter.
   * ±15% of the tick interval (e.g. 30s → 25.5s–34.5s).
   */
  function nextTickDelay(): number {
    const jitter = (Math.random() * 2 - 1) * TICK_JITTER_RATIO;
    return Math.round(tickIntervalMs * (1 + jitter));
  }

  /**
   * Schedule the next tick using setTimeout with jitter.
   * Each tick self-reschedules with a fresh random delay.
   */
  function scheduleNextTick(): void {
    if (!running) return;
    const delay = nextTickDelay();
    tickTimer = setTimeout(() => {
      void tick().finally(() => scheduleNextTick());
    }, delay);
  }

  // -----------------------------------------------------------------------
  // Phase 2: DB-backed overlap check
  // -----------------------------------------------------------------------

  async function hasActiveRunInDb(jobId: string): Promise<boolean> {
    const rows = await db
      .select({ id: pluginJobRuns.id })
      .from(pluginJobRuns)
      .where(
        and(
          eq(pluginJobRuns.jobId, jobId),
          or(
            eq(pluginJobRuns.status, "running"),
            eq(pluginJobRuns.status, "queued"),
          ),
        ),
      );
    return rows.length > 0;
  }

  // -----------------------------------------------------------------------
  // Phase 4: Missed-fire detection
  // -----------------------------------------------------------------------

  /**
   * A missed fire occurs when `nextRunAt` is significantly in the past
   * (beyond the threshold), meaning the server was likely down. We fire
   * ONE catch-up run and fast-forward the schedule (handled in
   * advanceSchedulePointer which always computes from now).
   */
  function isMissedFire(
    job: typeof pluginJobs.$inferSelect,
    now: Date,
  ): boolean {
    if (!job.nextRunAt) return false;
    return now.getTime() - job.nextRunAt.getTime() > missedFireThresholdMs;
  }

  // -----------------------------------------------------------------------
  // Core: tick
  // -----------------------------------------------------------------------

  async function tick(): Promise<void> {
    if (tickInProgress) {
      log.debug("skipping tick — previous tick still in progress");
      return;
    }

    tickInProgress = true;
    tickCount++;
    lastTickAt = new Date();

    try {
      const now = new Date();

      const dueJobs = await db
        .select()
        .from(pluginJobs)
        .where(
          and(
            eq(pluginJobs.status, "active"),
            lte(pluginJobs.nextRunAt, now),
          ),
        );

      if (dueJobs.length === 0) {
        return;
      }

      log.debug({ count: dueJobs.length }, "found due jobs");

      const dispatches: Promise<void>[] = [];

      for (const job of dueJobs) {
        // Concurrency limit
        if (activeJobs.size >= maxConcurrentJobs) {
          log.warn(
            { maxConcurrentJobs, activeJobCount: activeJobs.size },
            "max concurrent jobs reached, deferring remaining jobs",
          );
          break;
        }

        // In-memory overlap prevention (fast path)
        if (activeJobs.has(job.id)) {
          log.debug(
            { jobId: job.id, jobKey: job.jobKey, pluginId: job.pluginId },
            "skipping job — already running (in-memory overlap prevention)",
          );
          continue;
        }

        // Phase 2: DB-backed overlap prevention (catches ghost runs)
        try {
          if (await hasActiveRunInDb(job.id)) {
            log.debug(
              { jobId: job.id, jobKey: job.jobKey },
              "skipping job — DB shows existing active run (Phase 2 overlap check)",
            );
            continue;
          }
        } catch (err) {
          log.warn(
            { jobId: job.id, err: err instanceof Error ? err.message : String(err) },
            "DB overlap check failed — falling back to in-memory only",
          );
        }

        // Check worker availability
        if (!workerManager.isRunning(job.pluginId)) {
          log.debug(
            { jobId: job.id, pluginId: job.pluginId },
            "skipping job — worker not running",
          );
          continue;
        }

        // Validate schedule
        if (!job.schedule) {
          log.warn(
            { jobId: job.id, jobKey: job.jobKey },
            "skipping job — no schedule defined",
          );
          continue;
        }

        // Phase 4: Missed-fire detection — log and count but still dispatch
        // The schedule pointer always fast-forwards from now in advanceSchedulePointer
        if (isMissedFire(job, now)) {
          const ageMs = now.getTime() - (job.nextRunAt?.getTime() ?? 0);
          missedFireCount++;
          log.warn(
            {
              jobId: job.id,
              jobKey: job.jobKey,
              pluginId: job.pluginId,
              nextRunAt: job.nextRunAt?.toISOString(),
              ageMs,
              missedFireCount,
            },
            "missed-fire detected — dispatching catch-up run and fast-forwarding schedule",
          );
        }

        dispatches.push(dispatchJob(job));
      }

      if (dispatches.length > 0) {
        await Promise.allSettled(dispatches);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      lastError = errMsg;
      lastErrorAt = new Date();
      log.error({ err: errMsg }, "scheduler tick error");
    } finally {
      tickInProgress = false;
    }
  }

  // -----------------------------------------------------------------------
  // Core: dispatch a single job (with Phase 2 heartbeat)
  // -----------------------------------------------------------------------

  async function dispatchJob(
    job: typeof pluginJobs.$inferSelect,
  ): Promise<void> {
    const { id: jobId, pluginId, jobKey } = job;
    const jobLog = log.child({ jobId, pluginId, jobKey });

    activeJobs.add(jobId);
    totalDispatchCount++;
    let runId: string | undefined;
    const startedAtMs = Date.now();

    try {
      const run = await jobStore.createRun({
        jobId,
        pluginId,
        trigger: "schedule",
      });
      runId = run.id;

      jobLog.info({ runId }, "dispatching scheduled job");

      await jobStore.markRunning(runId);

      // Phase 2: Start heartbeat interval during execution
      const heartbeatTimer = runRecovery
        ? setInterval(() => {
            void runRecovery.touchHeartbeat(runId!).catch((err) => {
              jobLog.warn(
                { runId, err: err instanceof Error ? err.message : String(err) },
                "failed to touch heartbeat",
              );
            });
          }, HEARTBEAT_TOUCH_INTERVAL_MS)
        : null;

      try {
        await workerManager.call(
          pluginId,
          "runJob",
          {
            job: {
              jobKey,
              runId,
              trigger: "schedule" as const,
              scheduledAt: (job.nextRunAt ?? new Date()).toISOString(),
            },
          },
          jobTimeoutMs,
        );
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }

      const durationMs = Date.now() - startedAtMs;
      await jobStore.completeRun(runId, {
        status: "succeeded",
        durationMs,
      });

      jobLog.info({ runId, durationMs }, "job completed successfully");
    } catch (err) {
      const durationMs = Date.now() - startedAtMs;
      const errorMessage = err instanceof Error ? err.message : String(err);

      totalFailureCount++;
      lastError = errorMessage;
      lastErrorAt = new Date();

      jobLog.error(
        { runId, durationMs, err: errorMessage },
        "job execution failed",
      );

      if (runId) {
        try {
          await jobStore.completeRun(runId, {
            status: "failed",
            error: errorMessage,
            durationMs,
          });
        } catch (completeErr) {
          jobLog.error(
            {
              runId,
              err: completeErr instanceof Error ? completeErr.message : String(completeErr),
            },
            "failed to record job failure",
          );
        }
      }
    } finally {
      activeJobs.delete(jobId);

      try {
        await advanceSchedulePointer(job);
      } catch (err) {
        jobLog.error(
          { err: err instanceof Error ? err.message : String(err) },
          "failed to advance schedule pointer",
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Core: manual trigger (with Phase 2 heartbeat)
  // -----------------------------------------------------------------------

  async function triggerJob(
    jobId: string,
    trigger: "manual" | "retry" = "manual",
  ): Promise<TriggerJobResult> {
    const job = await jobStore.getJobById(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.status !== "active") {
      throw new Error(`Job "${job.jobKey}" is not active (status: ${job.status})`);
    }

    if (activeJobs.has(jobId)) {
      throw new Error(`Job "${job.jobKey}" is already running — cannot trigger while in progress`);
    }

    if (await hasActiveRunInDb(jobId)) {
      throw new Error(
        `Job "${job.jobKey}" already has an active run in the database — cannot trigger while in progress`,
      );
    }

    if (!workerManager.isRunning(job.pluginId)) {
      throw new Error(`Worker for plugin "${job.pluginId}" is not running — cannot trigger job`);
    }

    const run = await jobStore.createRun({
      jobId,
      pluginId: job.pluginId,
      trigger,
    });

    void dispatchManualRun(job, run.id, trigger);

    return { runId: run.id, jobId };
  }

  async function dispatchManualRun(
    job: typeof pluginJobs.$inferSelect,
    runId: string,
    trigger: "manual" | "retry",
  ): Promise<void> {
    const { id: jobId, pluginId, jobKey } = job;
    const jobLog = log.child({ jobId, pluginId, jobKey, runId, trigger });

    activeJobs.add(jobId);
    totalDispatchCount++;
    const startedAtMs = Date.now();

    try {
      await jobStore.markRunning(runId);

      const heartbeatTimer = runRecovery
        ? setInterval(() => {
            void runRecovery.touchHeartbeat(runId).catch(() => {});
          }, HEARTBEAT_TOUCH_INTERVAL_MS)
        : null;

      try {
        await workerManager.call(
          pluginId,
          "runJob",
          {
            job: {
              jobKey,
              runId,
              trigger,
              scheduledAt: new Date().toISOString(),
            },
          },
          jobTimeoutMs,
        );
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }

      const durationMs = Date.now() - startedAtMs;
      await jobStore.completeRun(runId, { status: "succeeded", durationMs });
      jobLog.info({ durationMs }, "manual job completed successfully");
    } catch (err) {
      const durationMs = Date.now() - startedAtMs;
      const errorMessage = err instanceof Error ? err.message : String(err);

      totalFailureCount++;
      lastError = errorMessage;
      lastErrorAt = new Date();

      jobLog.error({ durationMs, err: errorMessage }, "manual job failed");

      try {
        await jobStore.completeRun(runId, {
          status: "failed",
          error: errorMessage,
          durationMs,
        });
      } catch (completeErr) {
        jobLog.error(
          { err: completeErr instanceof Error ? completeErr.message : String(completeErr) },
          "failed to record manual job failure",
        );
      }
    } finally {
      activeJobs.delete(jobId);
    }
  }

  // -----------------------------------------------------------------------
  // Schedule pointer management
  // -----------------------------------------------------------------------

  async function advanceSchedulePointer(
    job: typeof pluginJobs.$inferSelect,
  ): Promise<void> {
    const now = new Date();
    let nextRunAt: Date | null = null;

    if (job.schedule) {
      const validationError = validateCron(job.schedule);
      if (validationError) {
        log.warn(
          { jobId: job.id, schedule: job.schedule, error: validationError },
          "invalid cron schedule — cannot compute next run",
        );
      } else {
        const cron = parseCron(job.schedule);
        nextRunAt = nextCronTick(cron, now);
      }
    }

    await jobStore.updateRunTimestamps(job.id, now, nextRunAt);
  }

  async function ensureNextRunTimestamps(pluginId: string): Promise<void> {
    const jobs = await jobStore.listJobs(pluginId, "active");

    for (const job of jobs) {
      if (job.nextRunAt && job.nextRunAt.getTime() > Date.now()) continue;
      if (!job.schedule) continue;

      const validationError = validateCron(job.schedule);
      if (validationError) {
        log.warn(
          { jobId: job.id, jobKey: job.jobKey, schedule: job.schedule, error: validationError },
          "skipping job with invalid cron schedule",
        );
        continue;
      }

      const cron = parseCron(job.schedule);
      const nextRunAt = nextCronTick(cron, new Date());
      if (nextRunAt) {
        await jobStore.updateRunTimestamps(
          job.id,
          job.lastRunAt ?? new Date(0),
          nextRunAt,
        );
        log.debug(
          { jobId: job.id, jobKey: job.jobKey, nextRunAt: nextRunAt.toISOString() },
          "computed nextRunAt for job",
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Plugin registration
  // -----------------------------------------------------------------------

  async function registerPlugin(pluginId: string): Promise<void> {
    log.info({ pluginId }, "registering plugin with job scheduler");
    await ensureNextRunTimestamps(pluginId);
  }

  async function unregisterPlugin(pluginId: string): Promise<void> {
    log.info({ pluginId }, "unregistering plugin from job scheduler");

    try {
      const runningRuns = await db
        .select()
        .from(pluginJobRuns)
        .where(
          and(
            eq(pluginJobRuns.pluginId, pluginId),
            or(
              eq(pluginJobRuns.status, "running"),
              eq(pluginJobRuns.status, "queued"),
            ),
          ),
        );

      for (const run of runningRuns) {
        await jobStore.completeRun(run.id, {
          status: "cancelled",
          error: "Plugin unregistered",
          durationMs: run.startedAt ? Date.now() - run.startedAt.getTime() : null,
        });
      }
    } catch (err) {
      log.error(
        {
          pluginId,
          err: err instanceof Error ? err.message : String(err),
        },
        "error cancelling in-flight runs during unregister",
      );
    }

    const jobs = await jobStore.listJobs(pluginId);
    for (const job of jobs) {
      activeJobs.delete(job.id);
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle: start / stop
  // Phase 4: Jittered setTimeout replaces fixed setInterval
  // -----------------------------------------------------------------------

  async function start(): Promise<void> {
    if (running) {
      log.debug("scheduler already running");
      return;
    }

    // Phase 2: Recover ghost runs from previous server instance
    if (runRecovery) {
      try {
        const recovery = await runRecovery.recoverStaleRuns();
        if (recovery.recoveredCount > 0) {
          log.info(
            { recoveredCount: recovery.recoveredCount },
            "recovered ghost runs before starting scheduler",
          );
        }
      } catch (err) {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "failed to recover stale runs — proceeding anyway",
        );
      }

      runRecovery.startHeartbeatSweeper();
    }

    running = true;
    startedAt = new Date();

    // Phase 4: Jittered setTimeout instead of fixed setInterval
    scheduleNextTick();

    log.info(
      {
        tickIntervalMs,
        maxConcurrentJobs,
        jitterRatio: TICK_JITTER_RATIO,
        missedFireThresholdMs,
      },
      "plugin job scheduler started (Phase 4: jitter + missed-fire catch-up enabled)",
    );
  }

  function stop(): void {
    if (tickTimer !== null) {
      clearTimeout(tickTimer);
      tickTimer = null;
    }

    if (runRecovery) {
      runRecovery.stopHeartbeatSweeper();
    }

    if (!running) return;
    running = false;

    log.info(
      { activeJobCount: activeJobs.size },
      "plugin job scheduler stopped",
    );
  }

  // -----------------------------------------------------------------------
  // Diagnostics (Phase 4: extended)
  // -----------------------------------------------------------------------

  function diagnostics(): SchedulerDiagnostics {
    return {
      running,
      activeJobCount: activeJobs.size,
      activeJobIds: [...activeJobs],
      tickCount,
      lastTickAt: lastTickAt?.toISOString() ?? null,
      uptimeMs: startedAt ? Date.now() - startedAt.getTime() : 0,
      missedFireCount,
      totalDispatchCount,
      totalFailureCount,
      lastError,
      lastErrorAt: lastErrorAt?.toISOString() ?? null,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    start,
    stop,
    registerPlugin,
    unregisterPlugin,
    triggerJob,
    tick,
    diagnostics,
  };
}
