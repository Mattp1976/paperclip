# Paperclip AI — Feature & Intuitiveness Audit

**Date:** 2026-04-20
**Lens:** First-time user (someone who has never opened the app)
**Scope:** Whole app — every page in the sidebar, plus the global surfaces (onboarding, sidebar IA, composer, search, empty states, company picker, kill switch)

---

## Executive summary

Paperclip AI is a deep, capable product. The design language is coherent, the dashboard tells a real story, and the operational plumbing (kill switch, live runs, cost tracking, approvals) is genuinely rare to find in one place. The problem is not capability — it's *legibility*.

A first-time user currently drops into an 18-item sidebar, eight-section dashboard, and a product vocabulary that overlaps itself four or five times. They don't know whether to open Agents, Swarm, Fleet, or Org. They don't know why Issues, Tasks, Goals, and Approvals are separate. They don't know what a "Routine" is, what a "Skill" is, or why the sidebar says "Tasks" but the page says "Issues."

The three themes worth fixing first are:

**1. Nomenclature collisions.** Several sidebar labels don't match their page titles, and several concepts (Agents/Swarm/Fleet, Issues/Goals/Projects, Outputs/Activity/Inbox) have fuzzy boundaries. A first-timer can't build a mental model because the words keep shifting.

**2. The happy path skips onboarding.** The onboarding wizard only fires if zero companies exist. The moment one exists, every new user is dropped straight into the Dashboard with no orientation. There is no "here's what this is / here's what to do first" layer.

**3. The most powerful features are invisible.** Cmd-K palette, Shift+Space composer, composer scope selector, and the multi-mode Ask/Task/Decision composer are all keyboard-gated or dropdown-gated with no visible hints. Power users will love them; a first-timer will never find them.

Everything below breaks down page by page, then stacks the findings into a ranked fix list with effort and impact. The top five fixes are low-effort, high-impact, and will move first-time intuitiveness more than anything else on the list.

---

## Part 1 — Per-page observations

### Primary group

**Dashboard** — excellent visual design, but empty-data density is overwhelming. A user with zero agents still sees eight cards/sections full of zero values. The empty state says "Select agents to get started" but offers no inline CTA to actually create one. Budget alerts, fleet health, and leaderboard all render with zero rows. *Verdict: looks complete on day 1000, looks like a broken page on day 0.*

**Inbox** — the "work_items / join_requests / alerts" tab labels are leaked internal enum values. The red badge convention is correct but inconsistent — Approvals has its own page and does not use the same badge pattern. *Verdict: discoverable once you understand the system, opaque on arrival.*

**Outputs** — clean, sparse, clear subtitle ("See what your agents have accomplished"). One of the best pages in the app for first-timers. *Verdict: solid.*

**Tasks (route: /issues, H1: "Issues")** — **critical nomenclature mismatch.** Sidebar says "Tasks", URL says /issues, H1 says "Issues". A first-timer cannot build a mental model. Empty state is reasonable. *Verdict: rename one or the other — this is the #1 single-line fix in the whole app.*

**Approvals** — purpose is clear once you're in, but the page gives no explanation of what triggers an approval. A user arriving cold does not know whether they should ever expect something here. *Verdict: add a one-line "Approvals appear when an agent needs human sign-off before taking action" subtitle.*

### Workspace group

**Projects** — clean. Empty state actually describes what a Project is for. *Verdict: solid.*

**Agents** — good empty state, good CTA, subtitle explains purpose. Dual view modes (list / org chart) are not explained but are discoverable. *Verdict: solid.*

**Swarm** — **high-friction page.** Force-graph visualization with color-coded nodes (model type) and ring colors (status), *no legend, no tooltip, no introduction*. A first-timer sees pretty animated balls and cannot read them. *Verdict: either add a legend panel or gate this behind an "advanced" section.*

**Fleet** — analytics dashboard of agent health. Functionally overlaps with both Agents and the Dashboard. A first-timer cannot tell why this is a separate destination from the Dashboard. *Verdict: reconsider whether Fleet is a nav-level page or a tab inside Agents.*

**Goals** — clear empty state. Hierarchy is powerful but the relationship to Issues/Projects is not explained. *Verdict: OK, but benefits from a subtitle that contrasts it with Issues.*

