# Tiers & monetisation model

This is the canonical reference for how the app's access tiers work, why they were designed this way, and where each gate lives in the code. It reflects the design conversation from April 2026 and the implementation that followed.

---

## Quick reference

| | Free | Gifted / Premium | BYOK — Gemini key | BYOK — Puter |
|---|---|---|---|---|
| **Weekly AI calls** | 15 + 5 × members | Unlimited | Unlimited | Unlimited |
| **Recipe search results** | 4 | Unlimited | 8 | Unlimited |
| **Pantry name normalisation** | — | ✓ | ✓ | ✓ |
| **Shopping list AI polish** | — | ✓ | ✓ | ✓ |
| **Deals search (AH / Jumbo)** | — | ✓ | ✓ | — |
| **Waste insights** | Counts toward limit | Free | Free | Free |
| **Day swap / regenerate** | Counts toward limit | Free | Free | Free |
| **Side dish suggestions** | Counts toward limit | Free | Free | Free |
| **Settings badge** | "Free plan" | "Premium · Active" | "Gemini key — unlimited" | "Puter AI — unlimited" |

**Deals note:** deals search uses Google Search grounding, which only works with a personal Gemini API key. Puter users do not get deals access even though they have unlimited AI otherwise.

---

## How the free-tier AI budget works

The weekly limit is not a flat number — it scales with household size:

```
limit = 15 + (5 × memberCount)
```

| Household | Members | Weekly limit |
|-----------|---------|-------------|
| Solo | 1 | 20 |
| Couple | 2 | 25 |
| Three flatmates | 3 | 30 |
| Four flatmates | 4 | 35 |

The pool is shared across the household, not per-person. Inviting someone to your kitchen raises the shared budget — both members benefit. The formula is computed at request time from `household_members` count; no schema changes are needed to adjust it.

**Formula lives in:** `api/_lib/usage.js` → `memberBasedLimit(supabase, householdId)`

---

## Tier details

### Free (default)

Every new user lands here. The kitchen works, AI plans the week, and the shared list stays in sync.

**What's included:**
- Recipe search: 4 results shown, remaining results locked with a "Upgrade for full access" prompt
- AI week planner, day swap, side dish suggestions, waste insights — all available, each call counts against the weekly budget
- Shared meal plan, shopping list, pantry

**What's not included:**
- Pantry name normalisation (the "did you mean black pepper or bell pepper?" disambiguation)
- Shopping list AI polish (stripping prep words from ingredient names — "finely sliced onion" → "onion")
- Deals search
- More than 4 recipe search results

**Upgrade prompts:**
- At 60% usage: progress bar turns orange
- At 100%: a "Kitchen limit reached" card appears in the week planner with the upgrade CTA
- An "Upgrade →" button is always visible on the usage card in Settings

---

### Gifted / Premium (admin-granted)

Households where `household_preferences.is_gifted = true`. This is the current stand-in for a paid Premium subscription — it grants the full Premium feature set without a billing flow. Intended for beta testers, early supporters, and internal households.

`is_gifted` is **per-household** — set it independently for each household in the Supabase dashboard.

**What's included:**
- Everything in Free, plus:
- Unlimited AI calls (no weekly counter)
- Unlimited recipe search results
- Pantry name normalisation
- Shopping list AI polish
- Deals search (AH and Jumbo)

**UI behaviour:** Settings shows a "Premium · Active" badge with "Unlimited AI · 8 recipe results · all features included." instead of the usage meter.

---

### BYOK — Bring Your Own Key

Users who connect their own Gemini API key or a Puter token in Settings get unlimited AI. These paths exist as a bridge until direct subscriptions launch.

**Gemini key** (`household_preferences.gemini_api_key_encrypted`):
- Unlimited AI calls
- 8 recipe search results
- All AI features including deals search
- Settings badge: "Gemini key — unlimited"

**Puter token** (`household_preferences.puter_token_encrypted`):
- Unlimited AI calls
- Unlimited recipe search results (no result cap at all)
- All AI features **except** deals search (requires Google Search grounding via Gemini)
- Settings badge: "Puter AI — unlimited"

**BYOK is a household-level setting** — anyone in the household who connects a key lifts the limit for everyone. This is the current structural incentive problem (see design rationale below).

---

### Premium subscription — coming soon

The intended future state. **Not yet built.** Payment infrastructure, per-user plan tracking, and the personal feature set are deferred until billing is ready.

**Planned:** €2.99/month per person  
**Model:** Option D (see design rationale below)

