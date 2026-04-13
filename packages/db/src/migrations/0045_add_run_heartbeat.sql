-- Phase 2: Run State Machine — add heartbeat tracking for ghost run detection
--
-- Adds a `last_heartbeat_at` column to `plugin_job_runs` so the recovery
-- sweeper can detect runs that have stopped heartbeating (presumed crashed).
--
-- The scheduler updates this column periodically during job execution.
-- Runs whose `last_heartbeat_at` is older than the TTL (default 5 min)
-- are marked as failed by the heartbeat sweeper.

ALTER TABLE plugin_job_runs
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

-- Index for the heartbeat sweeper query: find running runs with old heartbeats
CREATE INDEX IF NOT EXISTS idx_plugin_job_runs_heartbeat_sweep
ON plugin_job_runs (status, last_heartbeat_at)
WHERE status = 'running';

-- Index for startup recovery: find non-terminal runs efficiently
CREATE INDEX IF NOT EXISTS idx_plugin_job_runs_active
ON plugin_job_runs (status)
WHERE status IN ('queued', 'running');
