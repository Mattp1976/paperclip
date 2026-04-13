import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { createRunRecoveryService } from "../services/run-recovery.js";

/* ---------------------------------------------------------------- */
/*  Mock DB layer                                                      */
/* ---------------------------------------------------------------- */

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockSet = vi.fn();
const mockReturning = vi.fn();

function createMockDb() {
  // Chain: db.select().from().where()
  mockWhere.mockResolvedValue([]);
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });

  // Chain: db.update().set().where().returning()
  mockReturning.mockResolvedValue([]);
  const updateWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  mockSet.mockReturnValue({ where: updateWhere });
  mockUpdate.mockReturnValue({ set: mockSet });

  return {
    select: mockSelect,
    update: mockUpdate,
  };
}

/* ---------------------------------------------------------------- */
/*  Mock the DB schema import                                          */
/* ---------------------------------------------------------------- */

vi.mock("@paperclipai/db", () => ({
  pluginJobRuns: {
    id: "id",
    jobId: "jobId",
    pluginId: "pluginId",
    status: "status",
    trigger: "trigger",
    startedAt: "startedAt",
    lastHeartbeatAt: "lastHeartbeatAt",
  },
  pluginJobs: {
    id: "id",
    jobKey: "jobKey",
  },
}));

vi.mock("../middleware/logger.js", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));
/* ================================================================= */
/*  Tests                                                              */
/* ================================================================= */

describe("run-recovery service", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    db = createMockDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createRunRecoveryService", () => {
    it("returns a service with the expected public API", () => {
      const service = createRunRecoveryService({ db: db as any });
      expect(service).toHaveProperty("recoverStaleRuns");
      expect(service).toHaveProperty("startHeartbeatSweeper");
      expect(service).toHaveProperty("stopHeartbeatSweeper");
      expect(service).toHaveProperty("touchHeartbeat");
      expect(service).toHaveProperty("auditRunStates");
    });
  });

  describe("recoverStaleRuns", () => {
    it("returns zero recoveredCount when no stale runs exist", async () => {
      mockWhere.mockResolvedValue([]);
      const service = createRunRecoveryService({ db: db as any });
      const result = await service.recoverStaleRuns();

      expect(result.recoveredCount).toBe(0);
      expect(result.recoveredRunIds).toEqual([]);
    });

    it("marks queued/running runs as failed and returns their IDs", async () => {
      const staleRuns = [
        { id: "run-1", status: "running", jobId: "j1" },
        { id: "run-2", status: "queued", jobId: "j2" },
      ];
      mockWhere.mockResolvedValueOnce(staleRuns);
      // Each update().set().where().returning() returns the updated row
      mockReturning
        .mockResolvedValueOnce([{ id: "run-1" }])
        .mockResolvedValueOnce([{ id: "run-2" }]);

      const service = createRunRecoveryService({ db: db as any });
      const result = await service.recoverStaleRuns();

      expect(result.recoveredCount).toBe(2);
      expect(result.recoveredRunIds).toContain("run-1");
      expect(result.recoveredRunIds).toContain("run-2");
      expect(mockUpdate).toHaveBeenCalled();
    });
  });
  describe("heartbeat sweeper", () => {
    it("startHeartbeatSweeper and stopHeartbeatSweeper lifecycle", () => {
      const service = createRunRecoveryService({
        db: db as any,
        sweepIntervalMs: 5_000,
      });

      // Start should not throw
      expect(() => service.startHeartbeatSweeper()).not.toThrow();

      // Stop should not throw
      expect(() => service.stopHeartbeatSweeper()).not.toThrow();
    });

    it("stopHeartbeatSweeper is idempotent", () => {
      const service = createRunRecoveryService({ db: db as any });
      // Stop without starting should not throw
      expect(() => service.stopHeartbeatSweeper()).not.toThrow();
      expect(() => service.stopHeartbeatSweeper()).not.toThrow();
    });
  });

  describe("touchHeartbeat", () => {
    it("calls db.update to set lastHeartbeatAt", async () => {
      mockReturning.mockResolvedValue([{ id: "run-1" }]);
      const service = createRunRecoveryService({ db: db as any });

      await service.touchHeartbeat("run-1");
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalled();
    });
  });

  describe("auditRunStates", () => {
    it("returns empty array when no non-terminal runs exist", async () => {
      mockWhere.mockResolvedValue([]);
      const service = createRunRecoveryService({ db: db as any });
      const result = await service.auditRunStates();
      expect(result).toEqual([]);
    });
  });
});