**What it will include:**
- Your AI contribution to the shared pool: 5/week → 50/week
- 8 recipe search results
- Faster AI generation
- Export meal plans to PDF or Google Calendar
- Recipe history and cooking insights
- Advanced recipe filters (cuisine, time, macros)
- Cross-household favourites sync
- Shopping list share link and PDF export

**Your subscription follows you.** If you're in two households, your 50/week contribution applies to both kitchens independently. Your personal features (exports, history, etc.) work in all of them.

**Current state of the upgrade CTA:** The "Upgrade →" button in Settings and the limit-reached card in the week planner both open a "coming soon" modal showing the Premium feature list and a disabled "Coming soon — we'll notify you when it's ready" button.

---

## Feature gating — code reference

| Feature | Gate | File | Notes |
|---------|------|------|-------|
| Weekly AI limit | `checkAndIncrementUsage()` | `api/_lib/usage.js:37` | Returns `true` if over limit; all AI handlers call this |
| Dynamic free limit | `memberBasedLimit()` | `api/_lib/usage.js:27` | `15 + 5 × memberCount` |
| Gifted check | `isGiftedHousehold()` | `api/_lib/usage.js:68` | Reads `household_preferences.is_gifted` |
| Provider resolution | `resolveAiProvider()` | `api/_lib/ai-call.js:~38` | Puter → Gemini key → shared key, in that order |
| Recipe result count | `isPaid` / `isBYOK` check | `src/App.jsx:~3013` | Free: 4; Gemini BYOK: 8; Puter/gifted: unlimited |
| Pantry normalisation | `hasUnlimitedAi` check | `src/App.jsx:~1697` | Skipped for free households; falls back to raw name |
| Shopping list polish | `hasUnlimitedAi` check | `src/App.jsx:~2443` | The "AI polish pass — only for premium/gifted" block |
| Deals search (UI gate) | `hasDealsAccess` | `src/components/WeekSuggestModal.jsx:70` | `is_gifted \|\| gemini_api_key_hint` |
| Deals search (API gate) | Gemini-only check | `api/_lib/ai-handlers/search-deals.js:~18` | Returns 403 for shared key or Puter |
| Week suggest limit | 429 with `code: weekly_limit_reached` | `api/_lib/ai-handlers/suggest-week.js:~48` | |
| Recipe generate limit | Same | `api/_lib/ai-handlers/generate-recipe.js:~30` | |
| Batch generate limit | Same (one check per batch) | `api/_lib/ai-handlers/generate-recipes-batch.js:~33` | |
| Suggest single limit | Same | `api/_lib/ai-handlers/suggest.js:~25` | Optional auth; unsigned users bypass |
| Usage API response | Returns `used`, `limit`, `unlimited`, `gifted` | `api/household/usage.js` | `gifted` flag drives the "Premium · Active" badge |
| Upgrade modal | `showUpgradeModal` state | `src/App.jsx:~1025` | Coming-soon stub; opened by "Upgrade →" |
| Limit-reached card | `errorStatus === 429` | `src/components/WeekSuggestModal.jsx:~406` | Styled card instead of plain red error |
| `ai_credits` | Fetched but unused | `api/household/usage.js` | Legacy field; not enforced anywhere |

---

## Design rationale — why Option D

*This section records the design conversation from April 2026 in full, as the authoritative source of intent.*

### The problem with the old model

The original model had a flat free-tier limit of 25 calls/week per household. Any single member who connected a Puter token or Gemini key unlocked **unlimited AI for the entire household** — eliminating any reason for other members to pay. The flat limit also didn't account for household size or multi-household membership.

Goals for the new model:
- Non-paying members still get value (the shared kitchen works)
- There are real, felt reasons for individuals to upgrade
- Households with 5 members aren't expected to all pay full price
- Users in multiple households are not penalised

---

### Options considered

#### Option A — Per-member scaling budget

Each member has a personal weekly AI budget. The household pool = sum of all members.

- Free: 10/week per member
- Paid: 50/week per member

**Pros:** scales with household size; paying helps you and your kitchen; works across multiple households.  
**Cons:** slightly complex data model; requires per-member plan tracking.

---

#### Option B — Household flat fee (Cozi model)

One subscription unlocks unlimited for the whole household.

- Free: scales by member count
- Paid: €5.99/month, unlimited for everyone

**Pros:** simple mental model.  
**Cons:** "one pays, everyone benefits" problem still exists at the household level; multi-household creates a "which household gets my subscription?" problem; household admin churn takes everyone down.

---

#### Option C — Personal premium features (Notion-style)

