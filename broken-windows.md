# Broken-windows log

_Internal · Matt · started 2026-04-22_

The PLAN-30D Week 1 ritual: open the dogfood app, do one real thing, log
everything that makes you sigh. Fix three per day. Everything else parks
here — untouched, triaged later, not forgotten.

## How to use this

- **One entry per sigh.** Keep it to a single line. Save the essay for the commit message.
- **Tag it.** `#copy` `#ui` `#perf` `#data` `#packaging` `#flow` `#a11y` `#keyboard` — one tag, the most dominant.
- **Date it.** Walk date, not fix date. The log is a snapshot, not a changelog.
- **Route 3 of each day's sigh into a fix.** The rest stay open. Resist the urge to fix on discovery; the walk is for seeing, not sanding.
- **Graduate fixes.** Move completed items to `## Closed` with the commit SHA so the open list stays a backlog, not a trophy case.

---

## Triage legend

- `[ ]` open — walking shortlist
- `[>]` in-flight today
- `[x]` closed (move to the Closed section with SHA)
- `[~]` parked — can't reproduce / design call / future-me problem

---

## 2026-04-22 — seed walk (first day)

The following were flagged during the PLAN-30D Week 1 copy + AdvancedSection sweep.
Most were fixed in-flight. Listed here so the pattern is documented from day one.

- [x] `#copy` "Issues" leaking everywhere — Sidebar, charts, agent detail, approvals, templates, help. Fixed in the W1 copy audit.
- [x] `#copy` Sidebar `Composer` button name was a label nobody understood. Renamed to `New…`. Command palette updated to match.
- [x] `#copy` Title-case labels in Secrets dialogs: "Add Secret", "Rotate Secret". Now sentence case.
- [x] `#ui` `NewAgent` Company-skills section always visible even when the company has zero skills — cluttered the default create flow. Wrapped in `AdvancedSection` with a live count hint.
- [x] `#copy` Chart titles were Title-cased ("Run Activity", "Issues by Priority"). Sentence-cased throughout.
- [x] `#copy` ActivityCharts legend statuses ("To Do", "In Progress", "In Review") now sentence case.

## Open — walk backlog

- [ ] `#data` Parent-review card shows work-product count but no **cost per task** — Issue has no `costCents` field and the review row can't answer "was this £0.40 or £40?". Needs run-cost aggregation (or a cached `cost_cents` column on `issues`) before the review card's cost slot can be honoured. Blocks full #20 spec.

## Closed

_(graduate entries from Open with the commit SHA that closed them)_

---

## Themes to watch

Patterns that emerged from the seed walk. If the same tag shows up three walks in a row, it becomes a project, not a broken window.

- **Title Case → sentence case** migration is not finished. Expect more hits in page headers, dialog titles, and empty states as you walk fresh pages.
- **"Issue" vs "Task"** — shared types still use `HeartbeatRun.issue` / `issueId` / `issueKey` in code (deliberate, to avoid a big rename), but every user-facing surface must say "task". When in doubt, run `grep -n "issue" ui/src` on the diff.
- **"Advanced" disclosure** — any setting that doesn't help the default user succeed in the first 5 minutes is a candidate. If a section has >3 controls and ≥1 is rarely-touched, the rarely-touched ones go behind `AdvancedSection`.
