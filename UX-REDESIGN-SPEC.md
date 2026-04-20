# Outputs & Inputs UX Redesign — Product Spec

**Product**: The Agent Collective (Paperclip AI)
**Date**: April 2026
**Author**: Matt + Claude
**Status**: Draft — awaiting sign-off before implementation

---

## 1. The Problem

The current UI was built by engineers for engineers. It speaks in operational jargon — "heartbeat runs", "invocation sources", "token counts", "cost USD $0.0034" — and surfaces outputs across four disconnected locations with no coherent thread tying them together.

A non-technical user who can prompt effectively but has never seen agentic workflows will open this product and immediately hit three walls:

1. **"What's happening?"** — They submit a task via QuickInputBar, the swarm kicks off, and... nothing. No progress. No indication that 5 agents just started working. They're left staring at metric cards that say "3 running".

2. **"Where's my stuff?"** — Results appear buried below 4 chart cards on the Dashboard, scattered across per-agent detail pages, and in a flat chronological list on /outputs that treats every individual agent run as an isolated card. A swarm of 8 agents working on one task produces 8 disconnected cards with no grouping.

3. **"Is this expensive?"** — The cost model shows `$0.0034` per run and `$0.00` month spend. These numbers are technically accurate but utterly meaningless. A user has no frame of reference. Is $0.003 cheap? What will this cost me this month?

### Current Architecture (What Exists)

| Component | Location | What it shows | Problem |
|---|---|---|---|
| `QuickInputBar` | Dashboard, top | Task/Ask/Decision input | Creates an issue + navigates away. No feedback loop back to results. |
| `MetricCard` (Spend) | Dashboard, hero | `$0.00` month spend | Shows cents via `formatCents()`. Data appears to always be zero. |
| `LatestWorkFeed` | Dashboard, below charts | Last 3 successful outputs as cards | Buried beneath 4 chart cards, active agents panel, and budget alerts. User has to scroll significantly. |
| `OutputCard` | Outputs page + Dashboard feed | Single run with markdown output, agent identity, cost, duration | Good card — but flat list with no grouping. Shows `$0.0034` costs. |
| `Outputs` page | /outputs | All successful runs, filterable | Flat chronological list. No session/batch concept. Only shows succeeded runs with output text. |
| `LatestRunOutput` | Agent detail page | Last 3 runs for one agent | Completely disconnected from main outputs flow. |
| `RunSummaryCard` | Issue detail page | Multi-run aggregate stats | Closest thing to "session grouping" but hidden in issue detail. |
| `OutputArtifacts` | Issue detail page | PRs, branches, preview URLs, docs | The actual deliverables — completely disconnected from run outputs. |

### The Core Disconnect

The user thinks: **"I asked for X → what did I get?"**
The UI thinks: **"Agent A ran at 14:32 → here's its output."**

These are fundamentally different mental models. The user's mental model is task-centric (input → result). The UI's mental model is agent-centric (agent → runs → outputs).

---

## 2. The Flip

We need to restructure around the user's mental model:

```
ASK  →  PROGRESS  →  RESULT  →  COST  →  NEXT ACTION
```

Instead of:

```
Agent → Run → Output → (find cost somewhere) → (no next action)
```

### What This Means Practically

| User thinks | Current UI shows | New UI should show |
|---|---|---|
| "I asked for a competitor analysis" | 5 disconnected OutputCards from 5 agents | One "Competitor Analysis" result card with all 5 contributions grouped |
| "How's it going?" | Metric cards: "3 running" | A live progress bar: "Working on it... 3 of 5 agents complete" |
| "What did it cost?" | `$0.0034` on each card | "This task cost $0.02 · Your average is $0.03/task · $4.50 this month" |
| "What should I do next?" | Nothing. Read the output, figure it out | "Review and approve" / "Export to doc" / "Run again with changes" |
| "Is this normal?" | No context whatsoever | "Completed in 45s (faster than your average)" |

---

