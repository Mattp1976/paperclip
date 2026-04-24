# Paperclip → Enterprise-grade SaaS: 90-day plan

Written 2026-04-21 after a session where three "completed" tasks turned out to be broken (Run Activity panel oversized, Costs page non-functional, PDF output missing) and you said the UX is nowhere near where it needs to be. This plan is grounded in what I've seen in the codebase, not generic SaaS advice. Priorities are ordered by buyer impact, not by what's most interesting to build.

---

## TL;DR

Paperclip has the surface area of a serious product: dashboard, agents, tasks, runs, heartbeats, approvals, budgets, goals, finance ledger, plugins, skills, agent-to-agent collaboration, kill switch. The problem isn't scope — it's that the layer underneath the surface isn't load-bearing. Features get shipped, marked done, and then quietly break on the main flows. An enterprise buyer running a one-week eval will find this within an hour and walk away.

Three things have to happen in parallel over 90 days:

1. **Stop the bleeding.** Institute a real Definition of Done so "completed" means a buyer couldn't trip over it in a demo. Retest every "done" task against that bar.
2. **Harden the core loop.** A user creates a task → an agent picks it up → produces a result → the user sees the output → attributes the cost. That loop has to be rock-solid before anything else matters. Everything outside that loop is a feature; everything inside it is the product.
3. **Build the enterprise spine.** Auth, RBAC, audit, multi-tenancy correctness, billing meter, observability, accessibility, security review. None of these sell the product — but missing any of them loses the deal in procurement.

The plan below is how to do all three without letting the roadmap sprawl further.

---

## Where we actually are

**What's working at first glance:** The design system (sage/rose pastel tokens, SoftCard, PageHeader) is tasteful. The Dashboard composition is ambitious. The data model is thoughtful — agents, issues, runs, heartbeats, cost events, finance events, budget policies, approvals are all modelled as separate first-class entities, which is the right call. The plugin architecture shows long-term thinking.

**What's actually broken or suspect, based on this session alone:**

- Tasks #85, #81 marked completed but the underlying features don't work in the UI the user opens. This is a leading indicator, not a one-off.
- The Run Activity card on the Dashboard stretched to the height of a 2-card right column because `items-start` was missing from the grid and `flex-1` inside the chart let it fill vertical space. It was shippable only in isolation.
- Costs page has five tabs and fetches from five distinct endpoints (`summary`, `byAgent`, `byProject`, `byAgentModel`, `financeSummary`, `financeByBiller`, `financeByKind`, `financeEvents`, `byProvider`, `byBiller`, `windowSpend`, `quotaWindows`). That's a lot of failure surface with no obvious user-facing health signal when any one of them fails.
- Outputs delivery (PDF per run) was claimed done but user reports no clear PDF output exists. Haven't traced yet.
- Server+UI colocated on port 3100 with HMR websocket on 13100. Fine for dev, but there's no production build path I've verified.
- `node_modules` installed natively for darwin-arm64; attempting to run vitest in the sandbox fails on rollup linux-arm64 binary. Indicates CI is probably Mac-only or not wired.

**What I don't yet have evidence of but an enterprise buyer will ask on day one:**

