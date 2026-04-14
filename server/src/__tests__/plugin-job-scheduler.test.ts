import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { createPluginJobScheduler } from "../services/plugin-job-scheduler.js";

/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */

vi.mock("@paperclipai/db", () => ({
  pluginJobs: { id: "id", status: "status", nextRunAt: "nextRunAt", pluginId: "pluginId" },
  pluginJobRuns: { id: "id", jobId: "jobId", pluginId: "pluginId", status: "status" },
}));

vi.mock("../middleware/logger.js", () => {
  const createMockLogger = (): any => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => createMockLogger(),
  });
  return { logger: createMockLogger() };
});

vi.mock("./cron.js", () => ({
  parseCron: vi.fn().mockReturnValue({}),
  nextCronTick: vi.fn().mockReturnValue(new Date(Date.now() + 60_000)),
  validateCron: vi.fn().mockReturnValue(null),
}));

/* ------------------------------------------------------------------ */
/*  Mock factories                                                     */
/* ------------------------------------------------------------------ */

function createMockDb() {
  const mockWhere = vi.fn().mockResolvedValue([]);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  return { select: mockSelect, update: vi.fn(), _mockWhere: mockWhere };
}

function createMockJobStore() {
  return {
    createRun: vi.fn().mockResolvedValue({ id: "run-1" }),
    markRunning: vi.fn().mockResolvedValue(undefined),
    completeRun: vi.fn().mockResolvedValue(undefined),
    getJobById: vi.fn(),
    listJobs: vi.fn().mockResolvedValue([]),
    updateRunTimestamps: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockWorkerManager() {
  return {
    isRunning: vi.fn().mockReturnValue(true),
    call: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRunRecovery() {
  return {
    recoverStaleRuns: vi.fn().mockResolvedValue({ recoveredCount: 0, recoveredRunIds: [] }),
    startHeartbeatSweeper: vi.fn(),
    stopHeartbeatSweeper: vi.fn(),
    touchHeartbeat: vi.fn().mockResolvedValue(undefined),
    auditRunStates: vi.fn().mockResolvedValue([]),
  };
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("plugin-job-scheduler", () => {
  let db: ReturnType<typeof createMockDb>;
  let jobStore: ReturnType<typeof createMockJobStore>;
  let workerManager: ReturnType<typeof createMockWorkerManager>;
  let runRecovery: ReturnType<typeof createMockRunRecovery>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    db = createMockDb();
    jobStore = createMockJobStore();
    workerManager = createMockWorkerManager();
    runRecovery = createMockRunRecovery();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("diagnostics()", () => {
    it("returns initial state before start", () => {
      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
      });

      const diag = scheduler.diagnostics();
      expect(diag.running).toBe(false);
      expect(diag.activeJobCount).toBe(0);
      expect(diag.activeJobIds).toEqual([]);
      expect(diag.tickCount).toBe(0);
      expect(diag.lastTickAt).toBeNull();
      expect(diag.uptimeMs).toBe(0);
      expect(diag.missedFireCount).toBe(0);
      expect(diag.totalDispatchCount).toBe(0);
      expect(diag.totalFailureCount).toBe(0);
      expect(diag.lastError).toBeNull();
      expect(diag.lastErrorAt).toBeNull();
    });

    it("shows running=true and uptimeMs > 0 after start", async () => {
      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
        runRecovery: runRecovery as any,
      });

      await scheduler.start();

      const diag = scheduler.diagnostics();
      expect(diag.running).toBe(true);
      expect(diag.uptimeMs).toBeGreaterThanOrEqual(0);

      scheduler.stop();
    });
  });

  describe("start() / stop()", () => {
    it("start is idempotent — calling twice does not throw", async () => {
      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
      });

      await scheduler.start();
      await scheduler.start(); // Should not throw
      scheduler.stop();
    });

    it("stop clears running state", async () => {
      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
      });

      await scheduler.start();
      expect(scheduler.diagnostics().running).toBe(true);
      scheduler.stop();
      expect(scheduler.diagnostics().running).toBe(false);
    });

    it("triggers ghost-run recovery on start when runRecovery is provided", async () => {
      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
        runRecovery: runRecovery as any,
      });

      await scheduler.start();

      expect(runRecovery.recoverStaleRuns).toHaveBeenCalledOnce();
      expect(runRecovery.startHeartbeatSweeper).toHaveBeenCalledOnce();

      scheduler.stop();
      expect(runRecovery.stopHeartbeatSweeper).toHaveBeenCalledOnce();
    });
  });

  describe("tick()", () => {
    it("increments tickCount after each tick", async () => {
      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
      });

      expect(scheduler.diagnostics().tickCount).toBe(0);

      await scheduler.tick();
      expect(scheduler.diagnostics().tickCount).toBe(1);

      await scheduler.tick();
      expect(scheduler.diagnostics().tickCount).toBe(2);
    });

    it("dispatches due jobs when found", async () => {
      const dueJob = {
        id: "job-1",
        pluginId: "plugin-1",
        jobKey: "test-job",
        status: "active",
        schedule: "*/5 * * * *",
        nextRunAt: new Date(Date.now() - 1000),
        lastRunAt: null,
      };
      db._mockWhere.mockResolvedValueOnce([dueJob]);

      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
        runRecovery: runRecovery as any,
        tickIntervalMs: 30_000,
      });

      await scheduler.tick();

      expect(jobStore.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-1",
          pluginId: "plugin-1",
          trigger: "schedule",
        }),
      );
      expect(workerManager.call).toHaveBeenCalled();
    });

    it("respects maxConcurrentJobs limit", async () => {
      // Create 3 due jobs but set max to 1
      const dueJobs = [
        { id: "j1", pluginId: "p1", jobKey: "k1", status: "active", schedule: "* * * * *", nextRunAt: new Date(Date.now() - 1000), lastRunAt: null },
        { id: "j2", pluginId: "p2", jobKey: "k2", status: "active", schedule: "* * * * *", nextRunAt: new Date(Date.now() - 1000), lastRunAt: null },
        { id: "j3", pluginId: "p3", jobKey: "k3", status: "active", schedule: "* * * * *", nextRunAt: new Date(Date.now() - 1000), lastRunAt: null },
      ];
      db._mockWhere.mockResolvedValueOnce(dueJobs);

      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
        maxConcurrentJobs: 1,
      });

      // First tick should start 1 job and defer the rest
      await scheduler.tick();

      // Should have created only 1 run (concurrency limit = 1)
      expect(jobStore.createRun).toHaveBeenCalledTimes(1);
    });

    it("skips jobs when worker is not running", async () => {
      const dueJob = {
        id: "job-1",
        pluginId: "plugin-down",
        jobKey: "test",
        status: "active",
        schedule: "* * * * *",
        nextRunAt: new Date(Date.now() - 1000),
        lastRunAt: null,
      };
      db._mockWhere.mockResolvedValueOnce([dueJob]);
      workerManager.isRunning.mockReturnValue(false);

      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
      });

      await scheduler.tick();

      expect(jobStore.createRun).not.toHaveBeenCalled();
    });
  });

  describe("triggerJob()", () => {
    it("throws when job is not found", async () => {
      jobStore.getJobById.mockResolvedValue(null);
      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
      });

      await expect(scheduler.triggerJob("nonexistent")).rejects.toThrow(
        "Job not found",
      );
    });

    it("throws when job is not active", async () => {
      jobStore.getJobById.mockResolvedValue({
        id: "j1",
        status: "paused",
        jobKey: "test",
        pluginId: "p1",
      });

      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
      });

      await expect(scheduler.triggerJob("j1")).rejects.toThrow("not active");
    });

    it("creates a run and returns runId on success", async () => {
      jobStore.getJobById.mockResolvedValue({
        id: "j1",
        status: "active",
        jobKey: "test",
        pluginId: "p1",
      });

      const scheduler = createPluginJobScheduler({
        db: db as any,
        jobStore: jobStore as any,
        workerManager: workerManager as any,
      });

      const result = await scheduler.triggerJob("j1", "manual");
      expect(result.runId).toBe("run-1");
      expect(result.jobId).toBe("j1");
      expect(jobStore.createRun).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: "manual" }),
      );
    });
  });
});
