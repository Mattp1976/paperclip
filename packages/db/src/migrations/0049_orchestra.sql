-- Orchestra — outcome-led orchestration layer.
--
-- Five tables that sit on top of the existing Issue / IssueWorkProduct /
-- HeartbeatRun / CostEvent stack. Existing flows are unchanged; orchestra
-- creates Issues via the existing service and lets the heartbeat run them.
--
-- Status enums kept as TEXT (no DB-level CHECK) so we can add states in
-- shared/validators/orchestra.ts without a migration. Indexes per the
-- product brief: (company_id), (outcome_id), (plan_id), (status),
-- (created_at), (assigned_agent_id), (issue_id).

CREATE TABLE IF NOT EXISTS outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_by_user_id TEXT,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  priority TEXT NOT NULL DEFAULT 'medium',
  risk_level TEXT,
  budget_limit_cents INTEGER,
  deadline TIMESTAMPTZ,
  target_format TEXT NOT NULL DEFAULT 'report',
  execution_mode TEXT NOT NULL DEFAULT 'review_plan_first',
  orchestrator_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  final_work_product_id UUID REFERENCES issue_work_products(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outcomes_company_status_idx ON outcomes (company_id, status);
CREATE INDEX IF NOT EXISTS outcomes_company_created_idx ON outcomes (company_id, created_at);
CREATE INDEX IF NOT EXISTS outcomes_project_idx ON outcomes (project_id);

CREATE TABLE IF NOT EXISTS orchestra_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_id UUID NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  summary TEXT NOT NULL,
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_cost_cents INTEGER,
  estimated_duration_minutes INTEGER,
  confidence_score DOUBLE PRECISION,
  created_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orchestra_plans_outcome_idx ON orchestra_plans (outcome_id, version);
CREATE INDEX IF NOT EXISTS orchestra_plans_status_idx ON orchestra_plans (status);
CREATE INDEX IF NOT EXISTS orchestra_plans_company_idx ON orchestra_plans (company_id);

CREATE TABLE IF NOT EXISTS orchestra_plan_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES orchestra_plans(id) ON DELETE CASCADE,
  outcome_id UUID NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  parent_step_id UUID REFERENCES orchestra_plan_steps(id) ON DELETE SET NULL,
  ordinal INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  recommended_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
  depends_on_step_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_requirement TEXT,
  revision_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orchestra_plan_steps_plan_ordinal_idx ON orchestra_plan_steps (plan_id, ordinal);
CREATE INDEX IF NOT EXISTS orchestra_plan_steps_outcome_idx ON orchestra_plan_steps (outcome_id);
CREATE INDEX IF NOT EXISTS orchestra_plan_steps_status_idx ON orchestra_plan_steps (status);
CREATE INDEX IF NOT EXISTS orchestra_plan_steps_issue_idx ON orchestra_plan_steps (issue_id);
CREATE INDEX IF NOT EXISTS orchestra_plan_steps_assigned_agent_idx ON orchestra_plan_steps (assigned_agent_id);

CREATE TABLE IF NOT EXISTS orchestra_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_id UUID NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES orchestra_plans(id) ON DELETE CASCADE,
  step_id UUID REFERENCES orchestra_plan_steps(id) ON DELETE CASCADE,
  reviewed_work_product_id UUID REFERENCES issue_work_products(id) ON DELETE SET NULL,
  reviewer_agent_id UUID NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'pending',
  score INTEGER,
  comments TEXT,
  revision_instructions TEXT,
  gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orchestra_reviews_outcome_idx ON orchestra_reviews (outcome_id);
CREATE INDEX IF NOT EXISTS orchestra_reviews_step_idx ON orchestra_reviews (step_id);
CREATE INDEX IF NOT EXISTS orchestra_reviews_status_idx ON orchestra_reviews (status);

CREATE TABLE IF NOT EXISTS outcome_final_assemblies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_id UUID NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES orchestra_plans(id) ON DELETE CASCADE,
  assembler_agent_id UUID NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'pending',
  source_work_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  structure JSONB,
  final_markdown TEXT,
  final_summary TEXT,
  unresolved_limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_next_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_work_product_id UUID REFERENCES issue_work_products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outcome_final_assemblies_outcome_idx ON outcome_final_assemblies (outcome_id);
CREATE INDEX IF NOT EXISTS outcome_final_assemblies_status_idx ON outcome_final_assemblies (status);