Keep the shared AI pool unchanged. Add personal features that only the subscriber gets.

- Personal features: unlimited personal AI, exports, recipe history, 8 results, cross-household sync

**Pros:** every member has individual reasons to pay; no "one person unlocks for everyone" problem; multi-household works perfectly.  
**Cons:** requires building genuinely valuable personal features; doesn't address the multi-household AI budget problem.

---

#### Option D — Per-member budget + personal premium features ← chosen

Combines Option A (contribution pool) with Option C (personal feature layer). Two reasons to upgrade: you want more for the shared kitchen, and you want things only you get.

**Pool formula:** `15 + (freeMembers × 5) + (paidMembers × 50)`

| Household | Setup | Shared pool |
|-----------|-------|-------------|
| Solo, free | 15 + 1×5 | 20/week |
| Solo, paid | 15 + 1×50 | 65/week |
| Couple, both free | 15 + 2×5 | 25/week |
| Couple, one paid | 15 + 5 + 50 | 70/week |
| Couple, both paid | 15 + 2×50 | 115/week |
| Flatshare of 4, all free | 15 + 4×5 | 35/week |
| Flatshare of 4, one paid | 15 + 3×5 + 50 | 80/week |

One person paying in a couple lifts the pool from 25 → 70/week — nearly 3× the shared budget.

**Multi-household:** your subscription follows you. You contribute 50/week to every household you're in. Personal features work in all of them.

**Why Option D over the alternatives:**
- Strongest per-person incentive
- The shared kitchen still works for free members — nobody is locked out
- Existing premium features (faster AI, more recipe results) finally have a proper upgrade path rather than "get a Puter key"
- Personal features are exclusive — not diluted by sharing
- Works cleanly across multiple households
- Dual upgrade incentive: shared pool AND personal perks
- Nudging is contextual (you hit a real limit) rather than artificial

**Trade-offs accepted:**
- More complex than a flat household fee
- Some personal features still need to be built (export, history, advanced filters)
- Requires per-user plan tracking in the database when billing is added

---

### What's built now vs. deferred

**Built (April 2026):**
- Dynamic free-tier limit (`15 + 5 × memberCount`) replaces the flat 25
- 60% usage soft-warning on the progress bar
- "Kitchen limit reached" card in the week planner with upgrade CTA
- "Upgrade →" button in Settings → coming-soon Premium modal
- Gifted households show "Premium · Active" badge
- Pricing page on sign-up updated to reflect Option D (free / Premium coming soon / BYOK)

**Deferred (needs billing infrastructure):**
- Per-user plan column (`is_premium` on `household_members` or a `user_subscriptions` table)
- Paid member contributing 50/week (slot into `memberBasedLimit()`: replace `5` with `50` for paid members)
- Personal feature gating: exports, recipe history, advanced filters, shopping list PDF
- Household toast when a member upgrades ("Alex upgraded — your kitchen now has 70/week")
- Upgrade flow, payment provider, subscription management

---

### Nudging strategy

1. **Usage bar at 60%:** progress bar turns orange
2. **Hard limit:** "Kitchen limit reached" card — not a silent failure
3. **Soft paywalls (deferred):** export/history buttons visible but locked, clicking opens upgrade sheet
4. **Household nudge (deferred):** toast to all members when someone upgrades
5. **Onboarding:** pricing page at sign-up shows the feature table before habits form
6. **Framing:** "Add 45 suggestions to your shared kitchen" — giving to the household, not just self-benefit

---

### Competitor landscape

| App | Model | Key insight |
|-----|-------|-------------|
| Cozi | €40/year flat household | Works because the price is low and the value is obvious. |
| OurGroceries | €6/year — one payer removes ads for all | Tolerable because the price is tiny. |
| Mealime | €5.99/month individual | One account shared by household in practice; not enforced. |
| AnyList | €9.99/yr individual, €14.99/yr family | Explicit family tier, slightly more expensive. |
| 1Password | €48/yr individual, €72/yr family (5) | Family is 50% cheaper per person — strong incentive to buy family tier. |
| Splitwise | €30/yr individual only | Community asks for a couple tier. Charging per-person creates friction. |
| Notion | €10/seat, guests free | Guests get limited access; collaborators pay per seat. |
| Netflix (post-2023) | €15/month + €8 per extra-household member | Proves "one pays, all benefit" breaks at scale. |

**Pattern:** healthy household apps either have a very low household flat fee (math is obviously worth it) or a per-seat model where guests get limited free access and power users pay for themselves. Option D follows the per-seat pattern.
