-- agent_peer_notes — lightweight peer messages between agents on a task.
--
-- Separate from `issue_comments` because peer notes have an addressing model
-- (to_agent_id + optional acknowledgement/resolution) and a distinct UI
-- surface ("agent whisper" lane) rather than flat human conversation.
--
-- When to_agent_id is NULL the note is broadcast to anyone working on the task
-- (e.g. a manager agent sharing context with the whole team).

CREATE TABLE IF NOT EXISTS agent_peer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  issue_id UUID NOT NULL REFERENCES issues(id),
  from_agent_id UUID NOT NULL REFERENCES agents(id),
  to_agent_id UUID REFERENCES agents(id),
  run_id UUID REFERENCES heartbeat_runs(id),
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_peer_notes_issue_idx
  ON agent_peer_notes (issue_id);

CREATE INDEX IF NOT EXISTS agent_peer_notes_company_idx
  ON agent_peer_notes (company_id);

CREATE INDEX IF NOT EXISTS agent_peer_notes_to_agent_idx
  ON agent_peer_notes (to_agent_id);

CREATE INDEX IF NOT EXISTS agent_peer_notes_company_issue_created_idx
  ON agent_peer_notes (company_id, issue_id, created_at);
