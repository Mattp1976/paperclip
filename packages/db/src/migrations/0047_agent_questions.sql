-- agent_questions — blocking clarification questions from agents to humans.
--
-- Agents write a row here when they hit genuine ambiguity mid-run and
-- need the user to make the call before they can proceed. The UI
-- surfaces open questions as a popup; once the user answers, the agent
-- polls and resumes.
--
-- Status machine: open -> (answered | dismissed). "dismissed" means
-- the user said "your call" — agent treats as "no clarification
-- available, proceed on best guess."

CREATE TABLE IF NOT EXISTS agent_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  issue_id UUID NOT NULL REFERENCES issues(id),
  from_agent_id UUID NOT NULL REFERENCES agents(id),
  run_id UUID REFERENCES heartbeat_runs(id),
  question TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  answer TEXT,
  answered_by_user_id TEXT,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_questions_company_status_idx
  ON agent_questions (company_id, status);

CREATE INDEX IF NOT EXISTS agent_questions_issue_idx
  ON agent_questions (issue_id);

CREATE INDEX IF NOT EXISTS agent_questions_run_idx
  ON agent_questions (run_id);