**Routines (Beta)** — **very high friction.** Complex recurring-automation feature with field labels like `concurrencyPolicy: coalesce_if_active` and `catchUpPolicy: enqueue_missed_with_cap`. No help text, no defaults tuned for beginners, no examples. *Verdict: this is a power-user feature. Either wrap it in a simpler "Create a schedule" wizard or hide it behind an "Advanced" disclosure.*

### Company group

**Organisation** — recursive tree of agents by role. Functionally overlaps with Agents' org-view mode. Status dot colors are undocumented. *Verdict: consider whether Org is a top-level page or a tab in Agents.*

**Skills** — file-tree of markdown/shell skill files. The word "skill" is undefined anywhere in the UI. No first-timer will know what they're looking at. *Verdict: add a "What is a skill?" panel on first visit, or a header subtitle.*

**Templates** — minimal page wrapper. Purpose unclear without context. *Verdict: add subtitle; consider consolidating with Skills or Projects.*

**Costs** — dense finance dashboard. Uses accounting terms ("Debits", "Credits") that are precise but not friendly to non-finance users. *Verdict: rename to "Spend / Credits / Net" or keep as-is if finance users are the target; if engineers are also looking, soften the vocabulary.*

**Activity** — chronological event feed. Generic label. Overlaps conceptually with Outputs and Inbox. *Verdict: add subtitle "All changes to agents, issues, projects, and goals" so it's distinguishable from Outputs.*

**Settings** — standard company configuration. One governance toggle (`requireBoardApprovalForNewAgents`) is jargon-heavy. *Verdict: OK; toggle label could explain the consequence.*

---

## Part 2 — Cross-cutting problems

### 1. Nomenclature collisions

Five distinct places where the product's vocabulary fights itself:

| Where | What it says | What it means | Collision |
|---|---|---|---|
| Sidebar label | "Tasks" | /issues route | Sidebar says one thing, page says another |
| Sidebar "Organisation" + page "Org" | Agents in hierarchy | Duplicates Agents' org-view | Redundant with Agents |
| Swarm vs Fleet vs Agents | Three nav items | All views of agents | Unclear which to open |
| Goals vs Issues vs Projects | Three containers | Unclear parent/child relationship | Users can't pick one |
| Outputs vs Activity vs Inbox | Three "history" pages | Different slicing of events | Boundaries fuzzy |

These collisions are the biggest barrier to intuitiveness. Every time a user can't predict which item in the nav will give them what they want, they lose trust in the product's structure.

### 2. No orientation for the happy path

The onboarding wizard (`OnboardingWizard.tsx`) only shows if `companies.length === 0`. For every other first-time user — someone invited to an existing company, someone with a test instance already seeded, someone returning after a month — the app drops them on the Dashboard with no "welcome, here's where you are, here's what to do next" layer.

The Dashboard's empty state ("Welcome to Paperclip. Set up your first company and agent to get started.") is only shown when no company exists at all. A user who already has a company but no agents sees the full eight-section Dashboard rendered with zeros, which reads as "something is broken" rather than "you haven't started yet."

### 3. Hidden power features

Keyboard and dropdown surfaces that a first-time user will almost certainly never discover:

- **Cmd-K / Ctrl-K** global palette — only discoverable via the magnifying-glass icon at the top of the sidebar, which looks like a site search.
- **Shift+Space** composer — only shown in small mono text inside the sidebar's Composer button.
- **Composer mode switch** (Ask / Task / Decision) — three distinct workflows distinguished only by a subtle pill colour and placeholder text.
- **Composer scope selector** (company / agent / project / issue) — buried in a dropdown; no visible indicator of current scope before you open it.
- **New Task advanced fields** (workspace mode, model override, thinking effort, Chrome toggle) — 10+ optional fields exposed at once with no progressive disclosure.

The composer is arguably the most interesting interaction surface in the product and first-timers will type into the big green "New Task" button every time, never discovering the composer at all.

### 4. Empty states describe absence, not opportunity

Every empty state currently says "No X yet" with at most a one-line description. None of them explain *why* X matters or *what will happen* when you create one. For a product whose core concept is "AI agents autonomously doing work for you", that's a missed teaching moment on every single page.

