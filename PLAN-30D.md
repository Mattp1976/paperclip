# Paperclip — 30-day evolution plan

_Internal · Matt · 2026-04-22 → 2026-05-22_

## North star (day 30)

A 60–90 second video that makes a stranger say "oh, I get it now." The product does one thing better than anything else on the market: **delegate work to a fleet of agents and show the operator what happened overnight**. Everything below serves that video.

If a decision in the next 30 days doesn't sharpen the delegation loop, make proof more credible, or close a door a competitor could walk through — defer it.

## Non-goals this month

- No new adapters. If a new model drops, resist for 30 days — the differentiator is the layer, not the adapters.
- No new plugin work beyond what's needed to seed the catalog.
- No new top-level sidebar surfaces (`Composer`, `Swarm`, `Fleet` get consolidated, not joined).
- No GTM work (ICP, pricing, design partners) until the proof exists.
- No enterprise polish (RBAC, audit, SSO, policy UI).

## Guiding filter for every commit

One of three must be true:

1. **Sharpens the wedge** — the delegation loop is more obvious, more robust, or more beautiful.
2. **Accelerates proof** — moves the demo video, the template install, or the daily digest closer.
3. **Closes a door** — eliminates something a competitor could do that we can't.

If none apply, it goes in the backlog.

---

## Week 1 — Close the build gap (Apr 22 – Apr 28)

**Goal:** dogfood instance is something you'd happily show a stranger cold.

- **Finish the copy audit.** Sweep remaining pages the Apr 22 pass didn't touch: `AgentDetail`, `Approvals`, `ApprovalDetail`, `IssueDetail`, `Templates`, `Composer`, `Help`. Apply the rules in `ui/VOICE.md`.
- **Decide "Composer."** Either fold into a Power-tools group behind an `AdvancedSection`, or rename to what it actually does. Do it this week — a sidebar label nobody understands is a tax on every new user.
- **Roll `AdvancedSection` to 3–4 more pages** identified during the sweep. Candidates: `NewAgent` (Company skills), `Secrets` (rotation/import controls), `InstanceGeneralSettings` (if more toggles land).
- **Release pipeline smoke-test.** Full green typecheck across shared/server/ui/desktop, signed .dmg, notarised, auto-updater resolves. If any link in that chain is stale, fix it before writing more code.
- **Daily 30-min broken-window walk.** Open the dogfood app, do one real thing, log everything that made you sigh. Fix three per day. Defer the rest to a single `broken-windows.md` list.

**Exit criteria:** dogfood build is green, signed, auto-updates, copy is consistent, and `Composer` either has a clear meaning or doesn't exist in the sidebar.

---

## Week 2 — Delegation as hero (Apr 29 – May 5)

**Goal:** agent-to-agent handoff becomes the most obvious thing the product does.

- **Delegation audit (Mon).** Hire a CEO. Give her a real multi-step task ("prep a market scan on UK legal tech"). Watch the full chain. Every rough edge — missing button, confusing status, ambiguous state — becomes a task. Time-box: one day.
- **Inbox one-tap "Route to…"** action on every item. Default picker ranks agents by role + skill tag match. Single-click assignment, undoable.
- **Review card.** When a child agent completes work, the parent's Inbox shows a 30-second decision card: 1-line summary, output preview, cost, `Accept / Reject / Comment`. No bulk ops v1.
- **Delegation-graph view** on the agent detail page. Who routes to me, who I route to. Visual, not text. Keep it small — 200×120 — it's context, not the main event.
- **Copy-audit sweep of delegation surfaces.** "Route to", "Assign", "Hand off" — pick one verb and use it everywhere. Add to `VOICE.md`.

**Exit criteria:** you hire the CEO, give her one task, and the delegation chain executes without further intervention. Review card appears. Graph shows.

---

## Week 3 — Push, not pull (May 6 – May 12)

**Goal:** turn the Standup page from a place you visit into a habit loop that finds you.

