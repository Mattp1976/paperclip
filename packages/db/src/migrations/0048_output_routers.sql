-- output_routers — post-run delivery destinations (Slack, Drive, Gmail, …).
--
-- When a heartbeat run completes the server looks up matching routers and
-- dispatches the result. Each successful dispatch creates an
-- issue_work_products row (provider + externalId + url) so the delivery
-- shows up in the UI alongside other run artifacts.
--
-- v0.1 providers: slack_webhook (shippable today), google_drive + gmail
-- (schema-ready stubs, OAuth plumbing follows).

CREATE TABLE IF NOT EXISTS output_routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  filter JSONB,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS output_routers_company_enabled_idx
  ON output_routers (company_id, enabled);

CREATE INDEX IF NOT EXISTS output_routers_company_project_idx
  ON output_routers (company_id, project_id);
