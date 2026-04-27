# Orqestra — System Overview

> Generated 2026-04-27. A snapshot of what's built, how it's wired together, and where the seams are. Audience: a smart collaborator (LLM or human) being briefed for the first time so they can help plan improvements.

## 1. What is Orqestra?

Orqestra is a **self-hostable platform for running AI agent fleets**. A user defines "companies" (tenants) populated with **agents** that work autonomously on **tasks** (called "issues" internally — the rename to "tasks" is mid-migration through the UI). Agents can delegate to each other, are gated by **approvals** when their work crosses budget or risk thresholds, and report back through a **standup**, **dashboard**, and pluggable **output routers** (Slack today, Drive/Gmail scaffolded).

The product runs in three modes:

- **Local trusted** (CLI dev mode) — single user, no auth, file-based config under `~/.paperclip`.
- **Authenticated, public** — what's deployed at `www.agentswarm.co.uk`. Email/password (better-auth), multi-tenant, Postgres-backed.
- **Hosted** — same as the public mode, intended footprint for a managed offering.

Live deploy: `https://www.agentswarm.co.uk` (Railway, Postgres add-on, server `0.3.1`).

## 2. Repo layout (monorepo, pnpm workspaces)

```
paperclip-build/
├── packages/
│   ├── shared/          @mattparrytfc/shared      types, validators, fleet-templates, prompt builders
│   ├── db/              @mattparrytfc/db          drizzle schema (61 tables) + 50 migrations
│   ├── plugins/sdk/     @mattparrytfc/plugin-sdk  plugin manifest, capability decls, helpers
│   └── adapter-utils/                             shared bits for adapters
├── server/              @mattparrytfc/server      express API, services, heartbeat, plugin runtime
├── ui/                  @mattparrytfc/ui          React + Vite SPA (46 pages)
├── cli/                 @mattparrytfc/paperclipai CLI entry point (`paperclipai`)
├── desktop/             @mattparrytfc/desktop     Electron wrapper (scaffolded; not packaged)
├── docs/                                          plans, audits, deploy notes, voice guide
├── scripts/                                       dev runner, release, backups
├── Dockerfile                                     prod image (server + UI dist + migrations)
└── railway.json                                   Railway service config
```

Build entry points: `pnpm dev` (server + UI watch), `pnpm typecheck` (`tsc -b` across all), `pnpm build`, `pnpm paperclipai <cmd>`.

## 3. Runtime stack

| Layer | Tech |
|---|---|
| Server | Node 20 + Express + TypeScript + Drizzle ORM + better-auth |
| DB | Postgres (Railway add-on in prod; local Postgres or sqlite-style file in dev) |
| UI | React 18 + Vite + Tailwind + shadcn-ish primitives + react-query + react-router (custom small wrapper in `ui/src/lib/router.ts`) |
| Realtime | SSE + a small "live events" bus on the server |
| Auth | better-auth (email/password + magic link), JWT for agent tool calls |
| LLM adapters | Anthropic, OpenAI, Codex, Cursor — registered in `server/src/adapters/registry.ts`; one is `process` (spawns Claude Code etc.) |
| Plugin runtime | In-process worker manager + scheduler + lifecycle + tool dispatcher |
| Container | Single Dockerfile, ENTRYPOINT clears `/paperclip/instances/default/db` on boot (this is intentional for ephemeral dev, **probably wrong for prod** — see §11 quirks) |

## 4. Domain model (the data primitives)

There are **61 tables** in `packages/db/src/schema/`. The conceptual core:

```
Instance                          (one per deployment; settings live in instance_settings)
└── Company  (= tenant)           companies, company_memberships, company_secrets, company_skills
    ├── Agent                     agents (CEO / manager / specialist roles, chain of command)
    │   ├── AgentPermissions      per-tool / per-resource grants
    │   ├── AgentEnvConfig        env bindings (plain values + secret refs)
    │   ├── AgentChainOfCommand   reportsTo + delegation graph
    │   └── AgentRuntimeState     last heartbeat, idle/running/paused/error
    ├── Project                   projects (codebase refs, workspace policies)
    │   └── Issue (= "task")      assignee, parent, label, status, priority, body, attachments
    │       ├── IssueDocument     associated docs (revisioned)
    │       ├── IssueAttachment   files/screens/blobs
    │       ├── IssueComment      thread
    │       ├── IssueWorkProduct  the actual delivered output (link, file, summary)
    │       └── HeartbeatRun      one row per execution attempt + heartbeat_run_events trail
    ├── Goal                      strategic priorities; issues can ref a goal
    ├── Routine                   scheduled / event-triggered work spec
    │   └── RoutineRun            one execution
    ├── Approval                  human-in-the-loop gate; ApprovalComment thread
    ├── BudgetPolicy              spend caps per company / per agent / per scope
    │   └── BudgetIncident        breaches + resolution history
    ├── CostEvent                 every LLM/API charge tied to (agent, run, issue, biller)
    ├── FinanceEvent              wider money/credit tracking (subscriptions, top-ups)
    ├── OutputRouter              destinations for run outputs (Slack/Drive/Gmail)
    ├── ExecutionWorkspace        the sandbox where an agent's process runs
    └── Plugin / PluginEntity / PluginJob / PluginJobRun / PluginWebhookDelivery
```

