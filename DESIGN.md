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

5. **Radius on CTAs.** `rounded-full` for pill-shaped primary CTAs
   (use `shadow-warm-lg` and explicit `px-8`). `rounded-lg` for compact
   buttons inside cards via `src/components/ui/button.jsx`. `rounded-[22px]`
   for feature cards. Never use `rounded-lg` directly on hero-level CTAs —
   it reads as a form element, not an invitation.

6. **Warm paper palette.** `bg-paper` on the landing/auth screens only.
   The authenticated app shell uses `bg-white` — clean and modern, letting
   the orange-tinted cards and tiles do the warmth work. orange-50/orange-100
   borders throughout. Sage for success. Purple ONLY for AI-owned surfaces.
   Don't reach for blue.

7. **Asymmetric hero spacing.** Hero headline hangs left of centre,
   prose hangs in a ~60% column, CTAs in the remaining ~40%. Avoid
   centred everything.

---

## Design tokens — where every value lives

**One source of truth.** Colours, fonts, shadows and radii are declared
in two files and nowhere else:

- `src/index.css` — raw CSS variables for the colour scales (light +
  dark), the `bg-paper` utility, the body gradient, and dark-mode
  surface remaps.
- `tailwind.config.js` — re-exports those vars as Tailwind tokens
  (`bg-orange-100`, `text-sage-600`, etc.), declares the two font
  families, keyframes and `shadow-warm` / `shadow-warm-lg`.

Feature code must not hardcode hex, rgb, or named colours. If a shade
isn't in the scale, add it to both files — don't sneak in a one-off.

### Colour palette — what each step means

Light mode values are the defaults; the `.dark` block in
`src/index.css` flips the scale so classes like `text-orange-900`
automatically re-theme.

| Token           | Role                                                                |
|-----------------|---------------------------------------------------------------------|
| `orange-50`     | Soft cream — page backgrounds, open-state card fills                |
| `orange-100`    | Warm sand — subtle surfaces, member-chip fill, badge backgrounds    |
| `orange-200`    | Muted peach — hair-thin dividers, second-tier borders               |
| `orange-300`    | Soft warm clay — default tile borders, faded labels                 |
| `orange-400`    | Warm stone — secondary text, placeholders, times, meta labels       |
| `orange-500`    | Deep rust — brand primary, CTA fills (buttons, pills)               |
| `orange-600`    | Richer rust — the "Together" hero italic, the one accent for links, active states, italic annotations |
| `orange-700`    | Dark rust — heavy accents, sign-in link                             |
| `orange-800`    | Dark warm brown — body copy                                         |
| `orange-900`    | Near-black with warmth — display type, heading serif                |
| `amber-50`      | Lightest background tint for the hero gradient                      |
| `amber-100`     | Slight background uplift in the hero radial                         |
| `sage-100`      | Shared-with / success fill (chips, toast bg)                        |
| `sage-400`      | Dashed "away" borders, success accent                               |
| `sage-500`      | "Alex just ticked X" toast; check tick fills                        |
| `sage-600`      | Success/shared-state text                                           |

**Three text colours, nothing else:**

| Class              | Role                                                      |
|--------------------|-----------------------------------------------------------|
| `text-orange-900`  | All readable text — headings, body, labels, values        |
| `text-orange-600`  | The one accent — active states, links, italic annotations |
| `text-orange-400`  | Muted only — placeholders, disabled, secondary metadata   |

Success/shared states use `text-sage-*` (400/500/600). Errors use
`text-red-500`. White text appears only on coloured backgrounds.
No grey. No green. No amber. No blue. No pure black.

**Purple** is reserved for AI-owned surfaces (Puter, model prompts).
Don't reach for it for anything else.

**Background discipline:**
- `body` is plain white — no gradient
- `.bg-paper` (landing + auth only) carries the full warm gradient
- App shell → `bg-white`; sticky header → `bg-white/90`
- Cards/items → `bg-white`; active/selected state → `bg-orange-50`

### Typography

Declared in `tailwind.config.js` + `src/index.css`. Two families only.

| Class          | Family   | Used for                                              |
|----------------|----------|-------------------------------------------------------|
| `font-display` | Fraunces | Headings, italic accents, numerals, margin notes      |
| *(default)*    | Outfit   | Body, UI chrome, inputs, buttons                      |

Fraunces has `letter-spacing: -0.02em` baked in via the class — don't
override. Italic Fraunces is the "handwritten" voice: reach for it
for margin notes, asides, chapter markers, dish times.

Never mix in a third family. Never use serif for body. Never render
Fraunces at weights below 400.

### Radius scale

| Token            | Pixels | Use                                                      |
|------------------|--------|----------------------------------------------------------|
| `rounded-[4px]`  | 4      | Tiny checkboxes, hand-drawn tick boxes                   |
| `rounded-[10px]` | 10     | Day tiles in a week grid                                 |
| `rounded-[14px]` | 14     | Small floating chips (basket button, pinned counter)     |
| `rounded-[16px]` | 16     | Inner cards within a sheet (menu popover, list popover)  |
| `rounded-lg`     | 8      | Primary buttons via `components/ui/button.jsx`           |
| `rounded-2xl`    | 16     | Input fields, plan cards                                 |
| `rounded-[18px]` | 18     | Mid-level cards that want less squircle                  |
| `rounded-[22px]` | 22     | Feature / notebook sheets — the signature squircle       |
| `rounded-3xl`    | 24     | Auth card, full-screen modal sheets                      |
| `rounded-full`   | ∞      | Pills, chips, avatars, pill-shaped CTAs                  |

