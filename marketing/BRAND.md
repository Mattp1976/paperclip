# Score Editorial

The visual philosophy for Orqestra.

## The movement

Score Editorial is the discipline of an orchestral score married to the
restraint of the great research-house printed page. It is a visual language
for institutions that take themselves seriously — places where intelligent
work is being orchestrated, parts are being conducted, and the listener
encounters not a single voice but a careful arrangement of many. Every
mark is positioned the way a composer positions a note: deliberately,
because removing it would damage the whole.

The page is a plain, nearly-paper substrate — the subdued cream or
off-white of an MIT Press monograph, a Bloomberg Businessweek feature,
or the inside of a hardcover programme note. Negative space is not
emptiness; it is the conductor's pause, the architectural plinth on which
every element sits. Generosity of margin is a moral choice, signalling
that this is something to be read slowly, considered, returned to.

Typography carries the work. A single editorial serif — IBM Plex Serif,
the kind of typeface a Pentagram designer would choose — does almost all
the talking, set in a small palette of weights and sizes with the
discipline of a Swiss grid. Display lines are large but never loud; body
text is set with enough leading to let each line breathe like an
instrument resting between cues. A geometric sans appears only as the
machine-readable accent: small caps, numerals, footers. Lowercase italics
carry the human voice; uppercase sans-serif carries the system's voice.

Color is reserved to the point of austerity. Near-black ink (#0E0E0C) on
a warm paper substrate (#F4EFE6) is the default; one accent — a deep,
slightly-aged oxblood (#8B2A2A) — appears so rarely that it functions as
italic emphasis. Photographs, if used, would be duotones in the same
restricted palette. The point is not to refuse colour but to honour it:
when it appears, it must mean something.

Compositions are governed by an invisible underlying score — an
orchestral grid where horizontal lines suggest time, vertical alignments
suggest section. Elements snap to baselines the way notes snap to bar
lines. There is asymmetry, but asymmetry is composed, not casual; every
off-axis decision balances against another. The reader's eye moves
across the page in tempo, guided by typographic weight and considered
whitespace rather than arrows or ornament.

Above all, the work must read as the product of countless hours by
someone at the top of their field. Every kerning pair has been judged.
Every line break has been hand-set. Every margin is the result of dozens
of trial proofs. Score Editorial is not minimalism for the sake of it —
it is the visible residue of relentless craft. The reader should not be
conscious of design at all; they should simply feel that they are in
serious hands.

## The buried reference

The mark is a quarter-note glyph: a perfect circle with a vertical stem
descending below the baseline. It reads as the letter Q (the silent
centre of orQestra) but also as the most elemental unit of orchestral
notation — one beat, one voice, one part of a larger arrangement. Those
who know music will feel it; those who don't will simply see a refined
monogram.

## Type stack

- **Display & body serif:** IBM Plex Serif. Regular for body, Bold for
  display, Italic for human voice, Bold Italic for emphatic display.
- **System voice (sans):** Outfit Regular / Bold. Used for small caps,
  buttons, labels, navigation. Never for paragraphs.
- **Tabular accent (mono):** IBM Plex Mono Regular. Used only for
  numerals, codes, identifiers — anything that should read as data.

## Color tokens

| Token        | Value     | Usage                                |
| ------------ | --------- | ------------------------------------ |
| `paper`      | `#F4EFE6` | Page background. Warm off-white.     |
| `ink`        | `#0E0E0C` | Body text and mark. Near-black.      |
| `ink-muted`  | `#5A564E` | Secondary text, captions.            |
| `rule`       | `#C9C2B4` | Hairline rules and dividers.         |
| `oxblood`    | `#8B2A2A` | Sole accent. Used like italic.       |
| `paper-dark` | `#13110D` | Inverse pages. Charcoal-on-warm.     |

## Spacing

The grid is built on an 8-pixel base unit, with major intervals at
`8 / 16 / 24 / 40 / 64 / 104 / 168 / 272` (Fibonacci-ish; never decimal).
All vertical rhythm derives from a 28-pixel baseline grid set to match
IBM Plex Serif at 18px / 28px line-height.

## Voice

- Sentence case, never title case.
- British English. "Orqestra orchestrates", "fortnightly", "amongst".
- Short declarative sentences. One verb. One subject. No marketing throat-clearing.
- Numbers in figures (3, 47), never spelled out.
- Em dashes, not hyphens, for parenthetical breaks.
- Never the word "leverage" or "empower". Never "AI-powered". Just say what it does.
