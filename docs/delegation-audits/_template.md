# Delegation audit · {yyyy-mm-dd}

> Internal · Matt
> Time-box: one day
> Exit: one real multi-step task, chain executes without further intervention, every rough edge logged

## Setup

- **CEO agent:** {name / role / model / skills}
- **Task given:** {verbatim prompt you typed}
- **Why this task:** {why it represents a realistic multi-step piece of work}
- **Expected sub-tasks / routes:** {what you'd sketch on a whiteboard before starting}

## Watch log

Write as the chain runs. One line per event. Don't edit for prose.

| t+   | who routed to who | what happened | friction |
|------|-------------------|---------------|----------|
| 0:00 |                   |               |          |
|      |                   |               |          |

## Rough edges

Every point where the product made you sigh, guess, or click twice. Each becomes
an open issue — or a broken-window log entry if it's a copy/cosmetic nit.

- [ ] {thing} → #{issue or broken-windows.md anchor}
- [ ] 

## Delegation verbs & labels seen

Where did the UI say something other than `Route to` or `Claim` (per VOICE.md rule 9)?

- [ ] {page / button / label} — said `{word}`, should say `Route to` / `Claim`

## Cost & time

- **Total wall-time:** {start → end}
- **Total tokens / cost:** {from cost telemetry if present, or rough estimate}
- **Number of routes in the chain:** {how many agent→agent hops}
- **Human intervention count:** {times you had to step in past the initial prompt}

## Outcome

- **Did the chain complete without intervention?** yes / no
- **Was the output useful?** yes / partial / no
- **Would you run this chain again as-is?** yes / no — why

## Verdict

One paragraph. Does the delegation loop feel like the thing the product is best at?
If not, what's the single biggest gap?
