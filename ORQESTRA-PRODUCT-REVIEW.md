# Orqestra — Product & Architecture Review

A comprehensive snapshot of the Orqestra platform for next-phase planning. Captures product positioning, feature surface, architecture, data model, deployment, and current state as of v0.3.1 (April 2026).

---

## 1. What Orqestra Is

**Tagline:** *Open-source orchestration for zero-human companies.*

**Defining one-liner:** *If OpenClaw is an employee, Orqestra is the company.*

**Promise to the user:** *Manage business goals, not pull requests.*

Orqestra is a Node.js server + React UI that runs an **autonomous AI workforce** as if it were a real company. It's not a coding assistant, an inbox, or a project tracker — it's the **control plane** that sits above your agents (Claude Code, Codex, Cursor, Gemini, OpenCode, Pi, OpenClaw gateways, custom HTTP/process agents) and gives them an org chart, a budget, goals, governance, scheduled work, audit trails, and shared knowledge.

**The bet (from `/doc/GOAL.md`):** Autonomous AI companies will become a major economic force. Orqestra is the operating layer — the corporate operating system — that those companies run on. The success metric is whether Orqestra becomes the default foundation for autonomous companies and whether those companies, collectively, reach GDP-scale economic output.

**Three-step user pitch:**

| Step | Action | Example |
|------|--------|---------|
| 01 | Define the goal | *"Build the #1 AI note-taking app to $1M MRR."* |
| 02 | Hire the team | CEO, CTO, engineers, designers, marketers — any bot, any provider |
| 03 | Approve and run | Review strategy. Set budgets. Hit go. Monitor from the dashboard. |

**Coming soon (in README):** *Clipmart* — download and run entire companies in one click. Browse pre-built company templates with full org structures, agents, and skills.

---

## 2. Who It's For

- **Founders / operators** building autonomous businesses where the workforce is AI rather than humans.
- **Power users running 20+ Claude Code / Codex terminals at once** who currently have no way to coordinate, budget, or supervise them.
- **Teams running internal AI ops** that need governance, audit, and cost control on top of raw model access.
- **Agency-style buyers** who want to install a pre-shaped team (sales ops, content agency, research bench) and put it to work in minutes.

The product is deliberately *not* a chat IDE. It assumes the user delegates rather than codes.

---

## 3. Product Surface (Feature List)

### 3.1 Sidebar / Top-Level Navigation

URLs are scoped per company: `/{COMPANY_PREFIX}/{surface}` (e.g. `/FUT/dashboard`).

**Primary section** (operational, daily-use):

- **Dashboard** — KPIs, live runs, activity, leaderboard, charts.
- **Inbox** — task intake (recent, unread, all), one-tap "Route to…" delegation.
- **Standup** — daily PMO briefing per agent: *what you closed / what you're on / in the way*.
- **Outcomes** — high-level deliverables (the new Orchestra subsystem; see §6).
- **Outputs** — generated content library.
- **Tasks (Issues)** — full ticket list with filters.
- **Approvals** — gated decisions waiting on a human (or board).

**Workspace section** (configuring the work):

- **Projects** — portfolios with overview, issues, configuration, budgets.
- **Agents** — directory (all/active/paused/error), per-agent detail, run history, delegation graph, cost.
- **Swarm** — swarm-level coordination view.
- **Fleet** — install pre-wired teams into a company (see §3.4).
- **Goals** — objective tracking that issues can attach to.
- **Routines** — scheduled workflows (Beta).

**Company section** (settings & governance):

- **Organisation (Org Chart)** — reporting lines, roles, hierarchy.
- **Skills** — capability registry the planner/router uses to match work to agents.
- **Templates** — workflow templates library.
- **Costs** — spend tracking, forecasts, per-agent / per-adapter breakdown.
- **Activity** — immutable audit log.
- **Settings** — company config, secrets, import/export.
- **Help** — in-app docs.

**Plus:**

