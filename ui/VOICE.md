# UI voice

Pinned rules for copy inside Paperclip's UI. Short enough to actually follow.

## Rules

1. **Sentence case for everything except proper nouns and the product name.**
   Buttons, labels, menu items, empty-state headlines — all sentence case. `New task`, not `New Task`. `Add goal`, not `Add Goal`. Exceptions: `Paperclip` (product), proper nouns, acronyms. Page-level H1s that are a single word (`Dashboard`, `Agents`) stay capitalised.

2. **No trailing periods on one-line UI copy.**
   Headings, empty-state headlines, button labels, toast titles — no period. `No agents yet`, not `No agents yet.` Keep periods on descriptions that are complete sentences.

3. **Say "task" in user-facing copy.**
   The codebase calls them `issues` and the routes are `/issues`, but users see `task` everywhere — sidebar, buttons, empty states, dialogs. Never leak `issue` into user copy.

4. **Empty states are two parts.**
   - **Headline** — what's empty, in under four words. `No agents yet`.
   - **Description** — one sentence describing what the thing is or what you get, not what button to click. The button is the CTA.

5. **No `get started` / `to get started` filler.**
   The description should describe the feature, not repeat the CTA. Bad: `Create your first agent to get started.` Good: `Agents run work on schedules or on tasks you give them.`

6. **British English.**
   `Organise`, `customise`, `colour`. Matt's British. The product's British.

7. **`New` beats `Add` for create actions.**
   `New task`, `New agent`, `New project`. Reserve `Add` for adding an existing thing to a container (add member, add secret).

8. **Declarative, not addressed.**
   Describe what the thing is, not what the user should do. `Agents run work on schedules` — not `Your agents will run work for you`.

9. **One verb for delegation: `Route to`.**
   When work moves from operator→agent or agent→agent, the verb is `Route to`. `Route to Sarah`, `Route to CEO`, `Route to unassigned`. Not `Assign`, not `Hand off`, not `Delegate`. `Assign` is reserved for inert role-setting (e.g. `Assign owner` on a project). For self-claim (user takes the task), use `Claim` — avoids the awkward `Route to me`. The noun is still `delegation`; only the verb is pinned.

## When in doubt

Write it like a terse colleague would. Short. Concrete. No marketing puff. If a sentence has "seamlessly", "empowers", or "unlock" in it, delete that sentence.
