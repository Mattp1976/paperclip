/**
 * Checkout Lock Recovery Service — Phase 3: eliminate orphaned issue locks
 *
 * Orphaned checkout locks occur when an agent run crashes or times out while
 * an issue is checked out (status = "in_progress", checkoutRunId set).
 * Without recovery, these issues:
 *
 * - Stay permanently locked to a dead run
 * - Cannot be picked up by another agent
 * - Show as "in progress" in the dashboard forever
 *
 * ## How it works
 *
 * 1. **Proactive sweep** — A periodic sweep (default every 2 min) scans for
 *    issues in "in_progress" status whose `checkoutRunId` references a run
 *    that has reached a terminal state (failed, succeeded, cancelled, timed_out)
 *    or whose `executionLockedAt` exceeds the TTL (default 30 min).
 *
 * 2. **Lock release** — Orphaned issues are released back to "todo" status
 *    with their `checkoutRunId` and `assigneeAgentId` cleared, making them
 *    available for fresh checkout.
 *
 * 3. **Audit** — `auditOrphanedLocks()` returns a diagnostic snapshot of
 *    all issues with potentially stale locks, useful for the health endpoint.
 *
 * Phase 2's heartbeat sweeper handles the run-side (marking hung runs as
 * failed). This service handles the issue-side (releasing locks held by
 * those now-failed runs).
 *
 * @see ./issues.ts — Issue service (checkout/release methods)
 * @see ./run-recovery.ts — Run recovery (marks hung runs as failed)
 */

