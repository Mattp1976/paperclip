# Parked

_Running list of things deliberately deferred during PLAN-30D work. One line each, no essays. When an item becomes actionable, move it into a task or close it here with a note._

Format: `- [date parked] [tag] [one-line description] — [why parked] [what it blocks]`

---

## Environmental (sandbox can't do this; need Matt's local machine)

- [2026-04-22] #desktop `pnpm install --filter @orqestra/desktop` fails in the sandbox with a `storePathRelativeToHome` error — blocks `pnpm typecheck` on the desktop package and any local-run of the Electron app.
- [2026-04-22] #testing `pnpm vitest run` in the sandbox dies on missing `@rollup/rollup-linux-arm64-gnu` — blocks running the new `rankAgentsForTask.test.ts` + `inbox.test.ts` suites in-loop. Matt runs them locally. (Retried 2026-04-23: same error. Still parked.)
- [2026-04-22] #release Signed .dmg / notarisation / auto-updater smoke on #16 — needs Matt to dispatch the `Desktop release` GH Actions workflow with `dry_run: true` from a local trigger. Source-side work is complete; only the actual build step is parked.

## Scope cuts in delivered features

- [2026-04-22] #data Review-card **cost per task** — not shown because `Issue` has no `costCents` field today. Cost lives on runs. Blocks full #20 spec line `"1-line summary, output preview, cost, Accept / Reject / Comment"`. Fix = cache per-issue cost aggregate (run → issue) or add cost lookup API. Also logged in `broken-windows.md`.
- [2026-04-22] #ui Review-card **output preview** shows only a work-product count, not actual content snippet — click-through required. Upgrade later if the count-only summary proves too thin during delegation audit.
- [2026-04-22] #ux Review-card has **no bulk ops** v1 (e.g. "accept all by this agent") — per plan `"No bulk ops v1"`. Revisit if queue gets noisy.
- [2026-04-22] #ux Review-card `Reject` just flips status back to `in_progress` with no comment-capture prompt — MVP. A nicer flow would open a one-line reason input inline. Park until the delegation audit shows it's actually needed.
- [2026-04-23] #email Standup digest has **no email transport** — `/standup/digest` renders Markdown and the UI has a "Copy email" button, but nothing sends it. Codebase has no nodemailer/resend/SES. Blocks the full #23 spec line *"daily email"*. Fix = pick a transport (Resend looks right for a desktop app with SMTP credentials) and wire it behind a per-company setting.
- [2026-04-23] #scheduler Standup digest has **no 08:00 cron job** — `pluginJobs` table supports cron scheduling but nothing schedules the daily digest. Gated on email transport above (no point scheduling a job that has nowhere to send to).

## Considered but not pursued

- [2026-04-22] #copy `Assignee` noun label in filters/columns left unchanged (Rule 9 governs the **verb**, not the noun). Revisit if the audit shows it confuses the verb.
- [2026-04-22] #ui `RouteToAction` picker shows all ranked agents; no "recently used" short-list at top yet. The existing `recent-assignees` util could be folded in — park until there are enough agents in a test company to notice the difference.

---

## How to use this

- When you park something, add one line here with a date and a tag.
- When a parked item becomes a task, delete it here and reference the task ID.
- When a parked item is no longer relevant, delete it here with a one-line reason in the commit message.
- If the same tag collects ≥3 entries, that's a signal it's a project, not a parking ticket.