- SSO (SAML, OIDC)
- Audit log (who did what, when, from where)
- Role-based access control (admin vs member vs read-only vs board)
- Multi-tenant isolation proof (row-level, verified with tests that try to access another company's data)
- SOC2 readiness or roadmap
- Data retention and deletion SLAs (GDPR Art. 17)
- Data residency options
- API rate limiting and quota enforcement per tenant
- Backups, point-in-time recovery, tested restore
- Status page, incident response
- Uptime SLO published somewhere
- Terms of Service, DPA, Privacy Policy
- Pricing page / commercial model
- In-product billing and usage metering
- Keyboard navigation and screen-reader support (WCAG 2.2 AA)
- Mobile/tablet responsive strategy (or explicit desktop-only decision)

---

## The ten gaps between "feature-complete" and "enterprise"

Ranked by buyer impact in a typical enterprise security review. If you close these ten, you will pass 80% of procurement checklists.

**1. Auth + identity.** Today you have session-based login with actor types `agent | board | none`. An enterprise buyer wants: SAML 2.0 SSO, SCIM provisioning/deprovisioning, MFA enforcement at the org level, session controls (max lifetime, idle timeout, revoke-on-role-change), IP allowlist.

**2. RBAC that maps to real roles.** Right now actor types are mostly about who's calling the API. Buyers want Owner / Admin / Member / Billing Viewer / Read-only with granular permissions per feature area (agents, costs, approvals, skills, plugins). Permissions need to be visible to admins, auditable, and assignable via SCIM groups.

**3. Audit log.** Every state change (config edit, approval, budget override, agent pause/resume, skill install, secret rotation, permission grant) needs a write to an append-only audit log with actor, target, before/after, IP, user-agent, trace ID. Exportable as CSV and via API. Retention configurable, default 1 year.

**4. Multi-tenant isolation, proven.** You have `assertCompanyAccess(req, companyId)` — good. What's missing is a test suite that boots two companies, inserts rows for each, and then systematically tries every endpoint as company A's actor attempting to read/write company B's data. Until that suite exists and runs in CI, isolation is a hope, not a fact.

**5. Billing + usage metering.** You have a finance ledger and cost attribution per agent/model/provider. The gap is: a tenant has no way to see "here's the bill Paperclip is going to send me this month" and Paperclip has no way to invoice them. This is both a buyer trust signal (meter is visible) and the only way to make money.

**6. Observability: structured logs, traces, error tracking.** Frontend: Sentry (or equivalent) with release tagging, source maps, user context (company_id, user_id, not email). Backend: OpenTelemetry traces on every request, structured JSON logs with request ID and company ID in every line, RED metrics per endpoint. Status page fed by synthetic checks.

**7. A11y + input coverage.** Keyboard navigation through the Dashboard and Task-create flow without touching the mouse. `aria-label` on icon-only buttons, focus rings that actually go to the right place, color contrast meeting WCAG 2.2 AA, Radix Dialog focus trap verified (you're using it for AgentQuestionPopup — good). One motor-impaired user in a buyer's procurement team will block the deal if they can't tab-navigate.

**8. Security hygiene.** Secret management: no secrets in env files committed anywhere, rotate-on-leave policy. Password hashing: argon2id or bcrypt with sensible cost. CSP + HSTS + X-Frame-Options + CSRF on state-changing endpoints. Dependency scanning (Renovate/Dependabot), container scanning (Trivy), static analysis (Semgrep) in CI. A written threat model.

**9. Reliability: backups, restore, rollback.** Automated Postgres backups with point-in-time recovery, a restore test run at least quarterly and documented. Blue/green or canary deploys with a one-click rollback. A runbook for "agent runaway loop" and "quota exhausted" and "migration failed at 3am."

**10. Trust collateral.** A public trust center page (domain/trust or similar) with: security overview, subprocessors list, DPA template, uptime history, changelog, status page link, vuln disclosure policy, SOC2 roadmap or report. Buyers' security teams will ask for this within 48 hours of opening a conversation.

---

## 90-day roadmap

### Phase 0 — Week 1: Stop the bleeding

Before adding anything, close the credibility gap on what's already shipped.

- **Mon–Tue**: Rebuild the "done" bar. Write a 1-page Definition of Done (below). Post in repo root as `CONTRIBUTING.md` or `DEFINITION-OF-DONE.md`. Commit no code this week that doesn't meet it.
- **Mon–Fri**: Walk the core loop in the product, screenshot-first. Composer → Task created → Agent picks up → Run starts → Heartbeats flow → Result lands → Output downloads (PDF) → Cost appears on Costs page → Audit log has the trail. File one bug per break. Expect 15–30 bugs.
- **Wed–Fri**: Fix the three live breakages (Run Activity panel height — done in this session, Costs page, PDF output). For each: write a failing test first, then fix, then add a screenshot to a `docs/screenshots/` directory committed to the repo.
- **Fri**: Retest-and-reopen pass over every task marked `completed` in the task list. Reopen anything that doesn't meet the new bar. This is painful but essential — trust in the task list is zero right now.

### Phase 1 — Weeks 2–4: Harden the core loop

The loop is: **compose → task → agent → run → result → output → cost → audit**. Nothing else ships until this loop is bulletproof.

- **Week 2**: End-to-end test per leg of the loop. Use Playwright for the UI legs and vitest/supertest for the API legs. Each test seeds data, performs the action, and asserts the full downstream effect (including audit log row). Run in CI on every PR.
- **Week 2**: Fix every "loading spinner that never resolves" and "empty state that shouldn't be empty." The worst UX signal in an enterprise SaaS is a page that looks broken but isn't (or is, and you don't know which). Every loading state needs a timeout → error with "try again" CTA.
- **Week 3**: Error boundaries per top-level route. When something explodes, the user sees "something went wrong, we've been notified" with a retry and a report ID, not a white screen. Wire to Sentry.
- **Week 3**: Multi-tenant isolation test suite. Two companies, every endpoint, every cross-access attempt. CI gates merging on it passing.
- **Week 4**: Cost attribution audit — every run event writes to cost event table, every cost event rolls up correctly per agent/project/provider/biller. Reconcile against a known-good fixture of 100 runs. Publish the reconciliation report in `docs/audits/`.
- **Week 4**: PDF output — trace end to end, rebuild if needed. This is a trust signal: if you can't export results cleanly, nothing above matters because users can't take the work out.

### Phase 2 — Weeks 5–8: Enterprise spine

With the loop solid, start closing procurement-checklist gaps.

- **Week 5**: Audit log. Pick 30 high-value actions (list them), instrument each to write to `audit_log` with actor, target, before, after, IP, user-agent, correlation ID. Build the admin viewer UI. Add CSV export.
- **Week 6**: RBAC v1. Owner / Admin / Member / Billing Viewer / Read-only. Permission matrix written down. Enforce in routes and in UI (hide actions users can't take). Put an admin "team" page in Settings.
- **Week 7**: SSO — SAML 2.0 via WorkOS or Auth0 or roll your own with `@node-saml/node-saml`. Start with one design-partner customer's IdP. SCIM can come later.
- **Week 7**: Observability — Sentry on UI, OTel traces on server, Grafana/Datadog dashboard for RED metrics per endpoint. Status page (Instatus or similar) fed by synthetic checks of the core loop.
- **Week 8**: Security hygiene — Renovate, Dependabot, Semgrep, Trivy in CI. CSP headers. CSRF audit. Secret rotation runbook. Threat model doc.

### Phase 3 — Weeks 9–13: Buyable

Work that turns evaluators into customers.

- **Week 9**: Pricing page + billing meter UI. Users see "this month: $X of your $Y plan" in-product. Backed by Stripe metered billing against the existing cost events. Paid plan gates something meaningful (# agents, # runs/month, or advanced features).
- **Week 10**: Onboarding redesign. New user's first 10 minutes should end with a visible agent run and a cost. Right now you have WelcomeZeroState on the Dashboard — good start — but the path from "zero state" to "first successful agent output" is the make-or-break of activation.
- **Week 11**: In-product help and changelog. Help drawer with search over docs. Changelog surfaced in-app when new features ship. Both are table stakes, both are fast wins.
- **Week 12**: Accessibility pass. Hire an a11y consultant for a 5-day audit, fix the P0s, file the P1s. Publish VPAT.
- **Week 13**: Trust center page. Security overview, subprocessors, DPA template, status page link, vulnerability disclosure policy, SOC2 roadmap stated.

### Phase 4 — Months 4–6 (post-plan): Scale

Out of scope for the 90-day plan but queue up:

- SOC2 Type 1 audit engagement (Drata/Vanta kickoff)
- SCIM provisioning
- Data residency (EU region)
- Advanced audit log search, SIEM export
- Custom roles
- Webhooks + event bus for customer integrations
- Public API with versioning, keys, rate limits per key
- Terraform provider

---

## Definition of Done that prevents "marked-done-but-broken"

This is the one-pager. Task is not `completed` until every box is checked.

1. **Code compiles and typechecks clean.** `tsc --noEmit` passes. Lint passes.
2. **Tests added or updated.** New logic → unit test. New endpoint → route test. New user-facing flow → Playwright test covering the happy path and at least one error path.
3. **Runs in the actual dev server.** Not "I edited the file." Reload the page, click through the flow, confirm the new behavior visually.
4. **Screenshot committed to `docs/screenshots/{feature}/`.** Before and after for UI changes. This is not optional — it's the only artifact that survives a context compaction.
5. **Works for at least two tenants.** If it touches data, run it in a second company and confirm isolation.
6. **Empty, loading, error states handled.** Each user-visible surface shows something sensible when there's no data, while data is loading, and when the request fails.
7. **Audit log entry written** if the change is a state mutation.
8. **Docs updated** if it's user-visible. At minimum a line in CHANGELOG.md.
9. **Observability in place.** Log line on success, log line on error, error tracked to Sentry. Any new endpoint has a trace span.
10. **User can find it.** If it's a feature, there's a path from the sidebar or a prompt in-app. "We built it but you have to know the URL" is not shipped.

If a task doesn't meet all ten, status stays `in_progress`.

---

## What to do first (next 48 hours)

This is the sequence. Don't multitask, don't add scope.

**Hour 1** (when you're back): Read this doc. Decide if the framing is right. If not, edit it. The plan is only useful if you own it.

**Hour 2**: Open a fresh browser, sign in as a new test user, and walk the core loop — composer → task → agent → run → result → output → cost. File one GitHub issue (or task in the system) per break, with screenshots. Don't fix anything, just enumerate.

**Hour 3–6**: Triage. P0 = core loop is broken. P1 = feature is advertised but doesn't work. P2 = UI is ugly/confusing but functional. Tackle P0s only this week.

**Day 2 morning**: Write `DEFINITION-OF-DONE.md`, commit it, and require it in every PR description.

**Day 2 afternoon**: Reopen the "completed" tasks that fail the new bar. This is a painful pass; do it anyway. Aim for 5–15 reopenings. Be honest.

**Day 3–5**: Fix P0s from the triage. Add one end-to-end Playwright test per fix.

**End of week 1**: You should have (a) a clean DoD document, (b) a passing E2E suite covering the core loop, (c) the three breakages from this session fixed and tested, (d) an honest task list.

---

## Specific Paperclip observations

Notes from what I've seen in the code, ordered by priority:

- **`refetchInterval: 10_000` on AgentQuestionPopup** is fine for dev but at 100 tenants x 100 users each it's 1000 req/s of polling on an empty list. Move to SSE or websocket before launch.
- **Dashboard makes a lot of parallel queries on mount.** Measure the total fan-out in a cold-cache load. If it's > 8 round trips, batch. Buyers open the Dashboard first and time-to-interactive on that page becomes their impression of the product's performance.
- **`companies.agents` and `companies.issues` etc. query keys are company-scoped — good.** But I haven't seen an abort-on-company-switch strategy. If a user switches company mid-load, the previous company's in-flight requests can land and overwrite the cache. React Query's `cancelQueries` on company change.
- **Dev-runner auto-applies migrations** (`PAPERCLIP_MIGRATION_AUTO_APPLY=true`). Fine in dev. In prod, migrations should be gated behind a deploy step with rollback. Document which migrations are reversible.
- **Finance ledger is modeled separately from cost events** — that's the right call (one is invoice-authoritative, one is estimated). Make sure the Costs page tabs communicate this clearly to the user, because "why doesn't my estimated spend match my actual invoice" is the #1 billing support ticket you'll get.
- **Actor auth `req.actor.type === "agent" | "board" | "none"`** — consider adding `"user"` explicitly rather than implying it from `"none"` or from an authenticated user session. Explicit beats implicit.
- **Session port collision**: Server and UI on 3100 with HMR on 13100. In prod, split them. Also means CI can't spin up an isolated UI dev server without a backend, which is a testing friction.
- **Plugins are first-class entities** — that's forward-looking. Enterprise buyers will want to audit installed plugins, restrict which ones can run, and sign them. Model the plugin signature field now; leave the verification for later.
- **Skills have `/start` and other slash-command entry points** — good for power users. Add them to the in-app command palette (Cmd-K) early; it's a big quality-of-life signal.
- **Kill Switch on the Dashboard header** — excellent idea, keep it. Document exactly what it kills (all running agents for the current company? all companies for an admin?). Ambiguity on a big red button is how accidents happen.
- **AgentQuestionPopup (shipped this session)** — the modal-can't-dismiss pattern is correct. Two polish ideas for when you come back to it: (1) show the agent's prior context so the user doesn't have to open another tab to answer, (2) allow "answer later" in addition to "answer now" and "your call" — some clarifications genuinely deserve a think.

---

## One hard call to make

Paperclip is, at its heart, an agent orchestration platform with strong finance discipline. The features that don't serve that spine (e.g. OrgChart, Standup, some plugin slots) dilute the narrative to buyers. In the next 30 days, decide: are those first-class pillars you're committing to, or are they experiments you want to tuck behind a feature flag until the core is solid? An enterprise buyer evaluating 8 surfaces gives up faster than one evaluating 4. I'd tuck OrgChart, Standup, and PluginPage behind a feature flag for the 90 days and re-introduce them once the core is bulletproof — you'll move faster and the story gets sharper.

That's the plan. When you're back, the best next move is the 48-hour sequence at the top of this doc.