- **Standup-as-email.** Daily digest job at 08:00 local. Markdown body, no templating framework. Sections: overnight work, decisions pending, 24-hour plan, cost. Reuse the Standup page renderer.
- **Cost telemetry.** Ship cost-per-task and cost-per-decision on `AgentDetail`. Add company-level cost rollup on Dashboard ("this week · last week · month"). No ROI claims yet — just the raw numbers, credible.
- **Outcome telemetry.** Resolved-task count per agent per week, grouped by cost tier. One row per agent. Sortable.
- **Sanity cross-check.** Standup page content must match the email digest. If they diverge, one is wrong. Single source of truth, two renderers.

**Exit criteria:** every morning you open your email and see "your fleet did X, costing £Y, here are 3 decisions pending." You stop opening the app first thing.

---

## Week 4 — Proof and package (May 13 – May 22)

**Goal:** capture the demo. Turn the live fleet into a shareable template. Cut the release.

- **Record the 60–90 second demo.** One take, no voiceover v1. "I hire a CEO. I give her this task. Watch." Save to `/releases/demos/delegation-v1.mp4`. Good enough beats perfect.
- **Package "The Agent Collective" as a template.** One-tap install seeds the CEO + CFO + Research Director branch. Test on a fresh install from a clean desktop build.
- **Template marketplace scaffolding.** Not the whole marketplace — just the install flow, plus a second template ("Solo consultant" — 3 agents) so the UX isn't a special case of one.
- **Draft the category-naming post.** 600–1000 words. *Fleet, standup, delegation graph, agent headcount.* Don't publish — just draft, so the vocabulary is yours the moment you need it.
- **Polish pass.** Screenshot every page. Fix the three ugliest things per page. No new features, only sanding.
- **Cut v0.x.** Tag it `delegation-as-hero`. Ship to dogfood channel with release notes that tell the delegation story, not a changelog.

**Exit criteria:** a video link, a fresh-install template, a signed release, and a drafted post ready to publish when the moment comes.

---

## Daily cadence

- **Morning, 20 min.** Open the dogfood app. Do one real thing with it — not a dev thing, a user thing. Write down anything that made you sigh.
- **Evening, 15 min.** Review the broken-windows list. Ship three fixes or defer them with reason.
- **Friday, 30 min.** Look at the week's commits. Does the filter (`sharpens wedge / accelerates proof / closes door`) apply to 80% of them? If not, prune next week's plan.

## Risks and watch-outs

- **Delegation isn't actually wired end-to-end.** If week 1's audit uncovers a structural hole, week 2 becomes the fix and weeks 3–4 compress. Plan for this — keep week 4 flexible.
- **Email templating eats days.** Time-box to Wednesday of week 3. If not shipping by then, demote to in-app-only digest and save email for month 2.
- **Template install has edge cases on a fresh machine.** Test from a signed production build, not a dev build. Dev builds lie.
- **The video reveals holes.** Good. Every hole is a P0 for month 2, not a blocker for recording.
- **Scope creep from "just one more adapter / plugin / surface."** The entire point of the non-goals section is to make this easy to say no to. Re-read it on Mondays.

## What "done" looks like on day 30

- Delegation works end-to-end: Inbox one-tap → agent executes → parent sees review card.
- Daily digest email runs on schedule and says something useful.
- Cost-per-task and cost-per-decision are visible without digging.
- "The Agent Collective" installs from a template with one click on a clean machine.
- A 60–90 second video exists and you're not embarrassed by it.
- The build is green, the release is signed, the auto-updater works, the copy is consistent.
- `VOICE.md` has been extended with delegation vocabulary.
- `broken-windows.md` is shorter than it was on day 1.

## What this plan is NOT

- It is not a roadmap. Roadmaps live in `HANDOFF.md` / `UX-REDESIGN-SPEC.md` / the issue tracker.
- It is not a GTM plan. That comes after the proof exists.
- It is not comprehensive. Dozens of smaller improvements will slot in around the named work — that's fine.
- It is not a contract. If week 2's audit redirects the month, the plan should bend. What can't bend is the north star: **delegation, visible, undeniable, on day 30**.
