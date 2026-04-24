# Dogfooding discipline

Internal process doc for running real Future Collective client work through Paperclip and feeding the friction back into the product.

## Why this matters

Paperclip is a control plane for autonomous AI companies. The fastest way to know whether it's actually that is to run an actual company on it — mine. If a TFC workflow can't happen inside Paperclip, that's the product roadmap, not a TFC problem to route around. Every time I use a Notion board, a Slack channel, or a raw Claude conversation to work around a Paperclip gap, the product loses a signal and the gap compounds.

This doc pins the cadence, the format, and the exit criteria so the dogfooding doesn't drift into either "I vaguely use it" or "I spend all week navel-gazing the tool instead of shipping work."

## Who dogfoods what

**Operator**: Matt (matt@future-collective.co.uk), company `THE` on the production instance.

**Workloads that must live inside Paperclip** — if I catch myself doing any of these elsewhere, it's a finding:

- Client research briefs (sales account research, competitor scans, market sizing).
- Proposal drafting.
- Weekly reporting to clients.
- Recurring content pipeline (newsletter, social drafts, blog outlines).
- Lead-gen lists + outreach drafts.
- Internal ops: invoice chasing, calendar triage, inbox triage.
- Any engineering work on Paperclip itself — routinely routed through a Paperclip agent rather than typed into Claude directly.

**Workloads explicitly not in scope** (handled outside Paperclip on purpose): accounting/bookkeeping software, signed contracts, anything touching client PII that hasn't been approved for the production instance yet.

## Cadence

**Daily (5 min, start of day)** — open the TFC company dashboard. Check:

1. Is at least one agent actively running something useful?
2. Did any run fail overnight? If yes, is the failure a Paperclip bug or a prompt bug?
3. Are any approvals blocking work?

If the answer to (1) is no three days running, that's a finding about onboarding friction or default surface.

**Weekly (30 min, Friday afternoon)** — dogfood review. Go through:

1. What TFC work did Paperclip do this week? (Look at the Outputs page.)
2. What TFC work did I do outside Paperclip that should have been inside? (Memory + calendar review.)
3. Which findings from the week are filed? Which aren't yet?
4. What's the top 1-3 product changes this suggests?

Log the review as a short note in the TFC company — literally a Paperclip issue titled `Dogfood review YYYY-MM-DD`. No external doc.

## What counts as a finding

Anything that made me reach for a non-Paperclip tool for work that should have fit in Paperclip, or anything that made Paperclip unpleasant to use for work that did fit. Specifically:

- **Friction**: too many clicks, confusing copy, a defaulted-wrong form field, a loading state that's silent, a page that 404s.
- **Gap**: the workflow genuinely isn't supported — no route, no adapter, no surface for it.
- **Bug**: something that used to work and now doesn't, or something that contradicts what the UI says it will do.
- **Language debt**: a label or error message that made me pause to parse it.
- **Scope creep / bloat**: a page that's grown three settings I never touch and bury the one I do.

Things that are *not* findings: me forgetting a keyboard shortcut, me not reading a tooltip, genuine product decisions I disagree with but that are working as spec'd (those go in the roadmap discussion, not as findings).

## Finding format

Every finding is a GitHub issue with the `dogfood` label. Template:

```
Title: <one-line summary in active voice>

**What I was trying to do**
<the TFC workflow — 1 sentence>

**What happened / what got in the way**
<1-3 sentences, specific — include route, button, error text>

**Why this matters for the product**
<1-2 sentences — who else would hit this, how often, severity>

**Kind**: friction | gap | bug | language | bloat
**Severity**: blocker (I had to use something else) | drag (slowed me down) | papercut
```

Labels: `dogfood`, plus one of `friction`, `gap`, `bug`, `language`, `bloat`.

Don't triage into milestones while filing. Triage happens in the weekly review.

## Exit criteria

Dogfooding-as-explicit-process graduates when all of the following are true for four consecutive weeks:

1. At least 80% of TFC billable-hour work passes through Paperclip at some point (draft, brief, output storage, review).
2. The weekly review consistently finds zero blocker-severity findings.
3. New findings trend downward week-over-week (and the ones that appear are mostly `bloat` / `language`, i.e. polish, not `gap` / `bug`).

At that point the weekly review drops to monthly, the daily check drops to "check when something feels off," and the product has earned the claim on its own homepage.

Until then, the discipline is the product strategy.