### 5. Visual density without progressive disclosure

The sidebar is 18 items flat. The Dashboard is 8+ sections. The New Task dialog is 10+ fields. The composer has three modes plus a scope selector plus a model picker. Each surface is individually defensible, but stacked together on day one they create a sense that the user is already behind — they must learn everything before they can do anything.

### 6. The kill switch is scary out of context

"Kill switch" is correct terminology for an emergency stop, and the armed/dormant visual design is great. But a first-time user with no agents running sees a red-ish button sitting next to "New Task" and may fear-click. The disabled/dormant state helps, but the label could be softer for first-timers who have no context for when they'd use it. "Halt all" or "Stop everything" reads less alarming while still being unambiguous.

### 7. Company picker is silent

The `CompanyContext` auto-selects the first company on load and persists the choice in localStorage. No confirmation, no breadcrumb in the header, no "you are in: Acme Inc" signal. A user working across companies has to remember which one they're in. Archived companies silently disappear from the switcher with no explanation.

---

## Part 3 — Ranked fix list

Each fix is scored:
- **Impact** — how much it moves first-time intuitiveness (H/M/L)
- **Effort** — rough engineering cost (S = hours, M = days, L = weeks)
- **Priority** — P0 = blocks first-time use, P1 = major friction, P2 = polish, P3 = nice-to-have

### P0 — ship this week

| # | Fix | Impact | Effort |
|---|---|---|---|
| 1 | Rename sidebar "Tasks" → "Issues" (or rename the page "Issues" → "Tasks" — pick one and commit). Eliminates the single worst nomenclature collision in the app. | H | S (1 line) |
| 2 | Add a first-time Dashboard **welcome card** that appears when agents.length === 0. Headline: "Welcome to Paperclip." Body: two sentences explaining what the product does. CTA: "Hire your first agent →". Dismissible, persisted in localStorage. | H | S (half a day) |
| 3 | Replace the current empty Dashboard layout (eight zero-filled sections) with a **"getting started" shell** when there's no data — a three-step checklist (1. Create a company, 2. Hire an agent, 3. Assign a task) with live tick marks as the user progresses. | H | M (1-2 days) |
| 4 | Add a one-line **subtitle** under every page H1 that currently has none: Inbox, Approvals, Swarm, Fleet, Org, Skills, Templates, Activity, Settings. Each subtitle should answer "what is this page for?" in plain language. | H | S (half a day) |

### P1 — next sprint

| # | Fix | Impact | Effort |
|---|---|---|---|
| 5 | Add a **legend panel** to the Swarm page (collapsible sidebar on the right) explaining the node colors (model type) and ring colors (status). Gated behind a "Help" button so it doesn't clutter by default. | H | S |
| 6 | **Consolidate Agents / Swarm / Fleet / Org** into a single Agents page with tabs: Team (the current Agents view) / Org chart (the current Org view) / Swarm (network graph) / Fleet (analytics). Removes three nav items and makes the relationship obvious. | H | M (2-3 days) |
| 7 | Make the **Composer keyboard shortcut** and **Cmd-K palette** visible: persistent "⇧Space" hint next to the New Task button, and a "Press ⌘K to search" hint in the sidebar search icon tooltip. A one-time welcome toast ("Tip: press ⌘K anywhere to jump around") can fire on first app load. | H | S |
| 8 | Split the **New Issue dialog** into "Quick task" (title + description, single field, big textarea, "Advanced ▾" disclosure) and "Advanced task" (current full form). Default to Quick. Preserves power for power-users; stops overwhelming first-timers. | H | M (2 days) |
| 9 | Add a **Routines onboarding state** — when routines.length === 0, show a "Try a template" gallery with 3-4 pre-configured examples (e.g. "Morning status check", "Nightly test run", "Weekly summary"). Hides the concurrency/catch-up policy fields behind "Advanced". | H | M (2 days) |
| 10 | Rename **"Kill switch"** to **"Halt all"** with the same visual treatment. Softer vocabulary, identical semantics. Add a tooltip on hover: "Pause every agent and cancel every live run for this company." | M | S (10 minutes) |

