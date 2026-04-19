# Design voice

This is the design counterpart to `api/_lib/voice.js` (which governs AI copy).
Read it before adding a screen, empty state, modal, or onboarding flow.
If something you're building contradicts it, flag the contradiction in the
PR description so we can decide consciously — not drift.

---

## The feel we're after

A kitchen notebook someone actually uses. Dog-eared corners, pencil
notes in the margin, a scribble where they got excited. Calm, specific,
slightly imperfect. Not a dashboard. Not a pitch deck. Not an app store
screenshot.

---

## Patterns to avoid (the "AI-designed" tells)

These are the signals that make a UI feel generated. Every one of them
is tempting because it's "safe." Resist.

| Tell                                    | Why it reads as AI                                       |
|-----------------------------------------|----------------------------------------------------------|
| Three identical feature cards in a row  | Perfect symmetry is the single loudest tell              |
| Lucide/Heroicons on circular backgrounds| Stock icon + colored circle is the default pattern       |
| Three icons of equal visual weight      | No hierarchy — reads as a wireframe                      |
| Full-width glassy hero sections         | Gradient + center-aligned serif + ghost button = SaaS    |
| Badges everywhere ("New", "Popular")    | Marketing reflex, not information                        |
| Emoji in UI chrome                      | Compensating for lack of voice                           |
| Rounded-lg on everything                | `rounded-lg` is the `div` of design — too uniform        |
| Balanced tricolons in headings          | "Plan. Cook. Share." — see voice guide                   |
| Parallel three-step "How it works" lane | Equal-height cards with equal-length copy                |

---

## What we reach for instead

1. **Hand-drawn single-stroke glyphs.** Import from
   `src/components/glyphs.jsx`. Never inline a fresh SVG in feature
   code. If a glyph is missing, add it to the module — same 32×32
   viewBox, 1.5 stroke, round caps/joins, single pass. Lucide is
   allowed for plain chrome (chevrons, close buttons, menu icons)
   where hand-drawn would be noise, but never for feature glyphs.

2. **Numbered chapters over symmetric grids.** When you have three
   things to say, reach for an `ol` with oversized italic numerals
   (`01`, `02`, `03`) in Fraunces italic before you reach for three
   identical `<Card />`s. The number does the hierarchy work.

3. **One Scribble per screen.** Put the `<Scribble />` under a single
   italic word in the display heading. Never under two. Never as a
   horizontal rule replacement. It's a highlighter, not wallpaper.

4. **Broken symmetry on purpose.** Bento grids with varied column
   spans (`sm:col-span-4`, `sm:col-span-3`, `sm:col-span-2`).
   Alternating alignment. A glyph on the right for one row, left for
   another. If you're tempted to make three things identical, vary
   at least one axis.

5. **Squircle radius on CTAs.** `rounded-2xl` or `rounded-full` for
   primary buttons. `rounded-[22px]` for feature cards. Avoid the
   default `rounded-lg` — it's forgettable.

6. **Warm paper palette.** `bg-paper`, orange-50/orange-100 borders,
   orange-900 for display type. Sage for success. Purple ONLY for
   AI-owned surfaces. Don't reach for blue.

7. **Asymmetric hero spacing.** Hero headline hangs left of centre,
   prose hangs in a ~60% column, CTAs in the remaining ~40%. Avoid
   centred everything.

---

## State conventions

These signal *what a thing is* before the user reads the label. Reuse
them everywhere a meal, day, or list item can be in one of these
states — calendar grid, plan detail, shopping list, dashboards, etc.

**Home dinner (default, cooking in).**
Solid border, warm orange (`border-orange-300/80`, text `text-orange-800`).
When the card is open: `border-orange-500`, `bg-orange-50`.

**Eating out / dinner at someone else's.**
Dashed sage border (`border-dashed border-sage-400/80`, text
`text-sage-700`). The tile reads as different-but-belonging — same
page of the notebook, not a different section. Pair with a tiny
italic margin note pinned below the box: `@ Vera's` in
`font-display italic text-sage-600 text-[10px]`. The detail card for
that day tints sage (`border-sage-300/70 bg-sage-100/50`) and carries
a tiny sage pill: "eating out".

**Invited someone over.**
Same visual family as eating-out but with the pill reversed — "hosting".
(Not yet used in the sandbox but keep the colour convention aligned.)

