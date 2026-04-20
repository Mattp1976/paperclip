# Paperclip AI — Uncommitted Work Audit

**Date**: April 20, 2026
**Repo state at audit**: branch `master`, clean vs. origin, with 43 modified files and 27 untracked files, no commits since `d4c3c2ea`.
**Context docs**: `HANDOFF.md`, `UX-REDESIGN-SPEC.md`.

---

## TL;DR

The uncommitted tree is much more finished than the HANDOFF suggests. Most of the 6-phase UX redesign is actually implemented — Phases 1, 4, and 5 are effectively done, P3 is done at the helper-function layer (UI-facing), and P6 is partially done. **The main spec gap is P2**: `OutputCard` is polished and wired but is still per-run, not the task-grouped `ResultCard` the spec calls for. **There is also a large block of non-spec work** (agent detail expansion, workspace file browser, Swarm/Fleet/Templates/Secrets pages, theme overhaul, command composer) that's substantial and complete but unmentioned in either doc. Nothing is committed, so the risk is mostly "lose it if the working tree is blown away", not correctness.

---

## HANDOFF.md verification — all 3 claims hold

| Claim | Status | Evidence |
|---|---|---|
| Latest Work feed rendered on Dashboard between charts and Fleet Health | ✅ | `ui/src/pages/Dashboard.tsx:276` — `<LatestWorkFeed limit={5} />`. Note: limit was bumped from 3 → 5. Placement is actually above metrics, not between charts and Fleet Health — the dashboard was reordered per P1 spec since HANDOFF was written. |
| Outputs page wired (import, route, unprefixed redirect, sidebar link) | ✅ | `App.tsx:43` import, `App.tsx:176` route, `App.tsx:355` unprefixed redirect, `Sidebar.tsx:99` nav item. |
| `"outputs"` in `BOARD_ROUTE_ROOTS` | ✅ | `ui/src/lib/company-routes.ts` — plus 7 more entries added (`swarm`, `fleet`, `templates`, `tests`, `plugins`, `settings`, `execution-workspaces`). |

---

## Spec phase status

### P1 — Dashboard reorder + Live Progress Strip — **DONE**

Dashboard render order (verified at `Dashboard.tsx:243–362`):

1. Header + "New Task" button
2. `QuickInputBar` (L248)
3. `LiveProgressStrip` (L251)
4. Budget incident alert (conditional)
5. `LatestWorkFeed` (L276, limit=5)
6. Metrics grid: Agents / Active Tasks / Month Spend / Approvals
7. `FleetHealthOverview` + `BudgetForecast` (L357–358)
8. `AgentLeaderboard` (L361)
9. Everything else

This matches the spec's target order: **Input → Progress → Results → Metrics → Operations**. `LiveProgressStrip` is a real 308-line component with React Query 3s polling, session clustering (60s proximity), per-agent status icons, elapsed time, and friendly status copy.

### P2 — ResultCard replacing OutputCard — **PARTIAL**

Spec asks for: *"Multiple agent runs that serve the same task should be grouped together into a single result."*

What exists: `OutputCard` is a polished single-run card with markdown rendering, cost footer, tokens (hidden in compact mode), and a `taskIdentifier` chip that shows which task the run belongs to via `extractIssueId(run)` + `issueMap` lookup. It's used by `LatestWorkFeed`, `Outputs`, and `RunSummaryCard`.

What's missing: no task-level grouping. If 5 agents contribute to one task you still get 5 cards, not one aggregate card. `OutputArtifacts` (PRs, branches, preview URLs, docs) exists as a separate component used on issue-detail pages but is **not inlined into OutputCard / LatestWorkFeed / Outputs** as the spec calls for. The friendly-cost + next-action buttons per-card are present on `OutputCard`; what's absent is the "one card per task" abstraction.

### P3 — Cost model fix — **PARTIAL (UI helpers done, backend not verified)**