Use `rounded-lg` only via `<Button>` — don't reach for it directly in
one-off elements. For anything that isn't a Button, use `rounded-2xl`
or the squircle brackets.

### Shadows

| Token          | Use                                                   |
|----------------|-------------------------------------------------------|
| `shadow-warm`  | Cards, plan items, basket chip — subtle warm lift     |
| `shadow-warm-lg` | Hero CTAs, auth card, lifted modals — stronger    |

Both use `rgb(120 70 30)` with low alpha so the shadow reads warm.
Never use default Tailwind `shadow-md` / `shadow-lg` — they're blue-grey
and fight the palette.

### Stroke weights

| Weight | Where                                                         |
|--------|---------------------------------------------------------------|
| `1.5`  | All glyphs (`GLYPH_PROPS.strokeWidth`), day-tile borders      |
| `2.5`  | `<Scribble />` only — the hand-drawn underline                |
| Never `1` | Reads as UI chrome, not drawn                              |

`border-[1.5px]` is the default tile/plan-item border weight.

### Opacity conventions

We use fractional tints over solid colour stops so the palette feels
washed-paper. Common ones you can reuse:

| Class              | Reads as                                               |
|--------------------|--------------------------------------------------------|
| `/60`, `/70`       | Soft-surface bg (`bg-white/70`, `bg-sage-100/70`)      |
| `/80`, `/85`       | Body copy on cream (`text-orange-800/85`)              |
| `/40`              | Decorative strokes (Scribble, ghost arrows)            |
| `/22`, `/14`       | Radial gradient tints in `bg-paper`                    |

### Animations

Declared in `tailwind.config.js`:

- `animate-slide-up` — 0.3s ease-out, used on modal entries
- `animate-fade-in`  — 0.4s ease-out, general fades

No others. Don't ship bespoke keyframes without adding them here.

### Illustration + glyph style

Living source: `src/components/glyphs.jsx`. Every glyph:

- 32×32 viewBox
- `stroke="currentColor" fill="none"` — always
- `strokeWidth 1.5`, round caps/joins (via `GLYPH_PROPS`)
- Quadratic curves between points, never sharp polygons — edges
  should bow slightly as if pencil-drawn
- Slight asymmetry, imperfect returns at path end — an object
  sketched on a napkin, not an icon set
- One continuous pencil pass where possible

For larger illustrated scenes (not glyphs — e.g. the landing's
`NotebookWeekScene`), same principles scaled up: curvy outlines, slight
rotation on inner elements, Fraunces italic for any "handwritten"
text pinned to the illustration.

### Dark mode

Opt-in via `.dark` on `<html>`. The orange scale flips so existing
classes keep their semantic meaning (`text-orange-900` is still
"display heading colour"). A handful of remap rules in `src/index.css`
re-tint `bg-white/*` surfaces and legacy `bg-green-*` / `text-green-*`
uses. Don't add new green classes — use sage.

### Brand exceptions

Hardcoded hex is forbidden in feature code with two narrow exceptions
where matching a foreign brand matters more than palette consistency:

- `AuthScreen.jsx` Google brand mark: `#4285F4 #34A853 #FBBC05 #EA4335`
- `GrocerHandoffModal.jsx` grocer brand chips:
  `#00ADE6` (Albert Heijn), `#EEB017` (Jumbo), `#E1022F` (Picnic)

If you add a new external brand, extend this list — never scatter
unexplained hex in components.

---

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

## CTA hierarchy

One page, one primary action. Never two filled buttons competing.

| Level     | Style                                                       | When                        |
|-----------|-------------------------------------------------------------|-----------------------------|
| Primary   | `bg-orange-500 text-white rounded-full px-8 shadow-warm-lg` | One per page/modal          |
| Secondary | `border-orange-400 text-orange-700 rounded-full`            | Alongside primary           |
| Tertiary  | Text link, underline, `text-orange-700 decoration-orange-300` | Sign in, dismiss, less-used |

Rule: the hero must have exactly one explicitly styled pill button. The decorated text (`font-display`, `TextRotate` animation) is brand copy — not the click target.

---

## Surface discipline

Don't use `bg-orange-50` as the default fill for every item — it makes the whole screen feel warm-heavy and indistinct.

| Surface         | Class              | Use                                                    |
|-----------------|--------------------|--------------------------------------------------------|
| Landing/auth    | `bg-paper`         | Pre-login screens only                                 |
| App shell       | `bg-white`         | Authenticated wrapper                                  |
| Card/item       | `bg-white`         | Recipe cards, plan items, list rows                    |
| Active/selected | `bg-orange-50`     | Pressed, selected, or open state only                  |
| Section block   | `bg-orange-50/60`  | Full-width alternating sections (not individual items) |

Rule: if you catch yourself putting `bg-orange-50` on every list item, stop. Use `bg-white` items with `border-orange-100` dividers instead.

---

## Checklist for a new surface

Run this before calling a screen done:

- [ ] Hand-drawn glyphs from `glyphs.jsx` (no bare lucide for features)
- [ ] At most one `<Scribble />`, placed under an italic word in the heading
- [ ] No three identical cards in a row — broken in at least one axis
- [ ] Numbered chapter pattern considered for any "list of 3 options"
- [ ] Copy passes the voice guide (no tricolons, no marketing verbs)
- [ ] Primary CTA uses `<Button>` from `components/ui/button.jsx`
- [ ] Warm paper palette — no surprise blues or greys
- [ ] Any day/meal/list states follow the conventions in "State conventions"
- [ ] Realtime/other-user activity uses sage, never blue
