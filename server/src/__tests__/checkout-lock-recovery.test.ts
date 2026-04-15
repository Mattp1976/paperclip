import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { createCheckoutLockRecoveryService } from "../services/checkout-lock-recovery.js";

/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */

vi.mock("@mattparrytfc/db", () => ({
  issues: {
    id: "id",
    identifier: "identifier",
    companyId: "companyId",
    status: "status",
    checkoutRunId: "checkoutRunId",
    assigneeAgentId: "assigneeAgentId",
    executionLockedAt: "executionLockedAt",
    executionRunId: "executionRunId",
    updatedAt: "updatedAt",
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

/* ------------------------------------------------------------------ */
/*  Mock DB                                                            */
/* ------------------------------------------------------------------ */

function createMockDb() {
  const mockReturning = vi.fn().mockResolvedValue([]);
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  const mockSelectWhere = vi.fn().mockResolvedValue([]);
  const mockFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return {
    select: mockSelect,
    update: mockUpdate,
    _mockSelectWhere: mockSelectWhere,
    _mockUpdateWhere: mockUpdateWhere,
    _mockReturning: mockReturning,
    _mockSet: mockSet,
  };
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("checkout-lock-recovery service", () => {
  let db: ReturnType<typeof createMockDb>;
  let isRunTerminalOrMissing: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    db = createMockDb();
    isRunTerminalOrMissing = vi.fn().mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createCheckoutLockRecoveryService", () => {
    it("returns a service with the expected public API", () => {
      const service = createCheckoutLockRecoveryService({
        db: db as any,
        isRunTerminalOrMissing,
      });

      expect(service).toHaveProperty("startSweeper");
      expect(service).toHaveProperty("stopSweeper");
      expect(service).toHaveProperty("sweep");
      expect(service).toHaveProperty("forceRelease");
      expect(service).toHaveProperty("auditOrphanedLocks");
    });
  });

  describe("sweep()", () => {
    it("returns zero releasedCount when no locked issues exist", async () => {
      db._mockSelectWhere.mockResolvedValue([]);
      const service = createCheckoutLockRecoveryService({
        db: db as any,
        isRunTerminalOrMissing,
      });

      const result = await service.sweep();
      expect(result.releasedCount).toBe(0);
      expect(result.releasedIssueIds).toEqual([]);
    });

    it("releases issues whose run is terminal", async () => {
      const lockedIssues = [
        {
          id: "issue-1",
          checkoutRunId: "run-dead",
          executionLockedAt: new Date(),
        },
      ];
      db._mockSelectWhere.mockResolvedValueOnce(lockedIssues);
      isRunTerminalOrMissing.mockResolvedValue(true);

      const service = createCheckoutLockRecoveryService({
        db: db as any,
        isRunTerminalOrMissing,
      });

      const result = await service.sweep();
      expect(result.releasedCount).toBe(1);
      expect(result.releasedIssueIds).toContain("issue-1");
      expect(db.update).toHaveBeenCalled();
    });

    it("releases issues whose lock TTL has expired", async () => {
      // Issue locked 45 min ago (TTL default is 30 min)
      const lockedIssues = [
        {
          id: "issue-old",
          checkoutRunId: "run-alive",
          executionLockedAt: new Date(Date.now() - 45 * 60 * 1_000),
        },
      ];
      db._mockSelectWhere.mockResolvedValueOnce(lockedIssues);
      // Run is still active (not terminal), but lock is stale
      isRunTerminalOrMissing.mockResolvedValue(false);

      const service = createCheckoutLockRecoveryService({
        db: db as any,
        isRunTerminalOrMissing,
        lockTtlMs: 30 * 60 * 1_000,
      });

      const result = await service.sweep();
      expect(result.releasedCount).toBe(1);
      expect(result.releasedIssueIds).toContain("issue-old");
    });

    it("does NOT release issues within TTL whose run is alive", async () => {
      const lockedIssues = [
        {
          id: "issue-ok",
          checkoutRunId: "run-alive",
          executionLockedAt: new Date(), // Just locked
        },
      ];
      db._mockSelectWhere.mockResolvedValueOnce(lockedIssues);
      isRunTerminalOrMissing.mockResolvedValue(false);

      const service = createCheckoutLockRecoveryService({
        db: db as any,
        isRunTerminalOrMissing,
      });

      const result = await service.sweep();
      expect(result.releasedCount).toBe(0);
    });
  });

  describe("forceRelease()", () => {
    it("calls db.update for the given issueId", async () => {
      db._mockReturning.mockResolvedValue([{ id: "issue-1" }]);
      const service = createCheckoutLockRecoveryService({
        db: db as any,
        isRunTerminalOrMissing,
      });

      const released = await service.forceRelease("issue-1", "admin action");
      expect(released).toBe(true);
      expect(db.update).toHaveBeenCalled();
    });

    it("returns false when issue was not found/updated", async () => {
      db._mockReturning.mockResolvedValue([]);
      const service = createCheckoutLockRecoveryService({
        db: db as any,
        isRunTerminalOrMissing,
      });

      const released = await service.forceRelease("nonexistent");
      expect(released).toBe(false);
    });
  });

  describe("sweeper lifecycle", () => {
    it("startSweeper and stopSweeper are idempotent", () => {
      const service = createCheckoutLockRecoveryService({
        db: db as any,
        isRunTerminalOrMissing,
      });

      expect(() => service.startSweeper()).not.toThrow();
      expect(() => service.startSweeper()).not.toThrow(); // no-op
      expect(() => service.stopSweeper()).not.toThrow();
      expect(() => service.stopSweeper()).not.toThrow(); // no-op
    });
  });

  describe("auditOrphanedLocks()", () => {
    it("returns empty array when no locked issues exist", async () => {
      db._mockSelectWhere.mockResolvedValue([]);
      const service = createCheckoutLockRecoveryService({
        db: db as any,
        isRunTerminalOrMissing,
      });

      const entries = await service.auditOrphanedLocks();
      expect(entries).toEqual([]);
    });

    it("returns entries with runTerminal flag for locked issues", async () => {
      const lockedIssues = [
        {
          id: "issue-1",
          identifier: "PAP-100",
          companyId: "c1",
          status: "in_progress",
          checkoutRunId: "run-1",
          assigneeAgentId: "agent-1",
          executionLockedAt: new Date(Date.now() - 10 * 60 * 1_000),
        },
      ];
      db._mockSelectWhere.mockResolvedValue(lockedIssues);
      isRunTerminalOrMissing.mockResolvedValue(true);

      const service = createCheckoutLockRecoveryService({
        db: db as any,
        isRunTerminalOrMissing,
      });

      const entries = await service.auditOrphanedLocks();
      expect(entries).toHaveLength(1);
      expect(entries[0].issueId).toBe("issue-1");
      expect(entries[0].runTerminal).toBe(true);
      expect(entries[0].lockAgeMs).toBeGreaterThan(0);
    });
  });
});