### P2 — polish

| # | Fix | Impact | Effort |
|---|---|---|---|
| 11 | Add **what-is-a-skill** panel on first visit to the Skills page. Three short paragraphs: "Skills are reusable instructions your agents can load" + link to docs. Dismiss persists. Same pattern for Templates. | M | S |
| 12 | Improve empty states across the app: convert from **"No X yet"** to **"No X yet. [Why they matter in one sentence.] [Primary CTA]"**. Do a single sweep — 14 empty states. | M | M (1-2 days) |
| 13 | Add a **persistent company-context chip** in the top-left of every page ("You are in: Acme Inc ▾") so users always know where they are and can switch without hunting the sidebar. | M | S |
| 14 | Inbox tab labels: rename `work_items` → `Retries`, `join_requests` → `Join requests`, `alerts` → `Alerts`. Stop leaking enum casing. | M | S |
| 15 | Add a **first-run product tour** (overlay highlighting) that fires the first time any user lands on the Dashboard, highlighting: (1) the sidebar groups, (2) the New Task button, (3) the kill switch, (4) Cmd-K. Dismissible, skip-able, and gated by a localStorage flag. | H | M (3-5 days) |

### P3 — when you have time

| # | Fix | Impact | Effort |
|---|---|---|---|
| 16 | Add a **progress counter** to the OnboardingWizard ("Step 1 of 4"). Users currently don't know how long the flow takes. | M | S |
| 17 | Make the OnboardingWizard **skippable** with a "Skip for now — I'll explore first" link at the bottom of step 1. Re-show after 24h if the user hasn't completed setup. | M | S |
| 18 | Replace the OnboardingWizard's CEO-flavoured default task description with a **role-neutral** seed ("Describe what you'd like your first agent to do. Example: 'Summarise new issues every morning at 9am.'"). | M | S |
| 19 | Add a **"Recent" and "Favourites"** section to the Cmd-K palette so power users build muscle memory faster. | M | M |
| 20 | Differentiate **Outputs / Activity / Inbox** visually with a shared "Feed" section header in the sidebar and three short tagline-style subtitles on each page. Or consider folding Activity into a tab of Outputs — it may not need its own nav item. | M | M |
| 21 | Consider **collapsing the "Company" sidebar group** by default (Organisation, Skills, Templates, Costs, Activity, Settings) — they're admin surfaces, not daily-use. Primary and Workspace stay expanded. Reduces sidebar density from 18 items to 12. | M | S |

---

## Part 4 — If you only do three things

If the goal is maximum first-time-user improvement for minimum work, do these three in this order:

1. **Fix the Tasks/Issues label mismatch.** One line of code. Biggest single credibility jump.
2. **Add subtitles to every page and convert empty states to "what this is + why it matters + what to do next".** One focused day. Teaches the product without any new pages.
3. **Build the Dashboard "getting started" shell for zero-state.** One to two days. The single biggest moment in a first-timer's journey is the first screen they see — and right now that screen looks broken on day one.

Everything else on the list is real, and worth doing, but those three will do more for intuitiveness than the other eighteen combined.

---

## Appendix — Methodology

This audit was produced by:
1. Reading `ui/src/components/Sidebar.tsx` to enumerate every top-level nav item.
2. Having an exploration subagent survey all 18 page files under `ui/src/pages/*.tsx`, recording for each: purpose, H1, primary CTA, empty state, first-paint density, nomenclature, and first-time-user friction.
3. Having a second subagent survey global surfaces: `App.tsx`, `Layout.tsx`, `CompanyContext.tsx`, `OnboardingWizard.tsx`, `NewIssueDialog.tsx`, `CommandComposer.tsx`, `CommandPalette.tsx`, `KillSwitch.tsx`, `EmptyState.tsx`, `CompanySwitcher.tsx`.
4. Synthesizing cross-cutting themes and ranking fixes by impact/effort.

No functionality was tested live; this is a static analysis of the codebase. A follow-up round with usability testing on 3-5 real first-time users would sharpen the prioritization further, especially around the Routines/Skills/Templates cluster where the "is this confusing?" question is better answered by observing real usage than by reading source.