Other notable tables: `agent_questions` (agent-asks-user), `agent_peer_notes` (agent-to-agent), `activity_log`, `assets`, `documents` + `document_revisions`, `instance_user_roles`, `invites`, `join_requests`, `cli_auth_challenges`, `agent_api_keys`, `board_api_keys`, `agent_wakeup_requests`, `agent_task_sessions`, `workspace_operations`.

## 5. The execution loop (how an agent actually runs)

This is the hot path. Read `server/src/services/heartbeat.ts` to dig in (~2,700 lines).

```
[scheduler tick]
   │
   ▼
heartbeatService.tick()
   │
   ├─ 1. Find runnable issues (assigned to agent, not blocked, no active workspace)
   │
   ├─ 2. For each → reserve an ExecutionWorkspace (process / external / docker)
   │       gate via ProjectExecutionWorkspacePolicy
   │       check BudgetPolicy via budgetHooks; if over, file BudgetIncident + cancel
   │
   ├─ 3. Build the adapter config:
   │       - agent system prompt (skills + permissions + chain-of-command)
   │       - issue context (parent issue, project codebase, goal ref, attachments)
   │       - env bindings (resolved from CompanySecrets)
   │       - workspace paths
   │
   ├─ 4. Spawn the adapter (process adapter = spawn CLI like `claude`, `codex`, `cursor`)
   │       stream stdout → parse → emit heartbeat_run_events
   │       capture cost markers → CostEvent rows
   │       on agent question → AgentQuestion (surfaced in Inbox)
   │
   ├─ 5. On terminal state:
   │       finalize HeartbeatRun (status, resultJson)
   │       create IssueWorkProduct row
   │       dispatch via outputRouterService (Slack/Drive/Gmail)  ← new in this sprint
   │       release workspace
   │       promote next dependent issue (releaseIssueExecutionAndPromote)
   │
   └─ 6. Run-recovery: ghost-run detector reaps orphaned executions
```

The scheduler also drives **plugin jobs** (cron-like, isolated worker manager) and **routines** (cron + event-triggered issue creation).

## 6. UI surface (46 pages)

Sidebar groups:

**Top of nav** — Dashboard, Inbox, Standup, Outputs, Tasks, Approvals.

**WORKSPACE** — Projects, Agents, Swarm, Fleet, Goals, Routines.

**COMPANY** — Organisation, Skills, Templates, Costs, Activity, Settings.

Notable pages and what they do:

