# LLM Prompts Reference

All prompts start with the **VOICE GUIDE** (`api/_lib/voice.js`) prepended, unless noted. The voice guide instructs the model to write like a home cook, not an AI assistant: specific temperatures and times, no marketing language, British spelling, contractions, short sentences.

---

## 1. Week Planner — `api/_lib/ai-handlers/suggest-week.js`

**Trigger:** User taps "Plan my week" in the Week Suggest modal and clicks Generate.

**Context injected:**
- Household-level preference text (free-form, written by users)
- Per-member names and personal preferences
- Starred recipes with rotation priority (HIGH / MEDIUM / OCCASIONAL)
- Recently eaten recipes (last 10, to avoid repeats)
- Rating history: loved (4–5★) and disliked (1–2★) dish names
- Pantry items (prefer recipes that use these)
- This week's supermarket deals (optional, requires own Gemini key)
- Weekly budget (optional)
- "Easy night" flag (one genuinely simple dinner)
- Standing extras text (breakfast/lunch/snacks the household always wants)
- One-off wishes for this specific week
- Per-day notes (e.g. "long day Monday")
- Number of weeks (1 or 2)

**Key planning rules:**
- Different main protein AND cuisine each day; no repeated hero ingredient on consecutive days (applies to breakfast extras too)
- One "cook once, eat twice" per week; leftovers can land 1–2 days later, not forced next-day
- Extras (breakfast/lunch/snacks) only when there is a clear signal: explicit request, standing instruction, or strong pattern in preferences — never invented
- HIGH-priority starred recipes appear in week 1
- Waste-first: side dishes and extras reuse ingredients already in the plan

**Output schema:**
```json
{
  "weeks": [{
    "days": [{
      "day": "Monday",
      "skip": false,
      "starred_id": "<id or null>",
      "name": "<dinner recipe name>",
      "overview": "<one sentence>",
      "cuisine_type": "<Italian / Asian / etc.>",
      "prep_time": 15,
      "cook_time": 25,
      "reason": "<one sentence: why this dish today>",
      "leftover_for": "<e.g. 'Tuesday lunch' or null>",
      "uses_pantry": ["<pantry items used>"],
      "side_dish": {
        "name": "<side or null>",
        "description": "<one sentence>",
        "prep_time": 10,
        "cook_time": 5,
        "ingredients": [{"name": "...", "amount": "..."}]
      },
      "extras": [{
        "meal_type": "breakfast",
        "name": "<recipe name>",
        "overview": "<one sentence>",
        "prep_time": 10,
        "cook_time": 5,
        "reason": "<why this extra>"
      }]
    }]
  }],
  "notes": "<2–3 sentences on overall plan shape>"
}
```

---

## 2. Single-Day Regeneration — `api/_lib/ai-handlers/regenerate-day.js`

**Trigger:** User types a swap request in the text field under a day card (or taps "Another" for a fresh suggestion).

**Context injected:** Same household context as the week planner (preferences, starred, ratings, pantry, members). Plus:
- Current recipe name for the day
- The user's change request (free-text)
- Other days' recipe names in the week (to avoid duplicates)
- Whether this is a dinner swap or an extras swap (breakfast/lunch)

**Key rules — ordered by priority:**
1. **Honour the request precisely.** Deliver exactly what was asked for.
2. **Adapt, don't replace** — if the request is additive ("add carbs", "make it heartier") or dietary ("dairy-free"), keep the dish concept and reformulate.
3. **Cooking time** — weekdays ≤ 40 min, Friday ≤ 50 min, weekends ≤ 90 min; user request overrides.
4. **No duplication** with other days this week.

**Output schema:**
```json
{
  "day": "Monday",
  "starred_id": "<id or null>",
  "name": "<recipe name>",
  "overview": "<one sentence>",
  "cuisine_type": "<Italian / Asian / etc.>",
  "prep_time": 10,
  "cook_time": 25,
  "reason": "<why this satisfies the request>",
  "leftover_for": null,
  "uses_pantry": ["<pantry items used>"]
}
```

---

## 3. Recipe Suitability Check — `api/_lib/ai-handlers/suggest.js`

**Trigger:** User opens a recipe from search results; the app checks it against household preferences.

**Context injected:** Recipe name and full ingredient list, household preference text, up to 10 starred recipe names (for context on tastes).

**Prompt (no voice guide prepended here beyond the standard header):**
> Analyse this recipe for a household and return suitability information.

**Output schema:**
```json
{
  "suitable": true,
  "issues": ["issue 1"],
  "substitutions": [{"original": "ingredient", "substitute": "alternative", "reason": "why"}],
  "tips": ["tip 1"]
}
```

---

## 4. Full Recipe Generation — `api/_lib/ai-handlers/generate-recipe.js`

Two modes: **generate** (first time, no existing recipe) and **adjust** (modify an existing recipe).

### 4a. Generate

**Trigger:** User taps "Fill in recipe" on an AI-stub card (dish name only, no ingredients/steps yet).

**Context injected:** Dish name, one-sentence overview, cuisine type, estimated total time, optional side dish name + description + partial ingredients.

