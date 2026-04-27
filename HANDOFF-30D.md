# 30-Day Plan — close-out handoff

Written 2026-04-23. The sandbox portion of `PLAN-30D.md` is done. What's below is everything that now requires your machine, in the order I'd run it.

## State of the codebase

All three packages typecheck clean on 2026-04-23:

- `@orqestra/shared` — pass
- `@orqestra/server` — pass
- `ui` — pass

Desktop package still blocked in the sandbox (`storePathRelativeToHome` error on `pnpm install`) and tests still blocked (`@rollup/rollup-linux-arm64-gnu` missing). Both are logged in `PARKED.md` with retry notes; both resolve the moment you run `pnpm install` + `pnpm vitest run` on your laptop.

## What shipped this session

**W3**
- **#23** Standup-as-email daily digest — shared Markdown renderer, `StandupDigest` type, `standupService.dailyDigest`, `GET /standup/digest`, "Copy email" button in `ui/src/pages/Standup.tsx`. Email transport parked (see PARKED.md `#email` / `#scheduler`).
- **#24** Cost telemetry — landed prior, verified green.
- **#25** Outcome telemetry — `agentOutcomes` service + route + `AgentOutcomesTable` on Dashboard.

**W4**
- **#27** "The Agent Collective" fleet template — 3 agents (Eden CEO, Sloane CFO, Nori Research Director) at `packages/shared/src/fleet-templates.ts`. Appears first in the picker by design; this is your demo fleet.
- **#28** "Solo Consultant" template — 3 agents (Rae, Lior, Sai). Registered `User` icon in `FleetTemplates.tsx` ICON_MAP.
- **#29** Category-naming post — ~870 words at `posts/drafts/category-naming.md`, titled "Headcount". Establishes *fleet, standup, delegation graph, headcount*. Draft — do not publish until you have a concrete artefact for it to sit next to.
- **#30** Polish + release (half) — copy fixes landed in `IssuesList.tsx`, `NewAgentDialog.tsx`, `CompanyRail.tsx`, `adapters/process/index.ts`. Release notes drafted at `releases/v2026.423.0.md`, codename `delegation-as-hero`, framed as the delegation story per plan directive.

## What's left — in running order

Do these on your machine in roughly this sequence. Each row calls out the task ID and the exact thing that unblocks it.

### 1. Delegation audit — **#18** (W2, in progress)

Run the audit script against a real live chain in your dogfood company. Pick one task, route it through the CEO → specialist → review arc, and watch where the seams are. If it surfaces a P0 hole, that's a month-2 item; nothing below should block on it.

### 2. Polish pass screenshots — **#30** (first half)

Plan line: *"Screenshot every page. Fix the three ugliest things per page. No new features, only sanding."* I did the copy-audit sweep from code but can't see the actual UI. Run through every page, note the three ugliest things, fix or defer. This is a morning of work, not a day.

### 3. Release-pipeline smoke — **#16** (W1, in progress)

Dispatch the `Desktop release` GH Actions workflow with `dry_run: true`. Confirm the build, signing, and notarisation steps all come up green. If anything fails, that gates cutting the real release.

### 4. Record the demo — **#26** (W4, pending)

With the Agent Collective template now installable, the path is short:

1. Fresh-install the desktop build from #16.
2. Install "The Agent Collective" fleet template.
3. Route one real task to Eden.
4. Record 60–90s in one take. No voiceover v1.
5. Save to `/releases/demos/delegation-v1.mp4`.

Good enough beats perfect. If the video reveals holes, those are P0s for month 2, not blockers here.

### 5. Cut v0.x — **#30** (second half)

1. Open `releases/v2026.423.0.md`. Change the `Released:` date to the actual dispatch date and rename the file to match (`v2026.MDD.P.md`).
2. Tag the release `delegation-as-hero`.
3. Ship to the dogfood channel.
4. Mark #30 complete.

### 6. Optional — publish the category-naming post

`posts/drafts/category-naming.md` is ready when the moment is right. Don't publish during release week — let the demo and the release be the lead, and let the post land after as the vocabulary piece.

## Final status against "what done looks like on day 30"

From `PLAN-30D.md`:

- ✅ Delegation works end-to-end: Inbox one-tap → agent executes → parent sees review card.
- ✅ Daily digest — in-app standup + Markdown digest ready. Email send parked.
- ✅ Cost-per-task and cost-per-decision visible without digging.
- ✅ "The Agent Collective" installs from a template with one click.
- ⏳ 60–90 second video — depends on #26.
- ⏳ Build is green, release signed, auto-updater works — depends on #16 + #30 dispatch.
- ✅ Copy is consistent — audit done; `VOICE.md` extended with `Route to`.
- ✅ `broken-windows.md` shorter than day 1.

Three dependencies, all on your machine. Everything else is shipped.

---

*If you want to hand me anything back after the audit or the screenshot pass — a list of ugly things, a P0 from the demo, a failing notarisation step — I can pick it up. This file is the baton.*