`ui/src/lib/utils.ts` adds `friendlyCost()` ("Less than 1¢" / "5¢" / "$1.23"), `friendlySource()` ("You asked" / "Scheduled"), and `friendlyDuration()` with optional "(faster than usual)" benchmark. `MetricCard` has a new `accent` variant. These are used in `OutputCard`, `Outputs`, and the dashboard.

Not verified: whether `monthSpendCents` is actually populated correctly backend-side — if the data is still zero, the friendly formatting doesn't help. No projection (`"At this pace, ~$4.50/month"`) is implemented yet; this was part of the P3 spec.

### P4 — Outputs page timeline — **DONE**

`ui/src/pages/Outputs.tsx` (459 lines) has:

- Day grouping: Today / Yesterday / Earlier this week / older dates with friendly labels (`getDayGroup`)
- Status tabs: All / Completed / In Progress / Failed
- Search + agent filter dropdown
- Different inline cards per status (in-progress spinner, failed error, succeeded = OutputCard)
- Page-top cost summary (total cost / tokens / duration)
- Empty state with example prompts

The only spec item not realized is the "page-level cost comparison to prior week" — the summary is there but no period-over-period framing.

### P5 — QuickInputBar loop closure — **DONE**

`ui/src/components/QuickInputBar.tsx` (435 lines):

- Three modes (Task / Ask / Decision) with per-mode colors + hints, Tab-to-cycle
- **No navigation on submit** — inline 6s confirmation instead
- Smart agent detection via `@name`
- Keyboard shortcuts (`/` to focus, Tab to cycle mode, Enter to submit)
- Invalidates React Query cache so `LiveProgressStrip` picks up the new run

Spec item not realized: the "detect mode from prompt" auto-switch ("What is…" → Ask, "Create…" → Task). The user still cycles modes manually.

### P6 — First-time UX — **PARTIAL**

Done: empty-state illustration + example prompts on the Outputs page. Not done: the global "first result ever" onboarding tooltip ("This is your first result! Your agents worked together…").

---

## Non-spec work (large, complete, not called out anywhere)

A substantial amount of work exists that neither HANDOFF nor UX-REDESIGN-SPEC mention. This is the biggest finding of the audit — it's about half the diff by file count.

### Agent detail expansion — 5 new tabs + workspace file browser
- `AgentDetail.tsx` now has 11 tabs (was 6): added I/O, Performance, Guardrails, Security, Memory, Workspace Files.
- New components: `AgentIOPanel`, `AgentPerformance`, `AgentGuardrails`, `AgentSecurityPanel`, `AgentMemoryPanel`, `WorkspaceFilesPanel`, `LatestRunOutput` (agent-detail version, 368 lines, separate from the dashboard-facing work).
- Backend: `server/src/routes/agents.ts` adds `GET /agents/:id/workspace-files` (directory listing, 200-file cap, skips hidden) and `GET /agents/:id/workspace-file?path=...` (2MB cap, path-traversal guard via `resolved.startsWith(wsDir)`).
- Client: `ui/src/api/agents.ts` gets `workspaceFilesApi.list()` and `.read()`.

### New top-level pages
- `Swarm.tsx` (450 lines) — hand-rolled force-directed org chart with tier layering (C-suite → VPs → rest), model-color-coded nodes (Opus/Sonnet/Haiku), live activity pulses from `heartbeatsApi.liveRunsForCompany`, hover tooltip + selected-agent panel.
- `Fleet.tsx` — thin composition of `FleetHealthOverview` + `RunHistoryChart` + `AgentLeaderboard` + `BulkAgentOps` + `FleetAnalytics`.
- `Secrets.tsx` (647 lines) — full CRUD: create / rotate / edit / delete with encrypted-at-rest messaging, provider picker, version tracking. Backed by an existing `secretsApi`.
- `Templates.tsx` — thin wrapper around `CompanyTemplates`.
- Plus supporting components: `FleetHealthOverview`, `FleetAnalytics`, `AgentLeaderboard`, `BulkAgentOps`, `BudgetForecast`, `CompanyTemplates`, `CommandComposer`, `RunHistoryChart`.