- **Dashboard** — Hero KPIs (agents, active tasks, month spend, approvals), `SpendTrendStrip` (this week / last week / month), `PillRunChart` (run activity), `UpNextCard`, `ProgressGauge`, `BudgetForecast`, `AgentLeaderboard`, `AgentOutcomesTable` (per-agent resolved-task counts + cost-per-task), `WelcomeZeroState` (3-step onboarding).
- **Inbox** — Aggregated list of work items needing user attention. Kinds include: agent question, approval, review (parent-agent reviewing child's work), tagged comment. New `RouteToAction` lets you one-tap delegate from a row using `rankAgentsForTask` heuristic.
- **Standup** — Per-agent "yesterday / today / blockers". Daily digest can be copied as email-ready markdown (`renderStandupDigestMarkdown`).
- **Outputs** — Timeline of `IssueWorkProduct` rows grouped by date.
- **Tasks** (issues board) — kanban + list; full IssueDetail page with comments, attachments, work products, related runs.
- **Approvals** — Queue + ApprovalDetail with sage variant Approve button.
- **Projects** — List + ProjectDetail (codebase refs, execution policies, issues).
- **Agents** — List by status; AgentDetail with sub-tabs (I/O, performance, guardrails, security, memory) plus the new **DelegationGraph** (visualises who reports to whom + cost-per-task strip).
- **Swarm / Fleet** — Live view of currently-running agents.
- **Goals** — Strategic priorities, issues that ladder up.
- **Routines** — Scheduled and event-triggered work. Beta.
- **Organisation** — Company-level settings + members.
- **Skills** — Markdown skills authored at the company level; agents reference them. Importable from disk, scannable from a project, etc.
- **Templates** — Two tabs: **New company** (full bootstrap of agents+projects+tasks) and **Starter team** (install a fleet template into existing company). Four starter teams: Agent Collective, Content Agency, Solo Consultant, Sales Ops.
- **Costs** — Spend by agent / model / biller / project / issue. `friendlyCost` formatting throughout.
- **Activity** — Append-only audit feed.
- **Settings** — Identity, brand, defaults; experimental toggles under `AdvancedSection`.

UI primitives worth knowing: `PageHeader`, `SoftCard`, `EmptyState`, `ChartCard`, `Toast` (now supports both href and onClick actions), `AdvancedSection` (collapsible with sage UX).

## 7. Agents, skills and the "company skill" library

An agent has:

- **Identity** — name, role (`ceo` / `manager` / `specialist`), title.
- **Capabilities** — a rich paragraph that doubles as the prompt seed.
- **Adapter** — which engine runs it (process-based with `claude`, `codex`, `cursor`, etc.).
- **Permissions** — fine-grained grants per tool + per resource scope.
- **Env** — bindings to plain values or `CompanySecret` versions.
- **Chain of command** — `reportsTo` plus a delegation graph view.
- **Budget** — optional monthly cap; otherwise inherits company default.
- **Skills** — references to `CompanySkill` rows (markdown bundles like `legal/nda-triage`, `data/sql-queries`, etc.) imported from disk or the plugin marketplace.

`CompanySkill` is the company-scoped library: each entry has a markdown SKILL.md, a file inventory, trust level, source provenance, and update status. Agents pull these into their context dynamically.

## 8. Plugin system

Heavily plumbed but library is sparse. A `OrqestraPluginManifestV1` declares **jobs** (cron), **webhooks** (inbound HTTP), **tools** (callable from agents), **UI slots** (slot outlet rendering), and **launcher actions** (custom new-task buttons). Lifecycle:

- `pluginRegistryService` — install / update / disable.
- `pluginLifecycleManager` — load + boot + reload-on-watch.
- `createPluginWorkerManager` — sandboxed in-process workers per plugin.
- `createPluginJobScheduler` — runs declared cron jobs.
- `createPluginToolDispatcher` — exposes plugin tools to agent runtime.
- `createPluginEventBus` — pub/sub for plugin → host events.
- `createRunRecoveryService` — reaps stuck plugin job runs (ghost-run detector).

Persistence: `plugin`, `plugin_state`, `plugin_entities`, `plugin_jobs`, `plugin_job_runs`, `plugin_webhook_deliveries`. Plugins can declare their own entity tables via `PluginEntityRecord`.

## 9. Costs, budgets, finance

Every LLM call writes a `CostEvent` (agent, model, biller, project, issue, run, costCents, tokens). The `costs` service rolls these up multiple ways — by agent, by model, by biller (Anthropic / OpenAI / etc.), by project, by issue, by agent×model. `AgentOutcome` aggregates resolved-task count + spend → cost-per-task.

`BudgetPolicy` defines spend caps at three scopes (company / agent / scope tag). Heartbeat checks before reserving a workspace; on breach, a `BudgetIncident` is filed and the run is cancelled. `cancelBudgetScopeWork` propagates to in-flight runs. There's an explicit `KillSwitch` UI on the dashboard.

`FinanceEvent` covers wider money flows (subscriptions, credits, top-ups) — distinct from `CostEvent` which is API consumption.

## 10. Output routing

Pluggable post-run delivery, introduced this sprint. `outputRouterService` resolves all routers attached to the company (filtered by run outcome / project / agent), then for each calls a provider-specific dispatcher:

- **Slack webhook** — implemented. Posts a formatted run summary block.
- **Google Drive** — scaffolded; not functional.
- **Gmail** — scaffolded; not functional.

Failures don't kill the heartbeat — they get filed as a failed `IssueWorkProduct` row so users can see what didn't deliver. The dispatch is wrapped in try/catch as a second safety net.

## 11. Auth + multi-tenancy

- **better-auth** for end-user auth (email/password, magic link).
- **Instance role** (`instance_user_roles`) — global perms (admin / member).
- **Company memberships** — per-company roles (owner / member / viewer).
- **Invites** + **JoinRequests** for joining a company.
- **Agent API keys** + **Board API keys** + **CLI auth challenges** — non-human auth for runtime + CLI flows.
- **Principal permission grants** — fine-grained ACL.
- Multi-tenant URL scheme: `/{COMPANY_SLUG}/...` (e.g. `/TES/dashboard`).
- `private-hostname-guard` middleware blocks non-allowed hostnames in `private` deployment exposure.
- `boardMutationGuard` blocks mutations from board API keys (read-only).

## 12. Recent ship list (last 30-day sprint, all live on prod as of 2026-04-27)

| Group | What shipped |
|---|---|
| G1 — Cleanup | Removed `_tmp_*` garbage files |
| G2 — Docs | 30-day plan, dogfooding doc, enterprise plan, audit, broken-windows log, VOICE.md, release notes |
| G3 — Deploy | `railway.json`, deploy docs (Railway dashboard + CLI variants), status doc |
| G4 — Desktop | Electron wrapper scaffold (Mac signing/notarize entitlements, package script — not yet packaged) |
| G5 — Output routers | DB schema (`output_routers` + 0048 migration), service, routes, Slack provider |
| G6 — Fleet templates | Type spec, 4 starter teams, installer route, Templates page tab switcher, FleetTemplates component |
| G7 — Standup digest | Daily digest assembly, email-ready markdown renderer, /standup/digest endpoint, copy-to-clipboard UI |
| G8 — Cost telemetry | `CostByIssue` + `AgentOutcome` types, /costs/by-issue + /outcomes/by-agent endpoints, helpers in costs service |
| G9 — Delegation graph | `DelegationGraph` component on AgentDetail with cost-per-task strip; "Assign Task" → "Route Task" copy |
| G10 — Advanced section | Collapsible primitive rolled to NewAgent, CompanySettings, InstanceExperimentalSettings |
| G11 — Inbox routing | `RouteToAction` popover + `rankAgentsForTask` heuristic; Review row kind for parent-agent reviews |
| G12 — Dashboard outcomes | `AgentOutcomesTable`, `SpendTrendStrip`, `prevWeek7dSpendCents` field on dashboard summary |
| G13 — UI polish | Site-wide copy audit (sentence case, "task" not "issue"), slug-tolerant ID regex on activity/agents routes, heartbeat → output routers wiring, ToastAction.onClick variant |

## 13. Known quirks / improvement targets (honest list)

These are the seams that I'd point an improvement-planner at:

1. **Healthcheck path mismatch** — `railway.json` has `healthcheckPath: "/health"` but actual API health is `/api/health` (mounted under the `api` Express router). The SPA fallback returns 200 for `/health`, so Railway never actually verifies the API is up. Cosmetic at the moment, dangerous if a future deploy breaks the API.
2. **Dockerfile clears `/paperclip/instances/default/db` on boot** — fine for ephemeral dev, almost certainly wrong for the Railway production image. Need a Railway volume mounted at `/paperclip` for persistence.
3. **"Issues" → "Tasks" rename mid-flight** — UI copy mostly says "task" but URL paths, table names, types, and several services still use "issue". Half-migrated names cause friction.
4. **Sign-up flow not yet exercised on prod** as a fresh user — the persisted CEO session bypassed it during last verification. Bootstrap returns `authReady: true, bootstrapInviteActive: false` so it should work, but it's untested.
5. **Plugin marketplace is empty** — full lifecycle is plumbed but no first-party plugins ship in the box. Worth a v0.x decision: do we seed a few?
6. **Output routers**: only Slack works. Drive + Gmail are scaffolded and routed but not implemented — provider methods are stubs.
7. **Adapter types**: only the `process` adapter is fully fleshed out. `http` and external Claude-Code-via-CLI variants exist but are minimally tested. No first-class managed-Claude adapter that uses the Anthropic API directly.
8. **Cost telemetry** is per-run; per-task aggregation works via roll-ups but there's no rule engine for amortising costs across multi-run tasks.
9. **No live observability layer** — heartbeat events stream to a DB table, surfaced via SSE in the UI, but there's no metric export (Prometheus / OTel) for the deployment itself.
10. **Desktop wrapper** is scaffolded (Electron + electron-updater + signing entitlements) but not yet packaged or released. The GitHub Actions workflow for it is held back from the main repo because the PAT used to push lacks the `workflow` scope.
11. **Workspace runtime providers**: only `process` works in prod. `docker` and `external` strategies are typed but not wired.
12. **Fleet templates** are static — no UI for authoring custom templates. Power users would want this.
13. **Run recovery / ghost-run detection** runs on a fixed cadence — there's no SLA targeting or alerting if the queue depth grows.
14. **No team / sharing flows for agent skills** — `CompanySkill` is per-tenant; there's no org-level skill library or import-from-other-company UX.
15. **better-auth integration** is mostly "off the shelf" — no SSO, no SAML, no multi-factor.
16. **Search** — there's no global search across issues / agents / docs / outputs. Command palette is keyboard-shortcuts only.
17. **The `process` adapter** spawns CLIs as child processes; it requires the host to have those CLIs installed. The Dockerfile installs Claude Code but adding more adapters means rebuilding the image.
18. **G3 commit shipped without `desktop-release.yml`** because the push PAT lacks `workflow` scope — needs re-adding once that's resolved.

## 14. Tech stack quick reference

```
TypeScript everywhere
pnpm 9.x workspaces
Node 20

Server:
  express, drizzle-orm, better-auth, pino (logger), pg (postgres driver)
  zod (validation, all incoming payloads), @paralleldrive/cuid2 (ids)
  child_process (process adapter), node-pty (PTY for richer process), execa
  bullmq (in-memory queues), node-cron, Server-Sent Events
  vitest (tests)

UI:
  react 18, vite, tailwind, react-query (@tanstack/react-query)
  custom router (ui/src/lib/router.ts), recharts, lucide-react
  cmdk (command palette), framer-motion (some, sparingly)
  vitest

CLI:
  commander, chalk, ora, tsx (runtime)

Plugin SDK:
  zod, JSON Schema declarations for jobs/tools/UI slots
```

Migration story: drizzle-kit `generate` + `migrate`. Production runs migrations on container boot.

## 15. How a typical day flows on a live tenant

1. User signs in → lands on `/{COMPANY}/dashboard`.
2. Dashboard shows yesterday's results, month spend, what's up next.
3. User opens **Inbox** → sees agent questions + reviews + tagged comments. Optionally one-tap routes a review to another agent via `RouteToAction`.
4. User opens **Standup** → reads the daily digest, copies to clipboard for email.
5. Heartbeat scheduler ticks every N seconds; runnable issues get assigned, workspaces reserved, adapter runs, costs recorded.
6. As an agent finishes work, output routers (Slack today) post the result; an `IssueWorkProduct` lands in **Outputs**.
7. If an agent hits a budget cap or asks a question, an **Approval** or **AgentQuestion** is created and surfaced in Inbox.
8. End of day, dashboard reflects new outcomes; per-agent cost-per-task updates in `AgentOutcomesTable`.

## 16. Quick links into the codebase

| Concern | File |
|---|---|
| Server bootstrap | `server/src/app.ts`, `server/src/index.ts` |
| Heartbeat / execution loop | `server/src/services/heartbeat.ts` |
| Issue lifecycle | `server/src/services/issues.ts` |
| Costs roll-up | `server/src/services/costs.ts`, `server/src/services/dashboard.ts` |
| Output routing | `server/src/services/output-routers.ts`, `server/src/services/routers/slack.ts` |
| Fleet template installer | `server/src/services/fleet-templates.ts`, `server/src/routes/fleet-templates.ts` |
| Standup digest | `server/src/services/standup.ts`, `packages/shared/src/standup-digest.ts` |
| Adapter contract | `server/src/adapters/types.ts`, `server/src/adapters/registry.ts` |
| Process adapter | `server/src/adapters/process/{execute,test,index}.ts` |
| Plugin runtime | `server/src/services/plugin-*.ts`, `server/src/services/run-recovery.ts` |
| Auth (better-auth) | `server/src/auth/*` |
| DB schema (61 tables) | `packages/db/src/schema/*.ts` |
| Migrations (50) | `packages/db/src/migrations/*.sql` |
| Fleet templates spec | `packages/shared/src/fleet-templates.ts` |
| Dashboard UI | `ui/src/pages/Dashboard.tsx` + `ui/src/components/dashboard/*` |
| Inbox UI | `ui/src/pages/Inbox.tsx` + `ui/src/lib/inbox.ts` + `ui/src/components/RouteToAction.tsx` |
| Routing/queryKeys | `ui/src/lib/router.ts`, `ui/src/lib/queryKeys.ts` |
| Voice/style guide | `docs/ui/VOICE.md` |
| 30-day plan | `docs/PLAN-30D.md`, `docs/HANDOFF-30D.md` |
| Audit | `docs/AUDIT-2026-04-22.md` |