import { and, eq, lt, or, isNull, isNotNull, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default interval between lock recovery sweeps (2 minutes). */
const DEFAULT_SWEEP_INTERVAL_MS = 2 * 60 * 1_000;

/**
 * Default checkout lock TTL (30 minutes).
 * Issues locked longer than this with no active run are considered orphaned.
 * This is intentionally generous — most agent runs complete in under 5 min.
 * The TTL is a safety net for cases where the run itself was never recorded
 * or the heartbeat system missed it.
 */
const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1_000;

/** Terminal run statuses — if the run is in one of these, the lock is stale. */
const TERMINAL_RUN_STATUSES = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckoutLockRecoveryOptions {
  /** Drizzle database instance. */
  db: Db;
  /** Interval between lock recovery sweeps in ms (default: 2 min). */
  sweepIntervalMs?: number;
  /** Lock TTL in ms (default: 30 min). Issues locked longer than this
   *  with a dead/missing run are released. */
  lockTtlMs?: number;
  /**
   * Function to check if a run is terminal or missing.
   * Injected to avoid circular dependency with the issues service.
   * Should return true if the run is in a terminal state or doesn't exist.
   */
  isRunTerminalOrMissing: (runId: string) => Promise<boolean>;
}

export interface LockRecoveryResult {
  /** Number of issues whose locks were released. */
  releasedCount: number;
  /** IDs of released issues. */
  releasedIssueIds: string[];
}

export interface OrphanedLockEntry {
  issueId: string;
  identifier: string | null;
  companyId: string;
  status: string;
  checkoutRunId: string | null;
  assigneeAgentId: string | null;
  executionLockedAt: Date | null;
  lockAgeMs: number;
  runTerminal: boolean;
}

export interface CheckoutLockRecoveryService {
  /**
   * Start the periodic lock recovery sweeper.
   */
  startSweeper(): void;

  /**
   * Stop the lock recovery sweeper.
   */
  stopSweeper(): void;

  /**
   * Run a single recovery sweep (useful for testing or manual trigger).
   */
  sweep(): Promise<LockRecoveryResult>;

  /**
   * Force-release a specific issue's checkout lock.
   * Used by admin endpoints when manual intervention is needed.
   */
  forceRelease(issueId: string, reason?: string): Promise<boolean>;

  /**
   * Audit all issues with potentially orphaned locks.
   * Useful for health/diagnostics endpoints.
   */
  auditOrphanedLocks(): Promise<OrphanedLockEntry[]>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createCheckoutLockRecoveryService(
  options: CheckoutLockRecoveryOptions,
): CheckoutLockRecoveryService {
  const {
    db,
    sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS,
    lockTtlMs = DEFAULT_LOCK_TTL_MS,
    isRunTerminalOrMissing,
  } = options;

  const log = logger.child({ service: "checkout-lock-recovery" });
  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  // -----------------------------------------------------------------------
  // Sweep logic
  // -----------------------------------------------------------------------

  async function sweep(): Promise<LockRecoveryResult> {
    const cutoff = new Date(Date.now() - lockTtlMs);
    const releasedIssueIds: string[] = [];

    try {
      // Find all issues that are in_progress with a checkout lock
      const lockedIssues = await db
        .select({
          id: issues.id,
          checkoutRunId: issues.checkoutRunId,
          executionLockedAt: issues.executionLockedAt,
        })
        .from(issues)
        .where(
          and(
            eq(issues.status, "in_progress"),
            isNotNull(issues.checkoutRunId),
          ),
        );

      if (lockedIssues.length === 0) {
        return { releasedCount: 0, releasedIssueIds: [] };
      }

      log.debug(
        { count: lockedIssues.length },
        "checkout lock sweep: evaluating locked issues",
      );

      for (const issue of lockedIssues) {
        try {
          let shouldRelease = false;
          let reason = "";

          // Check 1: Is the run terminal or missing?
          if (issue.checkoutRunId) {
            const terminal = await isRunTerminalOrMissing(issue.checkoutRunId);
            if (terminal) {
              shouldRelease = true;
              reason = "run is terminal or missing";
            }
          }

          // Check 2: Has the lock exceeded the TTL?
          // This catches cases where the run record is stuck/corrupt
          if (!shouldRelease && issue.executionLockedAt) {
            if (issue.executionLockedAt < cutoff) {
              shouldRelease = true;
              reason = `lock TTL exceeded (${Math.round(
                (Date.now() - issue.executionLockedAt.getTime()) / 60_000,
              )} min)`;
            }
          }

          // Check 3: No lock timestamp at all but has a checkoutRunId
          // This is a data integrity issue — release it
          if (!shouldRelease && !issue.executionLockedAt && issue.checkoutRunId) {
            const terminal = await isRunTerminalOrMissing(issue.checkoutRunId);
            if (terminal) {
              shouldRelease = true;
              reason = "missing lock timestamp with terminal run";
            }
          }

          if (shouldRelease) {
            await releaseIssueLock(issue.id);
            releasedIssueIds.push(issue.id);
            log.info(
              { issueId: issue.id, reason },
              "checkout lock sweep: released orphaned lock",
            );
          }
        } catch (err) {
          log.error(
            {
              issueId: issue.id,
              err: err instanceof Error ? err.message : String(err),
            },
            "checkout lock sweep: failed to evaluate/release issue",
          );
        }
      }

      if (releasedIssueIds.length > 0) {
        log.warn(
          {
            releasedCount: releasedIssueIds.length,
            total: lockedIssues.length,
          },
          "checkout lock sweep complete — released orphaned locks",
        );
      }
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "checkout lock sweep error",
      );
    }

    return {
      releasedCount: releasedIssueIds.length,
      releasedIssueIds,
    };
  }

  // -----------------------------------------------------------------------
  // Lock release helper
  // -----------------------------------------------------------------------

  async function releaseIssueLock(issueId: string): Promise<void> {
    const now = new Date();
    await db
      .update(issues)
      .set({
        status: "todo",
        assigneeAgentId: null,
        checkoutRunId: null,
        executionRunId: null,
        executionLockedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(issues.id, issueId),
          // Optimistic lock: only release if still in_progress.
          // This prevents a race if the issue was already released
          // between our SELECT and this UPDATE.
          eq(issues.status, "in_progress"),
        ),
      );
  }

  // -----------------------------------------------------------------------
  // Force release (admin)
  // -----------------------------------------------------------------------

  async function forceRelease(issueId: string, reason?: string): Promise<boolean> {
    const now = new Date();
    const result = await db
      .update(issues)
      .set({
        status: "todo",
        assigneeAgentId: null,
        checkoutRunId: null,
        executionRunId: null,
        executionLockedAt: null,
        updatedAt: now,
      })
      .where(eq(issues.id, issueId))
      .returning({ id: issues.id });

    const released = result.length > 0;
    if (released) {
      log.warn({ issueId, reason: reason ?? "no reason provided" }, "force-released issue checkout lock (admin action)");
    }
    return released;
  }

  // -----------------------------------------------------------------------
  // Audit
  // -----------------------------------------------------------------------

  async function auditOrphanedLocks(): Promise<OrphanedLockEntry[]> {
    const now = Date.now();

    const lockedIssues = await db
      .select({
        id: issues.id,
        identifier: issues.identifier,
        companyId: issues.companyId,
        status: issues.status,
        checkoutRunId: issues.checkoutRunId,
        assigneeAgentId: issues.assigneeAgentId,
        executionLockedAt: issues.executionLockedAt,
      })
      .from(issues)
      .where(
        and(
          eq(issues.status, "in_progress"),
          isNotNull(issues.checkoutRunId),
        ),
      );

    const entries: OrphanedLockEntry[] = [];

    for (const issue of lockedIssues) {
      const runTerminal = issue.checkoutRunId
        ? await isRunTerminalOrMissing(issue.checkoutRunId)
        : true;

      entries.push({
        issueId: issue.id,
        identifier: issue.identifier,
        companyId: issue.companyId,
        status: issue.status,
        checkoutRunId: issue.checkoutRunId,
        assigneeAgentId: issue.assigneeAgentId,
        executionLockedAt: issue.executionLockedAt,
        lockAgeMs: issue.executionLockedAt
          ? now - issue.executionLockedAt.getTime()
          : -1,
        runTerminal,
      });
    }

    return entries;
  }

  // -----------------------------------------------------------------------
  // Sweeper lifecycle
  // -----------------------------------------------------------------------

  function startSweeper(): void {
    if (sweepTimer) return;
    sweepTimer = setInterval(() => {
      void sweep();
    }, sweepIntervalMs);
    log.info(
      { sweepIntervalMs, lockTtlMs },
      "checkout lock recovery sweeper started",
    );
  }

  function stopSweeper(): void {
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
    log.info("checkout lock recovery sweeper stopped");
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    startSweeper,
    stopSweeper,
    sweep,
    forceRelease,
    auditOrphanedLocks,
  };
}