### Theme overhaul (`ui/src/index.css`)
- Overhauled OKLCH palette: warm grays (155° hue) instead of pure black, primary greenish (`oklch(0.42 0.12 150)`), softer off-white / off-black backgrounds, reduced border opacity, increased radii (0 → 0.75/1rem).
- This is consistent with HANDOFF's "light mode default + shadow-based card polish" claim, but the scope is larger — it's a full design-token revision, not just theme-flipping.

### Small plumbing
- `DialogContext` exposes `composerOpen` / `openComposer` / `closeComposer` and leaks to `window.__dialogContext` for keyboard shortcut wiring. Fragile — worth replacing with a proper context hook.
- `CommandComposer` is mounted at the App root; conditional render driven by DialogContext.

---

## Risks / concerns

1. **Nothing is committed.** Biggest real risk: a single `git checkout .` loses ~70 files of work. Recommend committing early, even before finishing P2.
2. **P2 drift** — `OutputCard` is good but it's not the `ResultCard` the spec called for. If you ship as-is the user gets 5 cards for a 5-agent swarm, defeating the "one task = one result" principle.
3. **Backend cost aggregation unverified** — the friendly cost UI is ready but still reads `monthSpendCents`. If that field is still zero, P3 visibly fails.
4. **Scope creep, undocumented** — the non-spec work above (agent tabs, workspace files, Swarm/Fleet/Secrets/Templates, theme) is large and has no paper trail. Worth deciding whether to document it, split it into separate commits by theme, or drop parts of it.
5. **`window.__dialogContext` hack** — fragile and easy to misuse. Small refactor job.
6. **Routes added for pages not in sidebar** — `BOARD_ROUTE_ROOTS` added `tests`, `plugins`, `settings`, `execution-workspaces` but no new pages or sidebar items exist for those. Suggests planned future routes. Safe to leave, but note it.

---

## Recommended plan

**Stage 1 — Lock in what's done (single session).**
- Commit in themed slices so history is legible:
  - `feat(ui): P1 dashboard reorder + LiveProgressStrip`
  - `feat(ui): P4 Outputs page with timeline grouping`
  - `feat(ui): P5 QuickInputBar inline confirmation loop`
  - `feat(ui): P3 friendly cost/duration/source helpers`
  - `feat(ui): theme overhaul (OKLCH warm grays)`
  - `feat(ui): agent detail tabs — I/O, performance, guardrails, security, memory`
  - `feat(server,ui): agent workspace file browser`
  - `feat(ui): Swarm org-chart page`
  - `feat(ui): Fleet management page`
  - `feat(ui): Secrets CRUD page`
  - `feat(ui): Templates page`
  - `feat(ui): CommandComposer + DialogContext wiring`
- Start the dev server and walk through the HANDOFF verification checklist (Outputs page, Dashboard order).

**Stage 2 — Close the P2 gap.**
- Build a real `ResultCard` that groups runs by originating `issueId`.
- Inline `OutputArtifacts` (deliverables block) into it.
- Replace `OutputCard` usage in `LatestWorkFeed` and `Outputs` with `ResultCard`.
- Keep `OutputCard` around for the agent-detail per-run view if useful.

**Stage 3 — P3 finish.**
- Investigate `monthSpendCents` server-side (audit the aggregation query).
- Add "At this pace, ~$X/month" projection from trailing 7-day average.
- Apply `friendlyCost` everywhere the user sees dollars.

**Stage 4 — Small polish.**
- Smart mode detection in `QuickInputBar` (prompt-based).
- "First result ever" onboarding tooltip (P6).
- Replace `window.__dialogContext` with a proper hook.
- Decide whether the undocumented scope (agent tabs, Swarm, Fleet, Secrets, Templates) should be formalized in the spec or left as-is.

---

*This audit was produced from a read-only pass; no files were modified.*