**Swapped / crossed out.**
Keep the original dish on the page with a strikethrough
(`line-through decoration-[1.5px] text-orange-400`) and a margin note
in Fraunces italic pointing to the new choice: `→ ramen`. Don't
delete the old label — the swap *is* the story.

**Skipped / no dinner planned.**
(When we need it.) Leave the tile empty except for a faint single
pencil mark diagonal across the box — same colour family as a swap
but no label.

## Who's eating

Dinner isn't just a dish — it's who's at the table. Every day tile
and plan card should tell the household at a glance *who's in, who's
out, and who's extra*.

**Base row — household members.**
Under each day tile, a row of small circular initial chips
(`w-5 h-5`, monogrammed initial in Fraunces italic). One chip per
household member, in a consistent order.

**Home for dinner (default).**
Chip filled `bg-orange-100 text-orange-700`, solid outline. Reads as
"they're eating what's on the plan."

**Away that night.**
Chip goes faded — `bg-transparent text-orange-300 border-dashed
border-orange-300`. Optionally a tiny location pinned below:
`@ Vera's` in sage italic (same convention as the day-tile itself).
The shopping-list portion scales down automatically.

**Extra guest.**
Append a `+` chip after the household initials:
`bg-sage-100 text-sage-700 border-dashed border-sage-400`. If they
have a name, show the initial; if they're unnamed ("a friend"),
show `+1`. Two guests → `+2` or their two initials, whichever is
clearer. The portion scales up automatically.

**Order, always.**
Household members first, guests last, separated by a hair-thin
vertical divider in `border-orange-200` when both are present. The
row should feel like a kitchen clipboard, not a roster.

---

## Realtime collaboration cues

When a flatmate does something in a shared view, we need to convey
"that just happened, not by you" without pulling the user out.

**Ticked by someone else.**
Item shows as struck-through like any tick, but with a small
sage-tinted initial chip on the right: `Alex` in
`bg-sage-100 text-sage-600 rounded-full`. You ticked it → no chip.

**Live activity toast.**
A sage pill floats at the top of the panel with a circular initial
avatar and one italic sentence: *"Alex ticked pecorino at the shop."*
Lives ~4 seconds, no close button, no action. It's a nudge, not a
notification.

**Never use blue.**
Blue is the default "notification" colour in every other app. We use
sage for *someone else's activity* and orange for *your own state*.
Keep this consistent across the product.

---

## Primitives

All live in `src/components/glyphs.jsx`:

- `GlyphSprig`, `GlyphCalendar`, `GlyphBasket`, `GlyphStar`,
  `GlyphTwo`, `GlyphLink`, `GlyphPot`, `GlyphSpyglass`
- `Scribble` — the single hand-drawn underline
- `GLYPH_PROPS` — the shared SVG attribute bag. Spread it on any new
  glyph you add so stroke weight/caps stay consistent.

Type pairing (declared in Tailwind config):

- `font-display` → Fraunces (headings, italic accents, oversized numerals)
- `font-outfit`  → Outfit (body, UI, inputs)
- Never mix in a third family.

---

## Copy

See `api/_lib/voice.js` for the LLM-facing rules. The same rules apply
to hard-coded UI copy:

- Specific over generic: "15 AI suggestions per week" > "Limited AI"
- Contractions: "you're", "don't", "we'll"
- Mixed sentence lengths. A short one. Then one that winds a bit more.
- British English. "flavours", "starter", "favourite".
- No marketing verbs ("unlock", "unleash", "supercharge").
- No closing summary sentences that restate the section.

---

## Checklist for a new surface

Run this before calling a screen done:

- [ ] Hand-drawn glyphs from `glyphs.jsx` (no bare lucide for features)
- [ ] At most one `<Scribble />`, placed under an italic word in the heading
- [ ] No three identical cards in a row — broken in at least one axis
- [ ] Numbered chapter pattern considered for any "list of 3 options"
- [ ] Copy passes the voice guide (no tricolons, no marketing verbs)
- [ ] Primary CTA uses `rounded-2xl` or `rounded-full`, not `rounded-lg`
- [ ] Warm paper palette — no surprise blues or greys
- [ ] Any day/meal/list states follow the conventions in "State conventions"
- [ ] Realtime/other-user activity uses sage, never blue