- **Plugin slot outlets** — third-party plugins can inject sidebar items, panels, command-palette actions, and custom routes.
- **Cmd+K command palette**, **Cmd+/** sidebar toggle, **Cmd+P** right panel toggle.

### 3.2 Cross-Cutting Capabilities

- **Bring Your Own Agent.** Any runtime, one org chart. Adapters for Claude Code, Codex (OpenAI), Cursor, Gemini, OpenCode, Pi, plus generic HTTP / process / OpenClaw gateway.
- **Goal Alignment.** Every task traces up to a project and a company goal — agents know *why* they're doing what they're doing.
- **Heartbeats.** Agents wake on a schedule, work, delegate up or down, then sleep. Not a chat loop.
- **Cost Control.** Per-agent and per-company monthly budgets; budget incidents escalate; spending tracked per cost event with adapter-level granularity.
- **Multi-Company.** Hard data isolation; one Orqestra instance can run many companies under one control plane.
- **Ticket System.** Full conversation trace, tool-call tracing, per-issue work products, comments, documents, attachments, read state, labels.
- **Governance.** Approve, override, pause any agent at any time. Approvals can gate execution before money is spent or actions are taken.
- **Org Chart.** Hierarchies, reporting lines, roles. Agents respect them when delegating.
- **Mobile Ready.** Layout supports swipe gestures and works on phones (status check, approvals).
- **Plugin System.** Two-mode extension: *slots* (inline UI extensions, sidebar/panel injection) and *launchers* (modal/floating actions). Server-side plugin runtime with state, jobs, webhooks, sandbox, event bus.
- **Memory + Skills.** Each agent has its own persona file (`SOUL.md`), execution checklist (`HEARTBEAT.md`), tools (`TOOLS.md`), and instructions (`AGENTS.md`). Skills are reusable capability bundles.
- **Company Portability.** Export an entire company (agents, skills, projects, tasks, images) to a portable bundle and re-import elsewhere. Already battle-tested: 113-agent Future Collective imported via this path.

### 3.3 Defining UI Components (Pages with character)

- **`Dashboard.tsx`** — 8-layer operational view: header → quick input → run results → KPI row → activity pill-bar → metrics grid → charts → leaderboard.
- **`Standup.tsx`** — daily briefing in three columns (closed / active / blockers), blockers-first sort.
- **`DelegationGraph.tsx`** — 200×120 SVG showing incoming/outgoing delegation edges weighted by issue count, embedded in AgentDetail.
- **`RouteToAction.tsx`** — one-tap delegate-to-agent popover with AI-ranked suggestions filtered by skill match.
- **`OnboardingWizard.tsx`** — 4 steps: company creation → agents → adapter selection → secrets + default CEO task ("hire engineer, write hiring plan, break roadmap and delegate").
- **`PluginManager.tsx`** — admin UI for plugin install/uninstall/enable/disable with two-step confirmation.
- **`Layout.tsx`** — main shell: sidebar, breadcrumbs, right panel, mobile gestures, dialogs for new issue/project/goal/agent.

### 3.4 Fleet Templates (the catalogue)

Defined in `packages/shared/src/fleet-templates.ts`. v0.1 catalogue:

| ID | Name | Tagline |
|----|------|---------|
| `content-agency` | Content Agency | A five-person content team that plans, researches, writes, edits, and ships. |
| `sales-ops` | Sales Ops | A four-person sales team that researches, reaches out, follows up, and keeps your CRM clean. |
| `agent-collective` | The Agent Collective | A CEO, a CFO, and a Research Director. The smallest team that feels like a company. |
| `solo-consultant` | Solo Consultant | Three agents that handle the work around the work. For the practitioner who is the practice. |

Installer (`/server/src/routes/fleet-templates.ts`):
1. Create agents in reporting order (CEOs first), build slug→id map.
2. Create projects, build name→id map.
3. Create starter tasks assigned to agents (via slug) and the first project.

Note: production "Future Collective" is a 113-agent company built by extending `agent-collective`. The portability/import-export path (see §6.6) is what lets users ship companies of arbitrary size between instances.

### 3.5 Voice (`/ui/VOICE.md`)

How the product talks to its user:

- **British English.** "organise", "customise", "colour".
- **Sentence case** for all UI copy except proper nouns and product name.
- **No trailing periods** on one-line copy (headings, buttons, labels).
- Always say **"task"** in user-facing copy, not "issue".
- Empty states: headline + one-sentence description. No filler ("get started").
- **`New`** beats `Add` for creation; `Add` only for adding existing items.
- Declarative, not addressed: *"Agents run work on schedules"* not *"Your agents will run…"*.
- Delegation verb is always **`Route to`** (not Assign / Delegate / Hand off).
- Tone: *"Write like a terse colleague. Short. Concrete. No marketing puff."*

---

## 4. Architecture — Repo Layout

Monorepo, pnpm 9.15.4 workspaces, Node 20+, TypeScript 5.7.

```
paperclip-build/
├── cli/                    # @orqestra/cli — local CLI (esbuild bundle), distributed via npm + GitHub
├── server/                 # @orqestra/server — Express 5 API + WebSocket + plugin runtime
├── ui/                     # @orqestra/ui — React 19 + Vite + Tailwind 4 frontend
├── desktop/                # @orqestra/desktop — Electron 33 shell wrapping server + ui
├── packages/
│   ├── shared/             # @orqestra/shared — zod-validated types, fleet templates, orchestra types
│   ├── db/                 # @orqestra/db — Drizzle ORM schema, 50 migrations, embedded-postgres support
│   ├── adapter-utils/      # @orqestra/adapter-utils — shared adapter base helpers
│   ├── adapters/
│   │   ├── claude-local/        # @orqestra/adapter-claude-local
│   │   ├── codex-local/         # @orqestra/adapter-codex-local
│   │   ├── cursor-local/        # @orqestra/adapter-cursor-local
│   │   ├── gemini-local/        # @orqestra/adapter-gemini-local
│   │   ├── opencode-local/      # @orqestra/adapter-opencode-local
│   │   ├── pi-local/            # @orqestra/adapter-pi-local
│   │   └── openclaw-gateway/    # @orqestra/adapter-openclaw-gateway (WebSocket-based remote)
│   └── plugins/
│       ├── sdk/                       # @orqestra/plugin-sdk — public plugin authoring API
│       ├── create-paperclip-plugin/   # NPM scaffolder (create-paperclip-plugin)
│       └── plugin-examples/           # hello-world, file-browser, kitchen-sink, smoke
├── scripts/                # 25 build/release/dev scripts
├── docs/                   # Mintlify documentation site
├── tests/                  # Playwright E2E + release-smoke
├── evals/                  # promptfoo eval harness
├── Dockerfile              # Multi-stage prod image, embeds postgres + adapters
└── railway.json            # Railway deploy config (port 3100, /health check)
```

### Tech stack at a glance

| Layer | Choice |
|-------|--------|
| Runtime | Node 20+, TypeScript 5.7.3, ES modules |
| Package manager | pnpm 9.15.4 |
| Backend | Express 5.1, ws 8.19, better-auth 1.4.18 |
| Database | PostgreSQL (managed in prod, embedded-postgres locally) via Drizzle 0.38 |
| Frontend | React 19, Vite 6.1, Tailwind 4.0.7, Radix + shadcn-style components, TanStack Query 5.90 |
| Routing | react-router 7.1.5 with custom company-prefix wrapper |
| Editor | MDX Editor 3.52, Mermaid 11.12 (diagrams) |
| Drag-and-drop | @dnd-kit suite |
| Auth | better-auth (sessions, OAuth, JWT) |
| Asset handling | sharp (images), pdfkit (PDFs), AWS S3 SDK (storage) |
| Desktop | Electron 33 + electron-builder 25 (macOS notarized) |
| Tests | Vitest 3.0.5 (~155 files), Playwright 1.58.2 (E2E) |
| Docs | Mintlify |
| CI / Releases | changesets, GitHub Actions, Railway auto-deploy from `master` |

---

## 5. Server — HTTP Surface

Server is Express 5 with ~31 route modules under `server/src/routes/`. Concrete file list (verified):

```
access · activity · admin-locks · agent-questions · agents · approvals
assets · authz · companies · company-skills · costs · dashboard
execution-workspaces · fleet-templates · goals · health · index
instance-settings · issues · issues-checkout-wakeup · llms · orchestra
org-chart-svg · output-routers · plugin-ui-static · plugins · projects
routines · secrets · sidebar-badges · standup
```

Representative endpoints:

- **Companies:** `POST /companies`, `GET /companies/:id`, `PATCH /companies/:id`, `POST /companies/:companyId/exports`, `POST /companies/import`, `POST /companies/import/preview`, `POST /companies/:id/imports/apply`.
- **Agents:** `POST /companies/:companyId/agents`, `GET /agents/:id`, `PATCH /agents/:id/config`.
- **Issues / Tasks:** `POST /companies/:companyId/issues`, `GET /issues/:id`, `PATCH /issues/:id/status`, `POST /issues/:id/comments`, `POST /issues/:id/checkout-wakeup`.
- **Orchestra (outcomes lifecycle):** `POST /companies/:companyId/orchestra/outcomes`, `GET /orchestra/outcomes/:id`, `POST /orchestra/outcomes/:id/plan`, `POST /orchestra/outcomes/:id/approve-plan`, `GET /orchestra/outcomes/:id/events` (SSE), `POST /orchestra/outcomes/:id/assembly-request`.
- **Approvals:** `POST /companies/:companyId/approvals`, `PATCH /approvals/:id`, `GET /approvals` (pending list).
- **Costs:** `GET /companies/:companyId/costs`, `GET /costs/breakdown`.
- **Plugins:** `POST /companies/:companyId/plugins/install`, `GET /plugins/:id/state`, `POST /plugins/:id/jobs`, plugin webhooks.
- **Workspaces:** `POST /companies/:companyId/execution-workspaces`, `POST /projects/:id/workspaces`, runtime service lifecycle.
- **Fleet:** `GET /fleet-templates`, `POST /companies/:companyId/fleet-templates/:templateId/install`.
- **Health:** `GET /api/health` returns deployment mode, exposure, version, authReady, bootstrapStatus.

Body parsing: `express.json({ limit: "50mb" })` — bumped from default 100KB to support large company import payloads (verified: was the blocker we hit during the Future Collective migration; fix shipped April 2026).

### Auth model

Two **deployment modes** controlled by env vars:

- `local_trusted` — dev mode, `X-Orqestra-Actor` header carries identity, no crypto.
- `authenticated` — production, requires session cookie or bearer token.

Two **actor types**:

- **Board (human user / admin)** — better-auth manages `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`. Authenticates via session cookie or `Authorization: Bearer <board_api_key>`.
- **Agent** — JWT (HS256, agent ID in payload) or `agent_api_keys` static key.

`actorMiddleware()` extracts in order: session cookie → `Authorization` header → `X-Orqestra-Actor` (only if `local_trusted`). Populates `req.actor = { type, id, company_id, role }` for route handlers. Two further guards: `assertBoard()` for admin-only routes, `assertCompanyAccess()` for tenant scoping.

Auth public base URL is configured via `PAPERCLIP_AUTH_PUBLIC_BASE_URL` env var (currently `https://www.orqestra.run` in prod, with `https://www.agentswarm.co.uk` still working as the legacy domain).

---

## 6. Data Model

Verified file list under `packages/db/src/schema/` — 60+ tables grouped here by domain:

### 6.1 Identity & access
`companies`, `company_logos`, `company_memberships`, `agents`, `agent_config_revisions`, `agent_runtime_state`, `agent_task_sessions`, `agent_wakeup_requests`, `agent_api_keys`, `board_api_keys`, `auth` (users/sessions/accounts/verifications), `instance_user_roles`, `principal_permission_grants`, `invites`, `join_requests`, `cli_auth_challenges`.

### 6.2 Work management
`issues`, `issue_comments`, `issue_documents`, `issue_attachments`, `issue_labels`, `issue_read_states`, `issue_work_products`, `issue_approvals`, `labels`, `goals`, `projects`, `project_goals`, `project_workspaces`, `execution_workspaces`, `workspace_operations`, `workspace_runtime_services`, `routines`.

### 6.3 Execution & telemetry
`heartbeat_runs`, `heartbeat_run_events`, `cost_events`, `finance_events`, `output_routers`.

### 6.4 Orchestra (outcomes lifecycle)
`orchestra` schema file contains: `outcomes`, `orchestra_plans`, `orchestra_plan_steps`, `orchestra_reviews`, `outcome_final_assemblies`. See §7 for lifecycle.

### 6.5 Governance
`approvals`, `approval_comments`, `agent_questions`, `agent_peer_notes`, `activity_log`, `budget_policies`, `budget_incidents`, `instance_settings`.

### 6.6 Plugins
`plugins`, `plugin_config`, `plugin_company_settings`, `plugin_state`, `plugin_entities`, `plugin_jobs`, `plugin_logs`, `plugin_webhooks`.

### 6.7 Assets, secrets, skills
`assets`, `documents`, `document_revisions`, `company_secrets`, `company_secret_versions`, `company_skills`.

**Migrations:** 50 SQL migration files under `packages/db/src/migrations/` (Drizzle generated, 0001 through 0049+). Most recent themes: output_routers, brand colors, orchestra phase tables.

**Key conventions:**
- UUID primary keys.
- Status fields are TEXT with enum validation in app code (not DB CHECKs) for migration ergonomics.
- Compound indexes on `(company_id, status, created_at)` typical.
- Foreign-key cascades enforce tenant isolation.

---

## 7. The Orchestra Subsystem (the "outcomes" engine)

Orchestra is Orqestra's **higher-order workflow engine**. It models *outcomes* (real deliverables, e.g. "competitive teardown of X", "pricing brief for Y") rather than tasks, and orchestrates a Planner → Executor → Reviewer → Assembler pipeline that delivers a final synthesised work product. Built across phases 1–7 (per task history: schema/types → planner → router → REST routes → UI stub → reviewer/assembler/hero workflow).

### Lifecycle (per `server/src/services/orchestra*`)

```
draft
  → planning            (POST /outcomes/:id/plan kicks the Planner agent)
  → ready_to_execute    (user approves the plan)
  → executing           (heartbeat spawns issues per plan step)
  → reviewing           (per-step Reviewer verdict on completion)
  → assembling          (Assembler synthesises step work products)
  → delivered           (final work product attached to outcome)
```

### Components

- **`outcomes`** table — title, brief, target_format, priority, deadline, `budget_limit_cents`, `executionMode` (`review_plan_first` | `direct_execute`), `orchestratorAgentId`, `finalWorkProductId`.
- **`orchestra_plans`** — versioned LLM-generated plans with `summary`, `assumptions`, `risks`, `requiredInputs`, `estimatedCostCents`, `estimatedDurationMinutes`, `confidenceScore`.
- **`orchestra_plan_steps`** — decomposed work units: `ordinal`, `title`, `stepType`, `acceptanceCriteria`, `reviewCriteria`, `outputRequirement`. Each links to an `Issue` once execution starts. Tracks `dependsOnStepIds` and `revisionCount` (max 2 retries).
- **`orchestra_reviews`** — per-step verdict: `accept` | `revise` | `escalate` | `auto_pass`, with `score`, `revisionInstructions`, `gaps`.
- **`outcome_final_assemblies`** — final synthesis: `assemblerAgentId`, `sourceWorkProductIds`, `structure`, `finalMarkdown`, `finalSummary`, `unresolvedLimitations`, `recommendedNextActions`.

### Services

- **`orchestra-planner.ts`** — calls the Planner agent (LLM) with outcome brief + project context, generates plan JSON, retries on parse failure.
- **`orchestra-router.ts`** — ranks agents against plan steps using their skills + capabilities; the same ranking powers `RouteToAction.tsx`.
- **`orchestra-step-completion.ts`** — triggered when a step's Issue completes; routes to Reviewer.
- **`orchestra-reviewer.ts`** — evaluates the work product against `acceptanceCriteria`; escalates to `approvals` if the step needs human sign-off.
- **`orchestra-assembler.ts`** — once all steps pass, gathers work products with provenance, calls the Assembler agent to merge into final markdown.
- **"Hero workflow"** — orchestrator-style top-level loop that drives an outcome through all phases without manual nudging.

This is the **planner/router/reviewer/assembler quadrant** that turns Orqestra from a ticket system into a true *delegating* orchestrator. It's also where the next-phase product opportunity is largest.

---

## 8. Adapters — How agents actually run

Located under `packages/adapters/*`. Each exposes `/server`, `/ui`, `/cli` subpath exports.

| Adapter | Connects to | Notes |
|---------|-------------|-------|
| `claude-local` | Claude Code (local) / Anthropic API | Default, most-used path |
| `codex-local` | OpenAI Codex / GitHub Copilot CLI | |
| `cursor-local` | Cursor IDE | |
| `gemini-local` | Google Gemini / GenAI | |
| `opencode-local` | OpenCode platform | |
| `pi-local` | Pi coding assistant | |
| `openclaw-gateway` | Distributed OpenClaw gateway over WebSocket | Remote agents |

Generic types also supported: `http` (POST to external service), `process` (spawn child process with timeout + grace period, stream stdout/stderr).

### Heartbeat → adapter flow

1. An Issue (or `orchestra_plan_step`) is assigned to an agent with a chosen adapter.
2. The **heartbeat service** invokes the adapter's `execute()` with prompt + tools + context.
3. The adapter handles the call (local CLI subprocess, HTTP, WebSocket, etc.).
4. Returns a **work product** (markdown, code, artifacts).
5. Heartbeat records a `cost_event` (tokens, compute time, adapter fee).
6. **Budget enforcement**: if spend exceeds the company / agent budget, an `approval` is automatically created and execution pauses.
7. **Execution workspace**: optionally clones the project's git repo and provisions runtime services (Docker, Node, Python) sandboxed per workspace. Tied to `execution_workspaces` and `workspace_runtime_services`.

This is the lowest layer of the stack — every adapter integration ultimately bottoms out here.

---

## 9. Plugin System

Two-mode extension model: **slots** (inline UI) and **launchers** (modal/floating actions).

### Server side

Each plugin has its own runtime with: `plugin_state` (KV store), `plugin_jobs` (async queue), `plugin_webhooks` (incoming events), `plugin_logs`, `plugin_entities` (custom data model), `plugin_company_settings` (per-tenant config), and a sandbox for plugin code execution. Plugins also have `plugin_jobs/runs` for async execution observability.

### UI side

- **Slots:** dynamic ESM imports from `/_plugins/:pluginId/ui/:entryFile`. Registered as `"${pluginKey}:${exportName}"`. Rendered by `PluginSlotOutlet` with per-plugin error boundaries. Context provided: `companyId`, `companyPrefix`, `projectId`, `entityId`, `entityType`, `parentEntityId`. Sidebar items and sidebar panels are slot consumers.
- **Launchers:** placement zones (`PLUGIN_LAUNCHER_BOUNDS`) for action buttons, panels, modals. Lifecycle managed by `PluginLauncherRuntimeContextValue`.
- **Plugin Manager UI (`/instance/settings/plugins`):** install by npm package name, enable/disable per-plugin, settings, two-step uninstall confirm.

### Plugin SDK

`@orqestra/plugin-sdk` is the public authoring API: protocol types, UI hooks (React 18+ peer dep), worker/sandbox APIs, testing helpers, dev-server (`paperclip-plugin-dev-server`). Companion scaffolder: `create-paperclip-plugin` (npm).

Examples shipping in-repo: `plugin-hello-world`, `plugin-file-browser`, `plugin-kitchen-sink`, `plugin-authoring-smoke` (with vitest).

---

## 10. Memory + Skills System (How agents "are someone")

Each agent has its own `$AGENT_HOME` directory containing a small set of conventional files:

- **`AGENTS.md`** — the agent's instructions: how to use the `para-memory-files` skill, PARA folder structure for organising knowledge, safety constraints (never exfiltrate secrets, no destructive commands without board approval).
- **`SOUL.md`** — the persona: strategic posture, voice, principles. The CEO template's `SOUL.md` includes posture like *"own P&L, default to action, hold long view, protect focus, optimise for learning/reversibility"* and voice rules like *"direct, terse like a board meeting, confident but not performative, plain language, own uncertainty"*.
- **`HEARTBEAT.md`** — the execution checklist the agent runs each time it wakes.
- **`TOOLS.md`** — the agent's tool catalogue.

**Memory layout:** PARA-style folder structure under each agent home. Three-layer system: knowledge graph + daily notes + tacit knowledge.

**Onboarding assets** live at `server/src/onboarding-assets/`:
- `ceo/` — full CEO template (SOUL/AGENTS/HEARTBEAT)
- `default/` — minimal default

**Skills** are reusable capability bundles registered per-company in the `company_skills` table and surfaced in `/skills`. The Orchestra Router uses skill metadata to rank agents for delegation.

**Companies as portable bundles** — defined in `docs/companies/companies-spec.md` (`agentcompanies/v1-draft`):
- `COMPANY.md` — root entrypoint
- `agents/<slug>/AGENTS.md` etc.
- `teams/<slug>/TEAM.md`
- `projects/<slug>/PROJECT.md`
- `skills/<slug>/SKILL.md`

This is what made the Future Collective import possible: 113 agents + skills + tasks + images shipped as a single inline payload, validated against the `companyPortabilityImportSchema`, materialised into a fully-formed company on the prod database in one POST.

---

## 11. Deployment

### Dockerfile

Multi-stage: `base → deps → build → production`. Production stage:
- Node LTS Trixie slim base.
- Globally installs `@anthropic-ai/claude-code@latest`, `@openai/codex@latest`, `opencode-ai`.
- Embedded postgres data dir cleaned on every restart (entrypoint shim).
- Runs as non-root `node` user with `HOME=/paperclip`.
- Listens on port 3100, env-driven config: `PAPERCLIP_HOME`, `PAPERCLIP_INSTANCE_ID`, `PAPERCLIP_CONFIG`, `PAPERCLIP_DEPLOYMENT_MODE=authenticated`, `PAPERCLIP_DEPLOYMENT_EXPOSURE=private`, `SERVE_UI=true`.
- Entry: `node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js`.

### Railway

`railway.json` config: builder = Dockerfile, healthcheck path `/health`, 300s timeout, restart policy ON_FAILURE (max 3 retries). Auto-deploys from GitHub `master`. Managed Postgres via `${{Postgres.DATABASE_URL}}` env reference.

**Live env vars on prod:**
- `BETTER_AUTH_SECRET` (better-auth signing key)
- `PAPERCLIP_DEPLOYMENT_MODE=authenticated`
- `PAPERCLIP_DEPLOYMENT_EXPOSURE=public`
- `PAPERCLIP_STORAGE_PROVIDER=local`
- `PAPERCLIP_SECRETS_PROVIDER=env`
- `DATABASE_URL` → managed Postgres
- `NODE_ENV=production`
- `PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://www.orqestra.run` (just swapped from `https://www.agentswarm.co.uk`)

### Domains

- `www.orqestra.run` — primary (CNAME → `s1nyh5j2.up.railway.app`, TXT verify on `_railway-verify.www`).
- `www.agentswarm.co.uk` — legacy, still serving (CNAME → different Railway edge).
- Both terminate TLS at Railway's edge and route to the same service.

### Distribution beyond hosted

- **CLI** — `npx orqestra` / `npx orqestra onboard --yes` for self-hosted local install. Distributed via npm + GitHub releases.
- **Desktop** — Electron 33 builds for macOS (notarised), Windows, Linux. Uses electron-updater for auto-update. Currently has stalled `desktop-release.yml` workflow waiting on PAT scope (task #61).

### Tests

- Vitest 3.0.5, ~155 test files across cli/server/ui/db/adapters.
- Playwright 1.58.2 for E2E. Auto-starts a server via `pnpm orqestra run`. 60s per test, HTML reports + traces.
- promptfoo evals harness in `evals/`.

---

## 12. Current State (April 2026)

- **Version:** v0.3.1 across all packages (cli, server, ui, db, shared, all adapters).
- **Recent themes (last ~30 days):**
  - **Rebrand from Paperclip → Orqestra** (Phase 1 user-visible, Phase 2 CLI binary `paperclipai → orqestra`, Phase 3 env vars + local dir with backwards compat).
  - **Internal package rename** `@mattparrytfc/* → @orqestra/*` across 459 files; missed Dockerfile filters caused silent Railway build failures, since fixed.
  - **Orchestra subsystem** built across phases 1–7: schema → planner → router → REST → UI stub → reviewer → assembler → hero workflow.
  - **Production deploy** to Railway with custom domain, managed Postgres, auth bootstrap.
  - **Domain swap** to `www.orqestra.run` (just completed: CNAME, TXT verify with 2FA via GoDaddy, env var update, redeploy).
  - **Future Collective import** — 113-agent company live on prod via the company-portability path; this drove the bump of `express.json` body limit to 50mb.
  - **UI polish** — copy audit, advanced-settings toggle, delegation graph, route-to-action, cost telemetry, outcome telemetry, standup digest, dashboard outcomes.
  - **Fleet templates** v0.1 catalogue shipped: agent-collective, solo-consultant, content-agency, sales-ops.
  - **Outputs/output_routers** subsystem added (migration 0048).

### Live state

- Prod: `https://www.orqestra.run/api/health` → 200, `version: 0.3.1`, `deploymentMode: authenticated`, `deploymentExposure: public`, `authReady: true`, `bootstrapStatus: ready`.
- 2 companies on prod: `Test Company` (TES) and `Future Collective` (FUT, 113 agents).

### Open or in-flight

- W4: polish pass + v0.x release (in_progress).
- W4: record 60–90s demo (pending).
- W2: delegation audit chain (in_progress).
- Orchestra Phase 2: Router (agent ranking) service (pending — partial, RouteToAction is shipped but the standalone service may not be).
- Bug: Railway healthcheck path mismatch `/health` vs `/api/health` (pending).
- Re-add `desktop-release.yml` workflow with right PAT scope (pending).

---

## 13. Strategic Reading — What's Distinctive

**Why this is a different shape than competitors:**

1. **Outcome-first, not chat-first.** The Orchestra subsystem makes the Planner → Reviewer → Assembler loop a first-class concept. Most competitors model AI work as a conversation; Orqestra models it as a *deliverable* with acceptance criteria, revisions, and synthesis.
2. **Org chart as primitive.** Reporting lines, roles, and delegation are real data, not metaphors. The DelegationGraph shows actual edges. Agents respect hierarchy when they `Route to`.
3. **Budget enforcement is automatic.** Cost events stream in per token; budget overruns generate approvals automatically. No "we'll alert you" — execution actually pauses.
4. **Companies are portable.** A 113-agent company shipped to prod over an HTTPS POST. This is the seed of Clipmart and a real network-effect lever.
5. **Plugin system is first-class.** Slots, launchers, server-side state/jobs/webhooks/sandbox. Plugins can ship custom routes, custom sidebar entries, custom modals — a real platform, not a webhook surface.
6. **Adapter promiscuity.** Seven first-party adapters plus generic HTTP/process means *any* coding agent or AI runtime plugs in. Not coupled to any one model vendor.
7. **Voice is governed.** `VOICE.md` is a real spec the UI is held to. Tells a story about who the buyer is.

---

## 14. Likely Next-Phase Themes (for the planning conversation)

Use these as prompts for the ChatGPT review. They are the obvious open seams:

- **Clipmart** — the company marketplace. Discovery, install, monetisation. Currently teased in README only.
- **Routines & schedulers** — Beta. Cron-style triggers + event triggers + LLM-driven triggers. The under-built corner of the product.
- **Approvals UX** — currently a list. Could be a real "decision queue" with bundled approvals, time-saving heuristics.
- **Outcomes-first dashboard** — current Dashboard is task-centric. Outcomes view is newer; could become the default home for board users.
- **Costs & forecasting** — the data is rich (per-cost-event with adapter granularity). The UI is mostly tabular. Real forecasting + anomaly detection could be a wedge.
- **Multi-instance / federation** — one Orqestra control plane managing many tenants is supported in code; the operator-facing surface is thin.
- **Agent capability matching** — the Router service has a good base but the skill-metadata format is still loose. A richer capability protocol could make routing dramatically better.
- **Mobile native** — currently mobile-web. A native app for the approvals/standup loop would be the "phone-as-board-room" experience.
- **Desktop release pipeline** — stalled on PAT scope. Code-signing + notarisation done; auto-updater wired. Just needs the workflow re-added.
- **Plugin marketplace + SDK polish** — the plugin runtime is solid, but discoverability + author tooling is light.

---

## 15. Where to look in the code (for follow-up dives)

| Surface | Path |
|---------|------|
| Server entry | `server/src/index.ts` |
| Routes | `server/src/routes/*.ts` |
| Auth middleware | `server/src/middleware/actor.ts` |
| Orchestra services | `server/src/services/orchestra*.ts` |
| Heartbeat (execution loop) | `server/src/services/heartbeat.ts` |
| Adapters | `packages/adapters/*/src/` |
| DB schema | `packages/db/src/schema/*.ts` |
| Migrations | `packages/db/src/migrations/*.sql` |
| Shared types | `packages/shared/src/types/*.ts` |
| Fleet templates | `packages/shared/src/fleet-templates.ts` |
| Orchestra types | `packages/shared/src/orchestra-templates.ts` |
| Company portability schemas | `packages/shared/src/validators/company-portability.ts` |
| UI router + company prefix | `ui/src/router.tsx`, `ui/src/lib/company-routes.ts` |
| UI voice | `ui/VOICE.md` |
| Onboarding assets | `server/src/onboarding-assets/` |
| Plugin SDK | `packages/plugins/sdk/` |
| Vision doc | `doc/GOAL.md`, `doc/PRODUCT.md` |
| Architecture overview | `docs/SYSTEM-OVERVIEW.md` |
| Companies spec | `docs/companies/companies-spec.md` |
| README | `README.md` |
| Dockerfile | `Dockerfile` |
| Railway config | `railway.json` |

---

*End of review. Drop this into ChatGPT as the source-of-truth context for the next-phase planning conversation.*