## 3. Design Principles

### 3.1 — Result-first, not run-first

The primary unit of display should be a **Result** (tied to the originating task/issue), not a **Run** (tied to a single agent execution). Multiple agent runs that serve the same task should be grouped together into a single result.

### 3.2 — Progressive disclosure

A non-technical user should see: **Result title → Output text → "This cost $0.02"**
An advanced user who clicks deeper should see: **Per-agent breakdown → Token counts → Transcript links → Raw JSON**

Never show tokens, invocation sources, or run IDs at the top level.

### 3.3 — Contextualise everything

Every number needs a frame of reference:
- Duration: "Completed in 45s" → add "(faster than your average)"
- Cost: "$0.02" → add "· ~$4.50/mo at this pace"
- Status: "3 of 5 agents complete" → not "3 running, 2 queued"

### 3.4 — Close the loop

Input (QuickInputBar) and Output (Results) must be visually and spatially connected. When you ask a question, you should be able to see the answer arriving in the same viewport without navigating away.

### 3.5 — Friendly language

| ❌ Current | ✅ New |
|---|---|
| Heartbeat run | Work session |
| Invocation source: timer | Scheduled |
| Invocation source: assignment | You asked |
| `$0.0034` | Less than 1¢ |
| 14,231 tokens | — (hidden by default) |
| `succeeded` | Done ✓ |
| `failed` | Something went wrong |
| Run ID: `a3f2c...` | — (hidden by default) |

---

## 4. The New Experience

### 4.1 — Dashboard Reorder

**Current order:**
1. Hero metrics (Agents / Tasks / Spend / Approvals)
2. QuickInputBar
3. Budget alerts
4. Active agents panel
5. 4 × Chart cards
6. LatestWorkFeed (buried here)
7. Fleet health + Budget forecast
8. Agent leaderboard
9. Plugins
10. Recent activity + Recent tasks

**New order:**
1. QuickInputBar (promoted to absolute top — the primary action)
2. **Live Progress Strip** ← NEW — shows any in-progress work
3. **Latest Results** ← PROMOTED — the first thing you see after the input
4. Hero metrics (simplified: Agents / Active Tasks / Month Spend)
5. Active agents panel (compact)
6. Charts (collapsed by default, expandable)
7. Everything else

The principle: **Input → Progress → Results → then operational details.**

### 4.2 — Live Progress Strip (New Component)

When any agents are currently working, show a strip below the QuickInputBar:

```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Working on "Competitor analysis of Acme Corp"           │
│  ████████████░░░░░░░  3 of 5 agents complete · 23s elapsed │
│                                                             │
│  ✓ Market Researcher — done (12s)                          │
│  ✓ Financial Analyst — done (18s)                          │
│  ✓ Content Writer — done (23s)                             │
│  ◉ Strategy Advisor — working...                           │
│  ○ Report Compiler — waiting                               │
└─────────────────────────────────────────────────────────────┘
```

**Behaviour:**
- Appears automatically when runs are in-progress
- Grouped by originating task/issue (not per-agent)
- Shows friendly agent names with simple status (done/working/waiting)
- Progress bar fills as agents complete
- Animates smoothly — feels alive
- When all complete → transitions into a Result card with a subtle celebration

**Data source:** Existing `HeartbeatRun` data filtered to `status === "running" | "queued"`, grouped by issue/task.

### 4.3 — Result Cards (Redesigned OutputCard)

Replace the current flat `OutputCard` with a **ResultCard** that groups by task:

```
┌─────────────────────────────────────────────────────────────┐
│  ✓ Competitor analysis of Acme Corp              2 min ago │
│                                                             │
│  [Rendered markdown output — the actual result]             │
│  This is the combined/primary output from the task,         │
│  rendered beautifully with full markdown support.           │
│                                                    Read more│
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📎 Deliverables                                     │   │
│  │  📄 Competitor Report (Google Doc)    🔗 Open        │   │
│  │  🌐 Preview Dashboard                🔗 View        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  This task cost less than 1¢ · Completed in 45s             │
│  5 agents contributed · You asked                           │
│                                                             │
│  [Review] [Export] [Run again]              ▸ See details   │
└─────────────────────────────────────────────────────────────┘
```

