import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../auth.js';
import { VOICE_GUIDE } from '../voice.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { checkAndIncrementUsage, isGiftedHousehold } from '../usage.js';
import { searchPhoto } from '../pexels.js';
import { buildDietaryGuardrails } from '../dietary-guardrails.js';
import { buildLocationSection } from '../season.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT_TO_LONG = {
  'mon': 'Monday', 'tue': 'Tuesday', 'tues': 'Tuesday', 'wed': 'Wednesday',
  'thu': 'Thursday', 'thur': 'Thursday', 'thurs': 'Thursday',
  'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday',
};
function normalizeDay(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  const long = DAYS.find((d) => d.toLowerCase() === s);
  if (long) return long;
  return DAY_SHORT_TO_LONG[s] || null;
}
const PRIORITY_LABELS = { 1: 'HIGH — include every week', 2: 'MEDIUM — include every 2 weeks', 3: 'OCCASIONAL — include if it fits' };

export default async function handleSuggestWeek(req, res) {
  try {
    return await _handler(req, res);
  } catch (err) {
    console.error('[suggest-week] unhandled error:', err);
    return res.status(500).json({ error: `Internal error: ${err.message}` });
  }
}

async function _handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { weeks = 1, plan_extras_text = '', day_notes = {}, this_week_wishes = '', weekly_budget = null, simple_night = false, deals = [], language = 'English' } = req.body || {};
  const numWeeks = Math.min(Math.max(Number(weeks) || 1, 1), 2);

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { provider, token, usingSharedKey } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  if (usingSharedKey && !(await isGiftedHousehold(supabase, ctx.householdId, ctx.user.id))) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Your kitchen's weekly AI limit has been reached. Upgrade for more, or wait until next week.`,
        code: 'weekly_limit_reached',
      });
    }
  }

  const [{ data: prefData }, { data: starredData }, { data: cookedData }, { data: recentPlanData }, { data: membersData }, { data: pantryData }] = await Promise.all([
    supabase.from('household_preferences').select('preferences_text, meal_prep_mode, meal_prep_set_by_name, measurement_system, diet_variety, country').eq('household_id', ctx.householdId).maybeSingle(),
    supabase.from('starred_recipes').select('recipe_id, recipe_data, rotation_priority').eq('household_id', ctx.householdId),
    supabase.from('cooked_recipes').select('recipe_id, rating').eq('household_id', ctx.householdId),
    supabase.from('meal_plan_items').select('recipe_data, added_at').eq('household_id', ctx.householdId)
      .order('added_at', { ascending: false }).limit(60),
    supabase.from('household_members').select('display_name, personal_prefs').eq('household_id', ctx.householdId),
    supabase.from('pantry_items').select('name').eq('household_id', ctx.householdId),
  ]);

  const preferences = prefData?.preferences_text || '';
  const mealPrepMode = prefData?.meal_prep_mode || false;
  const measurementSystem = prefData?.measurement_system || 'metric';
  const dietVariety = prefData?.diet_variety || 'balanced';
  const country = prefData?.country || '';
  const starred = starredData || [];
  const members = membersData || [];

  const starredMap = {};
  const byPriority = { 1: [], 2: [], 3: [] };
  starred.forEach((s) => {
    starredMap[s.recipe_id] = s.recipe_data;
    const p = s.rotation_priority || 2;
    byPriority[p].push({ id: s.recipe_id, name: s.recipe_data?.name, source: s.recipe_data?.source, keywords: s.recipe_data?.keywords });
  });

  // Resolve recipe_id → name via every source we have, so we can label
  // the rating history with human-readable dish names in the prompt.
  const nameByRecipeId = {};
  starred.forEach((s) => { if (s.recipe_data?.name) nameByRecipeId[s.recipe_id] = s.recipe_data.name; });
  (recentPlanData || []).forEach((p) => {
    const id = p.recipe_data?.id;
    if (id && p.recipe_data?.name) nameByRecipeId[id] = p.recipe_data.name;
  });

  const loved = [];
  const disliked = [];
  (cookedData || []).forEach((c) => {
    const name = nameByRecipeId[c.recipe_id];
    if (!name || !c.rating) return;
    if (c.rating >= 4) loved.push(name);
    else if (c.rating <= 2) disliked.push(name);
  });

  // Bucket recent meals by age so the prompt can enforce hard vs soft avoidance.
  const _now = Date.now();
  const _WEEK = 7 * 24 * 60 * 60 * 1000;
  const recentBuckets = { week1: [], week2: [], older: [] };
  (recentPlanData || []).forEach((i) => {
    const name = i.recipe_data?.name;
    if (!name) return;
    const age = _now - new Date(i.added_at).getTime();
    if (age < _WEEK)          recentBuckets.week1.push(name);
    else if (age < 2 * _WEEK) recentBuckets.week2.push(name);
    else if (age < 4 * _WEEK) recentBuckets.older.push(name);
  });
  // Flat list kept for backward-compat with other uses
  const recentNames = [...recentBuckets.week1, ...recentBuckets.week2, ...recentBuckets.older];
  const pantryNames = (pantryData || []).map((p) => p.name).filter(Boolean);

  const dietaryGuardrails = buildDietaryGuardrails(preferences, members);
  const locationSection = buildLocationSection(country);
  const prompt = buildPrompt(preferences, members, byPriority, recentNames, numWeeks, plan_extras_text, day_notes, loved, disliked, pantryNames, this_week_wishes, weekly_budget, simple_night, deals, mealPrepMode, measurementSystem, language, recentBuckets, dietaryGuardrails, dietVariety, locationSection);

  let rawText;
  try {
    rawText = await callAi(provider, token, prompt);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'AI service error' });
  }
  if (!rawText) return res.status(502).json({ error: 'Empty AI response' });

  let plan;
  try {
    plan = JSON.parse(rawText);
  } catch (err) {
    console.error('[suggest-week] JSON parse failed:', err.message, '| raw:', rawText.slice(0, 500));
    return res.status(502).json({
      error: `Could not parse AI response: ${err.message}`,
      raw_preview: rawText.slice(0, 200),
    });
  }

  const enrichedWeeks = (plan.weeks || []).map((week, wi) => ({
    week: wi + 1,
    days: (week.days || []).map((day) => {
      // Skipped days (household not eating in) — return a null recipe so the
      // UI renders them as "free evening" rather than a phantom dish.
      if (day.skip || !day.name) {
        return {
          day: normalizeDay(day.day) || day.day,
          recipe: null,
          skip: true,
          reason: day.reason || '',
          leftover_for: null,
          uses_pantry: [],
        };
      }
      let recipe;
      if (day.starred_id && starredMap[day.starred_id]) {
        recipe = { ...starredMap[day.starred_id], _fromStarred: true };
      } else {
        recipe = {
          id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: day.name,
          source: 'AI Suggestion',
          overview: day.overview || '',
          prepTime: day.prep_time || null,
          cookTime: day.cook_time || null,
          servings: 2,
          ingredients: [],
          steps: [],
          keywords: day.cuisine_type ? [day.cuisine_type] : [],
          macros: {},
          _aiSuggestion: true,
          ...(day.english_name && day.english_name !== day.name ? { _englishName: day.english_name } : {}),
        };
      }
      // Parse extra meals (breakfast/lunch/snacks requested for this day)
      const extras = (day.extras || [])
        .filter((e) => e.name && e.meal_type)
        .map((e) => ({
          id: `ai-extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: e.name,
          source: 'AI Suggestion',
          overview: e.overview || '',
          prepTime: e.prep_time || null,
          cookTime: e.cook_time || null,
          servings: 2,
          ingredients: [],
          steps: [],
          macros: {},
          _aiSuggestion: true,
          _mealType: e.meal_type,
          _extraReason: e.reason || '',
        }));

      // Attach side dish to dinner recipe if the AI provided one.
      if (day.side_dish?.name && recipe) {
        recipe._sideDish = {
          name: day.side_dish.name,
          description: day.side_dish.description || '',
          ingredients: Array.isArray(day.side_dish.ingredients) ? day.side_dish.ingredients : [],
          prep_time: day.side_dish.prep_time || null,
          cook_time: day.side_dish.cook_time || null,
        };
      }

      // Surface per-day reasoning + leftover chaining directly on the day so the UI
      // can show "why this?" and the cook-once-eat-twice pairing.
      return {
        // Normalize so LLM quirks like "mon" / "Monday " / "monday" don't
        // break the week-view's strict equality match on _plannedDay.
        day: normalizeDay(day.day) || day.day,
        recipe,
        reason: day.reason || '',
        leftover_for: day.leftover_for || null,
        uses_pantry: Array.isArray(day.uses_pantry) ? day.uses_pantry : [],
        estimated_cost: weekly_budget ? (day.estimated_cost || null) : null,
        extras,
      };
    }),
  }));

  // ── Server-side time-limit enforcement ──────────────────────────────────────
  // Parse weekday time caps from the user's "this week" text (e.g. "Weekdays less than 35 minutes").
  // Any weekday whose prep+cook exceeds the cap gets swapped inline before we return.
  const weekdayCap = parseWeekdayTimeCap(this_week_wishes);
  if (weekdayCap !== null) {
    const WEEKDAY_SET = new Set(['monday','tuesday','wednesday','thursday','friday']);
    const allDayNames = enrichedWeeks.flatMap((w) => w.days.map((d) => d.recipe?.name).filter(Boolean));

    const fixTasks = enrichedWeeks.flatMap((week) =>
      week.days.map(async (day) => {
        if (day.skip || !day.recipe) return;
        if (!WEEKDAY_SET.has((day.day || '').toLowerCase())) return;
        const total = (day.recipe.prepTime || 0) + (day.recipe.cookTime || 0);
        if (total <= weekdayCap) return;

        const fixPrompt = `Suggest ONE dinner recipe for ${day.day} that takes ${weekdayCap} minutes or less total (prep + cook combined).
Context: ${preferences ? `Household preferences: ${preferences}.` : ''} Other meals this week: ${allDayNames.filter((n) => n !== day.recipe.name).slice(0, 6).join(', ') || 'none'}.
Return ONLY valid JSON (no markdown): {"name":"...","overview":"...","prep_time":<number>,"cook_time":<number>}`;
        try {
          const fixText = await callAi(provider, token, fixPrompt);
          const cleaned = (fixText || '').replace(/```json\n?|\n?```/g, '').trim();
          const fix = JSON.parse(cleaned);
          if (fix?.name && (fix.prep_time || 0) + (fix.cook_time || 0) <= weekdayCap) {
            day.recipe = {
              ...day.recipe,
              id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: fix.name,
              overview: fix.overview || '',
              prepTime: fix.prep_time || null,
              cookTime: fix.cook_time || null,
            };
          }
        } catch {}
      })
    );
    await Promise.all(fixTasks);
  }

  // Fire all Pexels lookups in parallel (dinner + extras); fails soft per item.
  // Always use the english_name for photo search so non-English recipes get food
  // photos rather than spurious matches (e.g. "citroen" → Citroën car in Dutch).
  await Promise.all(enrichedWeeks.flatMap((week) =>
    week.days.flatMap((day) => {
      const tasks = [];
      if (day.recipe?.name) {
        const photoQuery = day.english_name || day.recipe._englishName || day.recipe.name;
        tasks.push((async () => { const p = await searchPhoto(photoQuery); if (p) day.photo = p; })());
      }
      (day.extras || []).forEach((extra, i) => {
        const extraQuery = extra._englishName || extra.name;
        tasks.push((async () => { const p = await searchPhoto(extraQuery); if (p) day.extras[i].photo = p; })());
      });
      return tasks;
    })
  ));

  res.json({ weeks: enrichedWeeks, notes: plan.notes || '' });
}

// Basics assumed in every kitchen — exclude from the pantry hint so the AI
// focuses on actual special ingredients the household has stocked.
const _isKitchenBasic = (name) => /\boil\b|\bsalt\b|\bpepper\b|\bwater\b/i.test(name);

// Dried spices and herbs last indefinitely — exclude them from the pantry hint
// so the AI doesn't treat them as perishable leftovers that need using up.
const _isDriedSpiceOrHerb = (name) => /\b(cumin|coriander|paprika|turmeric|ginger powder|cinnamon|nutmeg|cardamom|star anise|allspice|cayenne|chilli|chili|oregano|thyme|rosemary|bay leaves?|tarragon|basil|mixed spice|curry powder|garam masala|ras el hanout|za.atar|sumac|black pepper|sea salt|cloves?|dried herbs?|dried spices?|smoked|flakes?|seeds?)\b/i.test(name);

function parseWeekdayTimeCap(text) {
  if (!text) return null;
  // Matches patterns like "weekdays under 35 min", "weekdays less than 35 minutes",
  // "weekdays max 40 min", "under 35 min on weekdays", "less than 35 min weekdays"
  const patterns = [
    /weekdays?\s+(?:under|less\s+than|max|no\s+more\s+than|<|≤)\s*(\d+)\s*min/i,
    /(?:under|less\s+than|max|no\s+more\s+than|<|≤)\s*(\d+)\s*min(?:utes?)?\s+(?:on\s+)?weekdays?/i,
    /weekdays?\s+(\d+)\s*min(?:utes?)?\s+or\s+less/i,
    /(\d+)\s*min(?:utes?)?\s+or\s+less\s+(?:on\s+)?weekdays?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function buildPrompt(preferences, members, byPriority, recentNames, numWeeks, planExtrasText = '', dayNotes = {}, loved = [], disliked = [], pantry = [], thisWeekWishes = '', weeklyBudget = null, simpleNight = false, deals = [], mealPrepMode = false, measurementSystem = 'metric', language = 'English', recentBuckets = null, dietaryGuardrails = '', dietVariety = 'balanced', locationSection = '') {
  const _noHistory = loved.length === 0 && recentNames.length === 0;

  let starredSection = '';
  for (const [p, recipes] of Object.entries(byPriority)) {
    if (recipes.length === 0) continue;
    starredSection += `\n${PRIORITY_LABELS[p]}:\n`;
    recipes.forEach((r) => {
      starredSection += `  - starred_id: "${r.id}" | ${r.name} (${r.source || 'unknown'}) | tags: ${(r.keywords || []).join(', ')}\n`;
    });
  }

  const weeksText = numWeeks === 2 ? 'two separate weeks (week 1 and week 2)' : 'one week';
  const avoidList = recentNames.length ? recentNames.slice(0, 10).join(', ') : 'none';

  const dayNotesSection = Object.entries(dayNotes || {})
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n');

  const membersSection = (members || [])
    .map((m) => {
      const who = (m.display_name || '').trim() || 'someone';
      const prefs = (m.personal_prefs || '').trim();
      return prefs ? `  - ${who}: ${prefs}` : `  - ${who}: (no personal preferences listed)`;
    })
    .join('\n');

  // Filter out universal kitchen basics and dried spices/herbs — basics are
  // assumed in every kitchen, and spices last indefinitely so they shouldn't
  // influence recipe choice the way perishable pantry items do.
  const pantryFiltered = pantry.filter((p) => !_isKitchenBasic(p) && !_isDriedSpiceOrHerb(p));

  return `${VOICE_GUIDE}

---

You plan meals for a household. Write dish names, overviews and notes in the voice above. Plan ${weeksText} of dinners, plus any extra meals (breakfast, lunch, snacks) the household has asked for.

LANGUAGE: ${language}
Write every dish name, description, overview, reason, and note in ${language}. Use natural native names for dishes where they exist. JSON field names and structure stay in English.

MEASUREMENT SYSTEM: ${measurementSystem === 'imperial' ? 'Imperial (oz, lb, cups, tsp, tbsp, fl oz)' : 'Metric (g, kg, ml, L, tsp, tbsp)'}
Use this system for all ingredient amounts in the plan.
${locationSection}
HOUSEHOLD-LEVEL PREFERENCES (shared by the kitchen):
${preferences || 'No specific preferences — be creative and varied.'}
Any time limits stated above (e.g. "weekdays under 40 min", "max 30 min school nights") are hard caps — every applicable day must have prep_time + cook_time within that limit, same as constraints in THIS WEEK SPECIFICALLY.
${dietaryGuardrails ? `\n${dietaryGuardrails}\n` : ''}
WHO'S EATING:
${membersSection || '  - (no individual preferences on file)'}

STARRED RECIPES:
${starredSection || 'None starred yet — suggest freely based on preferences.'}

RECENTLY EATEN — variety enforcement:
${recentBuckets
  ? [
      recentBuckets.week1.length  ? `Last 7 days   — DO NOT use these dishes or anything very similar: ${recentBuckets.week1.join(', ')}` : '',
      recentBuckets.week2.length  ? `Last 8–14 days — strongly avoid unless the household has very few choices: ${recentBuckets.week2.join(', ')}` : '',
      recentBuckets.older.length  ? `15–28 days ago — avoid repeating in the same week: ${recentBuckets.older.join(', ')}` : '',
      !recentBuckets.week1.length && !recentBuckets.week2.length && !recentBuckets.older.length ? 'No recent history — be creative and varied.' : '',
    ].filter(Boolean).join('\n')
  : (avoidList || 'None — be creative and varied.')
}

${_noHistory && dietVariety !== 'familiar' ? `VARIETY BOOST — no meal history yet:
This household has no cooking history. Be intentionally creative and varied — span at least 3 different cuisine traditions across the week. Do not repeat any hero ingredient (main protein or starchy base) across dinners.` : ''}
RATINGS HISTORY — what this household actually liked when they cooked it:
${loved.length ? `  LOVED (4-5★): ${loved.slice(0, 15).join(', ')}` : '  (no high ratings recorded yet)'}
${disliked.length ? `  DISLIKED (1-2★): ${disliked.slice(0, 15).join(', ')} — avoid these patterns` : ''}

PANTRY (ingredients already on the shelf — use them when they fit naturally into a recipe you'd pick anyway, but never let a pantry item drive the dish choice or repeat a cuisine/protein just to use it up):
${pantryFiltered.length ? `  ${pantryFiltered.slice(0, 30).join(', ')}` : '  (nothing special on the shelf)'}
${deals.length ? `\nDEALS THIS WEEK (items on offer at local supermarkets — prioritise these ingredients where they fit):\n  ${deals.map((d) => `${d.item}${d.store ? ` (${d.store})` : ''}${d.price ? ` ${d.price}` : ''}`).join(', ')}` : ''}
${weeklyBudget ? `\nWEEKLY BUDGET: €${weeklyBudget} — keep the shopping list affordable; favour seasonal produce, cheaper cuts, and pulses where possible. Include an estimated_cost for each day covering all meals that day combined (dinner + any extras, rough ingredient cost, e.g. "€6–9").` : ''}
${simpleNight ? `\nEASY NIGHT: include one night this week where dinner is genuinely minimal effort — a good supermarket pizza, assembled wraps, beans on toast, or similar. Mark the reason as "easy night" for that day.` : ''}
${planExtrasText ? `\nEXTRAS THE HOUSEHOLD WANTS PLANNED (standing instructions, apply every week):\n${planExtrasText}` : ''}
${thisWeekWishes?.trim() ? `\nTHIS WEEK SPECIFICALLY — HARD CONSTRAINTS (treat every instruction here as a strict rule, not a suggestion):
${thisWeekWishes.trim()}

Enforcement rules:
• Time limits (e.g. "weekdays under 35 min", "quick meals", "under 20 min Thursday") are hard caps — if the user says weekdays under 35 minutes, every weekday dinner must have prep_time + cook_time ≤ 35. Do not suggest a dish that exceeds this even if it is otherwise ideal.
• Dietary or ingredient constraints apply to every meal for the specified scope.
• Day-specific instructions override all defaults for that day.
• When in doubt, err on the side of shorter / simpler / stricter — never assume the user is OK with bending these rules.` : ''}
${dayNotesSection ? `\nPER-DAY HARD RULES — treat each as a strict non-negotiable constraint for that day, same weight as a dietary allergy:
${dayNotesSection}
Every rule above must be satisfied in the final plan. If a note says "vegetarian", that day must be vegetarian. If it says "under 30 min", prep_time + cook_time must be ≤ 30. If it says "away" or "not home", set skip=true for that day. Do not soften, approximate, or skip any of these.` : ''}

HOW TO READ USER INPUT
Users write casually. Read every input for intent, not literal words. Here are examples across the full range of things they ask — use these to reason about inputs you haven't seen before:

  Timing:
  • "quick meals this week" → keep all dinners short (think: 30 min or so)
  • "long day Monday, keep it easy" → Monday dinner fast; still a dinner
  • "relaxed Sunday, something special" → Sunday can take as long as needed
  • "under 20 min Thursday" → Thursday total ≤ 20 min

  Extra meals (breakfast, lunch, snacks):
  • "waffles Sunday breakfast" → Sunday: breakfast extra (waffles) + a dinner
  • "Monday lunch for the kids" → Monday: lunch extra + a dinner
  • "breakfast on weekends" → Saturday extra + dinner, Sunday extra + dinner
  • "packed lunch Tuesday" → Tuesday: lunch extra + a dinner
  Asking for a specific meal never removes other meals for that day unless the user also says they won't be home.

  Skipping / not at home:
  • "not home Wednesday" → Wednesday: skip=true, no dinner, extras=[]
  • "eating out Saturday" → Saturday: skip=true, extras=[] — standing breakfast extras don't apply
  • "away Friday evening" → Friday: skip=true
  • "long commute Thursday, easy dinner" → NOT a skip — plan dinner, just make it fast

  Dietary / themed days:
  • "fish day this week" → one day has a fish dinner — any day works, pick what fits
  • "vegetarian Tuesday" → Tuesday dinner is vegetarian
  • "meat-free a couple of days" → spread 2 vegetarian dinners across the week, not clustered

  Side dishes:
  • "something on the side Tuesday" → Tuesday gets a side_dish alongside dinner
  • "salad with the pasta" → the pasta day gets a side_dish

  Anything else:
  • "use up the spinach" → one recipe this week uses spinach
  • "lighter this week" → favour lower-calorie dishes across the week
  • Ingredient names, cuisine requests, mood words — apply them where they fit most naturally

EXTRAS IN THE ARRAY — A COMMON FAILURE
When an extra meal is requested, it MUST appear in that day's "extras" array with a real name, meal_type, overview, prep_time and cook_time. Writing it only in "notes" makes it invisible. Check every day before finalising.

${mealPrepMode ? `MEAL PREP MODE IS ON
This household batch-cooks. Replace the standard "varied dish each day" model with a meal-prep plan:

BATCH COOKING RULES (override standard planning principles):
  Choose 2–3 anchor dishes for the week. Each is cooked once in a large batch (4–6 servings) and eaten across multiple days. Set servings to 4–6 on these dishes and set leftover_for to the days that eat from the batch.
  Pick prep days — typically the weekend (Saturday or Sunday) — for the main cooking. Weekday entries that eat from a batch should still have a name and overview describing the meal, but mark them as leftovers in leftover_for pointing back to the prep day.
  Anchor dishes should reheat well: stews, curries, grain bowls, roasted trays, soups, pasta sauces, bean dishes, casseroles. Avoid dishes that don't keep (delicate fish, fried things, fresh salads as mains).
  You may include 1 genuinely fresh weeknight dish (e.g. a quick stir-fry or eggs) to break up the week — but it's optional.
  Vary proteins and cuisines across the 2–3 anchor dishes. Don't batch-cook chicken AND another chicken dish.
  Dietary constraints still apply absolutely. Starred recipes still apply if they reheat well.
  Extras (breakfast, lunch, snacks) still follow the "only when there is a clear basis" rule.

COOKING TIME in meal prep mode:
  Prep days (weekend): an hour or more is expected and fine.
  Weekdays eating from batch: prep_time and cook_time reflect reheating only (5–10 min).` : `PLANNING PRINCIPLES

Cooking time — read the day and context:
  Weeknights are busier for most households — something in the 30–40 min range tends to work. Weekends allow more space — an hour or more is fine. These are patterns, not rules. A user who says "I love slow cooking on Thursdays" overrides any default. Always let explicit instructions win; fall back on the day-of-week pattern only when nothing is said.

Dietary constraints:
  Absolute avoids (allergies, ethics, explicit dislikes) — exclude from every dish.
  Adaptive diets (gluten-free, dairy-free, vegan, etc.) — keep the dish concept, adapt the ingredients, name the adaptation in the title.

VARIETY LEVEL — household preference: ${
  dietVariety === 'familiar'
    ? 'FAMILIAR. Lean toward dishes this household already knows and enjoys. Prioritise comfort food, well-known cuisines, and proven crowd-pleasers. Limit exotic or unfamiliar combinations.'
    : dietVariety === 'adventurous'
    ? 'ADVENTUROUS. Actively push into unfamiliar cuisines, bold flavour combinations, and dishes the household may not have tried before. Avoid defaulting to safe, well-known dishes unless directly requested.'
    : 'BALANCED. A healthy mix of familiar favourites and new ideas — the default.'
}

Variety — applies across ALL meals chosen in the plan:
  Treat every dinner, breakfast, lunch, and snack as one unified weekly menu.
  For every dish, identify its hero ingredient — the star the home cook would name first (the main protein, or the main starchy base if there is no dominant protein). Each hero ingredient may appear in at most one dinner per week. This is a hard constraint: if Monday's dinner is built around chicken, no other dinner this week may feature chicken as its hero. Apply the same rule to every other hero ingredient across the plan.
  Extras (breakfasts, lunches, snacks) follow the same logic: a hero ingredient used at breakfast may not reappear at lunch the same day or at breakfast the following day. A dinner and a same-day extra must be meaningfully different from each other.
  Vary cuisines across the week. Spread themed days (fish, vegetarian, etc.) naturally.
  SELF-CHECK: Before finalising, name the hero ingredient of each planned dinner. If any hero ingredient appears more than once, replace the duplicate with a dish whose hero ingredient hasn't been used yet.
  Cross-week variety: the RECENTLY EATEN section above shows what was served recently. A plan that closely mirrors last week (same dishes, same cuisine run, same hero-ingredient sequence) is a failure even if no single dish is a direct repeat. Each week should feel meaningfully different from the previous one.

Starred recipes:
  HIGH-priority starred recipes should appear in week 1. Respect rotation priorities.

Waste-first thinking:
  One "cook once, eat twice" per week where natural. leftover_for can point at a meal 1 or 2 days later — don't force next-day if that creates awkward clusters. leftovers from different cook days can also be combined into one meal. leftover_for must point at a meal that was already going to be planned — never invent an extras entry just to receive leftovers.
  Side dishes and extras should reuse ingredients already in the week's plan where possible.

Extras — default is ALWAYS empty. This is a strict rule:
  Every day's "extras" array must be [] unless ALL of the following are true:
  1. There is a verbatim request for that specific meal type (breakfast / lunch / snack) for that specific day or day group in the user's input OR in the standing extras text.
  2. You can quote the exact words that justify it.
  If you cannot quote a direct user request, the array is []. Do not infer, anticipate, or suggest extras on your own initiative — not for weekends, not for "balance", not for any reason. The user will ask when they want them.

Learning from history — go slowly:
  The LOVED list and recent meal history show what the household has enjoyed, but 2–3 similar dishes is not a strong enough pattern to lock in a genre or style. Keep suggesting variety. Only lean heavily on a pattern when it is overwhelming (5+ clear data points pointing the same direction). Even then, don't abandon variety entirely — one week's plan should never feel monotone.

Real dishes only:
  Every suggestion must be a recognisable, real-world dish.`}

SELF-CHECK BEFORE OUTPUT
For every day confirm: (a) extras are in the "extras" array only when directly requested — if you added any extras without a verbatim user request, remove them now; (b) skipped days have skip=true, name=null, extras=[]; (c) exactly 7 day entries per week; (d) leftover_for never points at a spontaneously invented meal; (e) if a time limit was stated in HOUSEHOLD-LEVEL PREFERENCES or THIS WEEK SPECIFICALLY, verify prep_time + cook_time for every affected day is within that limit — if any day exceeds it, replace the recipe before returning; (f) for every day that had a PER-DAY HARD RULE, verify the rule is satisfied — dietary rules fully respected, time rules within the stated limit, away/skip rules set correctly.

Return ONLY a JSON object, no markdown:
{
  "weeks": [
    {
      "days": [
        {
          "day": "Monday",
          "skip": false,
          "starred_id": "<exact recipe id from starred list, or null if new suggestion>",
          "name": "<dinner recipe name in ${language}>",
          "english_name": "<dinner recipe name in English — always required, used for photo search>",
          "overview": "<one sentence description, or null if skip=true>",
          "cuisine_type": "<Italian / Asian / etc., or null if skip=true>",
          "prep_time": <minutes or null>,
          "cook_time": <minutes or null>,
          "reason": "<one short sentence: why this dish, this day>",
          "leftover_for": "<e.g. 'Tuesday lunch', or null>",
          "uses_pantry": ["<pantry item this recipe uses>"],${weeklyBudget ? '\n          "estimated_cost": "<rough ingredient cost for this dinner, e.g. \'€6–9\'>,"' : ''}
          "side_dish": {
            "name": "<side dish name or null>",
            "description": "<one sentence or null>",
            "prep_time": <minutes or null>,
            "cook_time": <minutes or null>,
            "ingredients": [{"name": "<ingredient>", "amount": "<amount>"}]
          },
          "extras": [
            {
              "meal_type": "<breakfast|lunch|snack>",
              "name": "<recipe name>",
              "overview": "<one sentence>",
              "prep_time": <minutes or null>,
              "cook_time": <minutes or null>,
              "reason": "<why this extra meal>"
            }
          ]
        }
      ]
    }
  ],
  "notes": "<2-3 sentences explaining the overall plan shape>"
}

"extras" is [] on days with no requested extras. "side_dish" is null unless a side was requested for that day.
Each week must have exactly 7 day entries (Monday through Sunday). Skipped days appear with skip=true and name=null.${numWeeks === 2 ? ' Return exactly 2 week objects.' : ' Return exactly 1 week object.'}`;
}
