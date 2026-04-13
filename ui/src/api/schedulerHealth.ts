import { api } from "./client";

/* ------------------------------------------------------------------ */
/*  Scheduler health types                                             */
/* ------------------------------------------------------------------ */

export interface SchedulerDiagnostics {
  running: boolean;
  tickCount: number;
  lastTickAt: string | null;
  uptimeMs: number;
  activeJobCount: number;
  activeJobIds: string[];
  missedFireCount: number;
  totalDispatchCount: number;
  totalFailureCount: number;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface ActiveRunEntry {
  runId: string;
  jobId: string;
  pluginId: string;
  status: string;
  startedAt: string;
  ageMs: number;
}

export interface SchedulerHealthResponse {
  status: "healthy" | "degraded" | "stopped";
  scheduler: SchedulerDiagnostics;
  activeRuns: ActiveRunEntry[];
  timestamp: string;
}

/* ------------------------------------------------------------------ */
/*  API client                                                         */
/* ------------------------------------------------------------------ */

export const schedulerHealthApi = {
  /**
   * GET /api/health/scheduler
   * Returns 200 when healthy/degraded, 503 when stopped.
   */
  get: async (): Promise<SchedulerHealthResponse> =>
    api.get<SchedulerHealthResponse>("/health/scheduler"),
};
