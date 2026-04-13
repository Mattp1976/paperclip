import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSchedulerHealthRoutes } from "../services/scheduler-health-routes.js";

/* ---------------------------------------------------------------- */
/*  Mock factories                                                   */
/* ---------------------------------------------------------------- */

function makeMockScheduler(overrides: Record<string, unknown> = {}) { 
  return {
    diagnostics: vi.fn().mockReturnValue({
      running: true,
      activeJobCount: 0,
      activeJobIds: [],
      tickCount: 42,
      lastTickAt: new Date().toISOString(),
      uptimeMs: 120_000,
      missedFireCount: 0,
      totalDispatchCount: 5,
      totalFailureCount: 0,
      lastError: null,
      lastErrorAt: null,
      ...overrides,
    }),
  };
}

function makeMockRunRecovery(overrides: Record<string, unknown> = {}) {
  return {
    auditRunStates: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}
/* ---------------------------------------------------------------- */
/*  Helper                                                           */
/* ---------------------------------------------------------------- */

function createApp(
  scheduler: ReturnType<typeof makeMockScheduler>,
  runRecovery?: ReturnType<typeof makeMockRunRecovery>,
) {
  const app = express();
  const routes = createSchedulerHealthRoutes({
    scheduler: scheduler as any,
    runRecovery: runRecovery as any,
  });
  app.use("/api/health/scheduler", routes);
  return app;
}

/* ================================================================= */
/*  Tests                                                              */
/* ================================================================= */

describe("scheduler-health-routes", () => {
  let scheduler: ReturnType<typeof makeMockScheduler>;
  let runRecovery: ReturnType<typeof makeMockRunRecovery>;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = makeMockScheduler();
    runRecovery = makeMockRunRecovery();
  });

  /* ---------------------------------------------------------------- */
  /*  GET / — status endpoint                                         */
  /* ---------------------------------------------------------------- */

  describe("GET /api/health/scheduler", () => {
    it("returns 200 + healthy when scheduler is running normally", async () => {
      const res = await request(createApp(scheduler, runRecovery))
        .get("/api/health/scheduler")
        .expect(200);

      expect(res.body.status).toBe("healthy");
      expect(res.body.scheduler.running).toBe(true);
      expect(res.body.scheduler.tickCount).toBe(42);
      expect(res.body).toHaveProperty("timestamp");
    });

    it("returns 503 + stopped when scheduler is not running", async () => {
      scheduler = makeMockScheduler({ running: false });
      const res = await request(createApp(scheduler, runRecovery))
        .get("/api/health/scheduler")
        .expect(503);

      expect(res.body.status).toBe("stopped");
    });
    it("returns degraded when a recent error exists (< 5 min)", async () => {
      scheduler = makeMockScheduler({
        running: true,
        lastError: "tick exploded",
        lastErrorAt: new Date().toISOString(),
      });

      const res = await request(createApp(scheduler, runRecovery))
        .get("/api/health/scheduler")
        .expect(200);

      expect(res.body.status).toBe("degraded");
    });

    it("returns degraded when ticks are stale (> 5 min ago)", async () => {
      const sixMinAgo = new Date(Date.now() - 6 * 60 * 1_000).toISOString();
      scheduler = makeMockScheduler({
        running: true,
        lastTickAt: sixMinAgo,
      });

      const res = await request(createApp(scheduler, runRecovery))
        .get("/api/health/scheduler")
        .expect(200);

      expect(res.body.status).toBe("degraded");
    });

    it("includes activeRuns from runRecovery when provided", async () => {
      const mockRuns = [
        { runId: "r1", jobId: "j1", status: "running", ageMs: 60000 },
      ];
      runRecovery = makeMockRunRecovery({
        auditRunStates: vi.fn().mockResolvedValue(mockRuns),
      });

      const res = await request(createApp(scheduler, runRecovery))
        .get("/api/health/scheduler")
        .expect(200);

      expect(res.body.activeRuns.count).toBe(1);
      expect(res.body.activeRuns.runs).toEqual(mockRuns);
    });

    it("returns activeRuns.count = 0 when no runRecovery is provided", async () => {
      const res = await request(createApp(scheduler))
        .get("/api/health/scheduler")
        .expect(200);

      expect(res.body.activeRuns.count).toBe(0);
    });
  });
  /* ---------------------------------------------------------------- */
  /*  GET /runs — active runs endpoint                                  */
  /* ---------------------------------------------------------------- */

  describe("GET /api/health/scheduler/runs", () => {
    it("returns 200 with empty runs when none active", async () => {
      const res = await request(createApp(scheduler, runRecovery))
        .get("/api/health/scheduler/runs")
        .expect(200);

      expect(res.body.count).toBe(0);
      expect(res.body.runs).toEqual([]);
      expect(res.body).toHaveProperty("timestamp");
    });

    it("returns runs from auditRunStates", async () => {
      const mockRuns = [
        { runId: "r1", jobId: "j1", status: "running", ageMs: 60000 },
        { runId: "r2", jobId: "j2", status: "queued", ageMs: 30000 },
      ];
      runRecovery = makeMockRunRecovery({
        auditRunStates: vi.fn().mockResolvedValue(mockRuns),
      });

      const res = await request(createApp(scheduler, runRecovery))
        .get("/api/health/scheduler/runs")
        .expect(200);

      expect(res.body.count).toBe(2);
      expect(res.body.runs).toEqual(mockRuns);
    });

    it("returns 501 when runRecovery is not available", async () => {
      const res = await request(createApp(scheduler))
        .get("/api/health/scheduler/runs")
        .expect(501);

      expect(res.body).toHaveProperty("error");
    });
  });
});