**Key changes from current OutputCard:**
- **Grouped by task** — one card per originating issue, not per agent run
- **Deliverables inline** — pull OutputArtifacts (PRs, preview URLs, docs) into the result card
- **Friendly cost** — "less than 1¢" not "$0.0034"
- **Context** — "Completed in 45s" with benchmark comparison
- **Next actions** — Review, Export, Run again buttons
- **Progressive disclosure** — "See details" expands to show per-agent breakdown, token counts, transcript links

### 4.4 — Cost Model Fix

The current cost model is broken in two ways:

**Problem 1: Micro-costs are meaningless**
`$0.0034` per run tells the user nothing. Fix:
- Under $0.01 → "Less than 1¢"
- $0.01–$0.99 → "2¢" / "47¢"
- $1.00+ → "$1.23"
- Aggregate at task level, not run level

**Problem 2: Month spend shows $0.00**
The dashboard MetricCard uses `formatCents(data.costs.monthSpendCents)` and the data appears to be zero. Two possible causes:
- Backend isn't aggregating costs correctly
- `billingType === "subscription_included"` is filtering everything out (line 116 of utils.ts)

**Fix approach:**
- Investigate backend: Check if `monthSpendCents` is being populated
- In the UI: Always show cost even for subscription_included (label it "included in plan" rather than hiding it)
- Add projections: "At this pace, ~$4.50/month" based on trailing 7-day average
- Add comparisons: "23% less than last month"

**New cost display hierarchy:**
1. **Task-level cost** (sum of all runs for that task) — shown on ResultCard
2. **Month-to-date** — shown in hero metrics
3. **Projection** — "At current pace: ~$X/month"
4. **Per-run breakdown** — hidden behind "See details"

### 4.5 — Outputs Page Redesign

**Current:** Flat chronological list of individual run outputs with search and agent filter.

**New:** Timeline-grouped results page:

```
Today
─────
  [ResultCard: Competitor analysis of Acme Corp]
  [ResultCard: Weekly social media content]

Yesterday
─────────
  [ResultCard: Q2 budget review]
  [ResultCard: Customer feedback synthesis]

Earlier this week
─────────────────
  [ResultCard: Product roadmap update]
```

**Changes:**
- Group by day with friendly headers
- Show ResultCards (task-grouped) not individual run cards
- Add status tabs: All / In Progress / Completed / Failed
- Keep search and agent filter
- Add cost summary at page top: "This week: $0.47 across 12 tasks"

### 4.6 — QuickInputBar Improvements

The current QuickInputBar is actually quite good. Small improvements:

1. **Don't navigate away** — Currently `navigate(`/issues/${issue.identifier}`)` takes the user to the issue detail page. Instead, show the Live Progress Strip right below the input. Let them watch the work happen.

2. **Smart mode detection** — The Tab-to-cycle-mode interaction is hidden. Instead, detect from the prompt:
   - "What is..." / "How do..." / "Tell me..." → auto-switch to Ask mode
   - "Create..." / "Build..." / "Write..." → auto-switch to Task mode

3. **Post-submit feedback** — After submitting, show a subtle confirmation in the input bar itself: "✓ Sent to [Agent Name] — watch below for results" with a downward arrow pointing to the progress strip.

### 4.7 — First-Time User Experience

For users who have never seen agentic workflows:

**Empty state (no outputs yet):**
```
┌─────────────────────────────────────────────────────────────┐
│                        🤖 → 📋 → ✨                         │
│                                                             │
│  Your agents are ready to work                              │
│                                                             │
│  Type a task above and your AI agents will collaborate      │
│  to get it done. Results appear here automatically.         │
│                                                             │
│  Try: "Write a summary of our Q2 performance"              │
│  Try: "Research competitors in the AI agent space"          │
│                                                             │
│  Typical tasks complete in 30-120 seconds                   │
│  and cost a few cents each.                                 │
└─────────────────────────────────────────────────────────────┘
```

