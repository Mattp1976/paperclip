# Orqestra — Product Maturity Phase (Master Build Brief)

**Status:** Active. This brief governs the next phase of work. All build decisions in this phase must pass the North Star test.

**North Star:** *Does this reduce cognitive load for the user? If not, do not build it in this phase.*

**The shift:** From system-first / agent-centric / configuration-heavy → outcome-first / human-readable / confidence-building / commercially obvious.

**The 10-minute test:** A user lands in Orqestra, types the outcome they want, reviews a plan, approves it, watches an AI company run, and receives a finished work product.

---

## Phases

### Phase 1 — Outcome-first onboarding
Replace setup-heavy onboarding with a single outcome brief input.

- **New route:** `/{COMPANY_PREFIX}/start` — preferred entry point for new companies.
- **Components:** `OutcomeStart.tsx`, `OutcomeBriefInput.tsx`, `RecommendedCompanyCard.tsx`, `GeneratedPlanPreview.tsx`, `ApproveAndRunPanel.tsx`.
- **Primary label:** *"What outcome do you want?"*
- **Supporting copy:** *"Describe the result. Orqestra will shape the team, plan the work, and ask before anything important runs."*
- **Voice:** British, sentence case, terse, no marketing puff. Say "task" not "issue". Use "Route to" not "Assign". Per `ui/VOICE.md`.

### Phase 2 — Make Orchestra the front door
Outcomes sit *above* tasks, agents, dashboards, and approvals.

**New dashboard hierarchy:**
1. Outcome command input
2. Active outcomes
3. Pending decisions
4. Live work narrative
5. Cost and forecast
6. Agent activity
7. Recent outputs

**Outcome detail page (`/{COMPANY_PREFIX}/outcomes/:outcomeId`)** — must answer instantly: what's being delivered, what's happening now, who's doing the work, what decisions are needed, what it'll cost, when it'll be ready, what's been produced.

**Sections:** Outcome header, Execution state, Plan timeline, Agent team, Live narrative, Cost panel, Decision queue, Work products, Final assembly.

**Acceptance:** A non-technical founder understands the outcome status in under 30 seconds.

### Phase 3 — Clipmart v1
Templates become a true product entry point: a marketplace of pre-built autonomous companies.

**Six launch templates** (each with starter outcomes):

| # | Template | Purpose |
|---|----------|---------|
| 1 | AI content studio | Plans, researches, writes, edits, ships content |
| 2 | Market intelligence unit | Tracks competitors, trends, signals, opportunities |
| 3 | Sales ops engine | Researches prospects, writes outreach, follows up, keeps CRM clean |
| 4 | Product launch team | Plans launches, messaging, assets, risks, execution |
| 5 | Strategy execution office | Turns goals into plans, owners, reviews, outputs |
| 6 | Solo consultant support team | Research, writing, admin, proposals, follow-up |

**Route:** `/{COMPANY_PREFIX}/clipmart`
**Components:** `Clipmart.tsx`, `CompanyTemplateCard.tsx`, `TemplateDetailDrawer.tsx`, `InstallCompanyButton.tsx`, `StarterOutcomesList.tsx`.
**Card shows:** name, plain-English purpose, team size, typical outcomes, setup time, required adapters, install button.
**Primary CTA:** *"Install company"*.

### Phase 4 — Narrator layer
The system explains itself while it works. Plain-English narration of what's happening, why it matters, what changed, what decision is needed, what happens next.

- **Service:** `server/src/services/narrator.ts`
- **Routes:** `GET /companies/:companyId/narrative`, `GET /orchestra/outcomes/:id/narrative`
- **Components:** `NarrativePanel.tsx`, `OutcomeNarrative.tsx`, `DashboardNarrative.tsx`, `DecisionNarrative.tsx`
- **Rules:** factual, concise, non-hypey, transparent about uncertainty, based on actual system state. Never invent progress. No motivational fluff. No fake confidence.

### Phase 5 — Decision queue
Approvals become a proper decision layer. For every decision: what's requested, why it matters, cost implication, risk implication, recommendation, alternatives where possible.

- **Route:** `/{COMPANY_PREFIX}/decisions` (eventually replaces or sits above current approvals page)
- **Components:** `DecisionQueue.tsx`, `DecisionCard.tsx`, `DecisionTradeOffs.tsx`, `ApprovalRecommendation.tsx`

### Phase 6 — Cost as a confidence engine
Every outcome shows estimated cost, live cost, cost by agent, cost by step, projected final cost, human-equivalent estimate, confidence level.

- **Components:** `OutcomeCostPanel.tsx`, `CostForecast.tsx`, `CostComparison.tsx`, `AgentCostBreakdown.tsx`
- **Important:** human-equivalent must be clearly labelled as an estimate, never presented as financial proof.

---

## Build priority order

| Sprint | Deliverable | Success metric |
|--------|-------------|----------------|
| 1 | Outcome-first onboarding | A new user can create and approve their first outcome in under 10 minutes |
| 2 | Outcome detail maturity | A user can understand an active outcome without opening tasks |
| 3 | Clipmart v1 | A user can install a useful AI company in one click |
| 4 | Narrator layer | The system explains what is happening without requiring the user to inspect logs |
| 5 | Decision queue + cost layer | The user understands trade-offs before approving spend or execution |

---

## Non-negotiable principles

1. **Hide complexity, do not remove it.** Power users still get agents/tasks/skills/costs/plugins/org-charts/settings — but the default path should not require them.
2. **Outcome beats agent.** Don't make the user manage agents first.
3. **Plain English everywhere.** Avoid: "execute workflow", "spawn issue", "invoke adapter", "runtime event", "orchestration lifecycle". Prefer: "start work", "create task", "run agent", "activity", "work stage".
4. **Trust before automation.** Always show: what will happen, what it may cost, what decisions are needed, what can be stopped.
5. **No fake intelligence.** When unsure, say so: *"Confidence is low because there is not enough source material yet."*

---

## Definition of 10/10 product maturity

1. A new user understands the product in 60 seconds
2. A first useful outcome can be started in under 10 minutes
3. The dashboard explains what is happening without training
4. Clipmart removes setup friction
5. Costs are visible and confidence-building
6. Approvals feel like decisions, not admin
7. The product feels like managing outcomes, not managing software

---

## Final instruction

> Do not optimise for feature count. Optimise for inevitability.
> The question is not "Can Orqestra do more?" — it is "Can a user trust Orqestra faster?"
> Build the shortest path from intent to outcome.