**Prompt essence:** Write a complete recipe for `<name>` for 2 people, adapted to any dietary implication in the dish name. If a side dish is included, write steps for it too.

**Output schema:**
```json
{
  "ingredients": [{"name": "chicken thighs, bone-in skin-on", "amount": "2"}],
  "steps": ["Pat the chicken dry..."],
  "servings": 2,
  "prepTime": 10,
  "cookTime": 30,
  "macros": {"calories": 520, "protein": 38, "carbs": 22, "fat": 28},
  "side_dish_steps": ["Heat oil...", "..."]
}
```

### 4b. Adjust

**Trigger:** User types a modification request ("make it dairy-free", "add rice", "less spicy") on an existing recipe.

**Context injected:** Existing recipe name, full ingredient list, all steps, the user's request text. Existing macros are provided as a reference point so the model recalculates from scratch rather than returning zeros.

**Key rule:** Change only what was requested. Additive requests (e.g. "add rice") must weave the new ingredient into the existing steps, not tack on a note at the end. Update timing if the addition changes cook time.

---

## 5. Batch Recipe Generation — `api/_lib/ai-handlers/generate-recipes-batch.js`

**Trigger:** Fired automatically in the background after a week plan is accepted, for all AI-stub recipes (those with no ingredients yet).

**Why batch:** The rate limiter counts the entire batch as one AI call, so accepting a full week doesn't consume N slots.

**Prompt:** Identical to "Generate" above (4a), one call per stub in the batch, all fired in parallel with `Promise.all`.

**Output schema:** Same as 4a per recipe; results returned as `{ results: [{ id, success, ...fields }] }`.

---

## 6. Side Dish Suggestions — `api/_lib/ai-handlers/suggest-side.js`

Two modes: **side dish for a recipe** and **surprise bag meals**.

### 6a. Side dish

**Trigger:** User taps "Add a side" under a recipe in the week plan.

**Prompt:**
> Suggest 2–3 quick side dishes to go with `<recipe name>`. `<preference if any>`. Pantry (already on hand, prefer when it fits): `<pantry items>`. Each side should be simple (under 15 min).

**Output schema:**
```json
{"suggestions": [{"name": "...", "description": "one line", "ingredients": [{"name": "...", "amount": "..."}]}]}
```

### 6b. Surprise bag meals

**Trigger:** User enters ingredients from a surprise food bag.

**Prompt:**
> A home cook just got a surprise food bag with these ingredients: `<list>`. `<dietary notes>`. Pantry: `<pantry>`. Suggest 2–3 complete meals they can cook with what they have.

**Output schema:** Same as 6a.

---

## 7. Shopping Insights — `api/_lib/ai-handlers/shopping-insights.js`

**Trigger:** User opens the shopping list; fires in the background to identify waste-reduction opportunities.

**No voice guide — plain system prompt.**

**Prompt essence:**
> You are a sustainable shopping advisor helping reduce food waste. This household is cooking these meals this week: `<recipe names>`. Their shopping list: `<item + amount list>`. Identify up to 5 ingredients where the household will likely buy more than they need. For each, give a short practical tip and suggest one concrete dish to use the leftover.

**Output schema:**
```json
{"insights": [{"ingredient": "spinach", "tip": "Bags are usually 200–250g; toss the rest in tomorrow.", "suggestion": "Quick spinach frittata for lunch"}]}
```

---

## 8. Supermarket Deals Search — `api/_lib/ai-handlers/search-deals.js`

**Trigger:** User taps "Include this week's deals" in the Week Suggest modal. Requires own Gemini API key (uses Google Search grounding, not available on shared key).

**No voice guide.**

**Prompt:**
> Today is `<date in Dutch locale>`. Search for items currently on offer (in bonus / aanbieding) at Albert Heijn and Jumbo supermarkets in the Netherlands this week. Focus on ingredients useful for home cooking: fresh produce, meat, fish, dairy, and staples. Skip cleaning products, snacks, alcohol, and ready meals.

**Output schema:**
```json
{"deals": [{"item": "spinach", "store": "Albert Heijn", "price": "€0.89"}]}
```

Up to 20 items. Uses `googleSearch: {}` tool (Gemini-native grounding).

---

## Voice Guide (shared across all prompts)

From `api/_lib/voice.js`:

**Avoid:**
- Parallel scaffolding ("whether you're X or Y")
- Balanced tricolons ("fast, easy, and affordable")
- Marketing verbs (elevate, leverage, unleash, transform)
- Puffy adjectives (seamless, effortless, vibrant, bursting)
- Adverb stacking (incredibly, absolutely, truly)
- Assistant openers ("Here's a wonderful recipe", "Sure!")
- Emoji, exclamation marks, bold/italic in prose

**Do instead:**
- Be specific: name the temperature, time, technique
- Mix sentence lengths
- Use contractions
- British English spellings (favourite, flavour, yoghurt)
- Plain dish names ("Chicken thighs with lemon and olives", not "Mediterranean-inspired chicken with a bright citrus twist")
- Overviews: one sentence, factual, warm — how you'd describe it to a flatmate