**First result ever:**
After their first task completes, add a subtle onboarding tooltip:
"This is your first result! Your agents worked together to produce this. Click 'See details' to see which agents contributed."

---

## 5. Technical Implementation Plan

### Phase 1 — Dashboard Reorder + Live Progress (Highest Impact)
**Files:** `Dashboard.tsx`, new `LiveProgressStrip.tsx`
- Move QuickInputBar to top of dashboard
- Move LatestWorkFeed to position #3 (right after progress strip)
- Build LiveProgressStrip component
- Push charts below the fold

### Phase 2 — ResultCard (Replace OutputCard)
**Files:** New `ResultCard.tsx`, update `LatestWorkFeed.tsx`, `Outputs.tsx`
- Group runs by originating task/issue
- Pull in OutputArtifacts data inline
- Friendly cost formatting
- Next-action buttons
- Progressive disclosure for advanced details

### Phase 3 — Cost Model Fix
**Files:** `utils.ts`, `MetricCard` usage in `Dashboard.tsx`, backend investigation
- Friendly cost formatting helper
- Investigate monthSpendCents data
- Add projections
- Task-level cost aggregation

### Phase 4 — Outputs Page Redesign
**Files:** `Outputs.tsx`
- Timeline grouping (Today / Yesterday / This week)
- Status tabs
- Page-level cost summary
- Use new ResultCard component

### Phase 5 — QuickInputBar Loop Closure
**Files:** `QuickInputBar.tsx`, `Dashboard.tsx`
- Remove post-submit navigation
- Show inline confirmation
- Connect to LiveProgressStrip
- Smart mode detection

### Phase 6 — First-Time UX
**Files:** `LatestWorkFeed.tsx` empty state, new onboarding tooltip
- Friendly empty state with example prompts
- First-result celebration
- Contextual hints

---

## 6. Language Guide

For the entire UI, replace operational language with human language:

| Technical Term | User-Facing Term |
|---|---|
| Heartbeat run | — (never shown) |
| Run | Work session |
| Agent run succeeded | Done ✓ |
| Agent run failed | Something went wrong |
| Invocation source: timer | Scheduled |
| Invocation source: assignment | You asked |
| Invocation source: webhook | Triggered automatically |
| Token count | — (hidden, show only in details) |
| $0.0034 | Less than 1¢ |
| $0.0523 | 5¢ |
| Transcript | Full conversation log |
| resultJson | — (never shown) |
| Work product | Deliverable |
| Pull request | Code change |
| preview_url | Live preview |
| runtime_service | Running service |

---

## 7. Success Metrics

How we know this redesign worked:

1. **Time to first result** — A new user submits their first task and finds the result without clicking more than once
2. **Cost comprehension** — Users can answer "roughly how much did that cost?" without expanding details
3. **Progress anxiety** — Users don't refresh the page or click around looking for "is it still working?"
4. **Repeat usage** — Users submit a second task within the same session (they understood the loop)

---

## 8. Open Questions

1. **Grouping logic** — How do we associate runs with tasks? Current data has `agentId` on HeartbeatRun but the link to the originating issue may be through the issue's `assigneeAgentId` or through run context. Need to verify the data model.

2. **Multi-task swarms** — If a user submits a task and the swarm spawns sub-tasks, should ResultCard show the parent task or each sub-task?

3. **Cost backend** — Is `monthSpendCents` actually being populated? If not, we may need to compute it client-side from run costs.

4. **Real-time updates** — The progress strip needs live data. Currently data refreshes via React Query polling intervals. Do we need WebSocket or SSE for a truly live feel?

---

*This spec should be reviewed and signed off before any implementation begins. Each phase can be built and shipped independently.*
