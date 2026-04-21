import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../auth.js';
import { VOICE_GUIDE } from '../voice.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { checkAndIncrementUsage, isGiftedHousehold, WEEKLY_FREE_LIMIT } from '../usage.js';
import { searchPhoto } from '../pexels.js';

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

  const { weeks = 1, plan_extras_text = '', day_notes = {}, this_week_wishes = '', weekly_budget = null, simple_night = false, deals = [] } = req.body || {};
  const numWeeks = Math.min(Math.max(Number(weeks) || 1, 1), 2);

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { provider, token, usingSharedKey } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  if (usingSharedKey && !(await isGiftedHousehold(supabase, ctx.householdId))) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Weekly limit of ${WEEKLY_FREE_LIMIT} AI calls reached. Connect Puter or add your own Gemini key in Settings for unlimited use.`,
      });
    }
  }

  const [{ data: prefData }, { data: starredData }, { data: cookedData }, { data: recentPlanData }, { data: membersData }, { data: pantryData }] = await Promise.all([
    supabase.from('household_preferences').select('preferences_text').eq('household_id', ctx.householdId).maybeSingle(),
    supabase.from('starred_recipes').select('recipe_id, recipe_data, rotation_priority').eq('household_id', ctx.householdId),
    supabase.from('cooked_recipes').select('recipe_id, rating').eq('household_id', ctx.householdId),
    supabase.from('meal_plan_items').select('recipe_data, added_at').eq('household_id', ctx.householdId)
      .order('added_at', { ascending: false }).limit(30),
    supabase.from('household_members').select('display_name, personal_prefs').eq('household_id', ctx.householdId),
    supabase.from('pantry_items').select('name').eq('household_id', ctx.householdId),
  ]);

  const preferences = prefData?.preferences_text || '';
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

  const recentNames = (recentPlanData || []).slice(0, 10).map((i) => i.recipe_data?.name).filter(Boolean);
  const pantryNames = (pantryData || []).map((p) => p.name).filter(Boolean);

  const prompt = buildPrompt(preferences, members, byPriority, recentNames, numWeeks, plan_extras_text, day_notes, loved, disliked, pantryNames, this_week_wishes, weekly_budget, simple_night, deals);

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
        extras,
      };
    }),
  }));

  // Fire all Pexels lookups in parallel (dinner + extras); fails soft per item.
  await Promise.all(enrichedWeeks.flatMap((week) =>
    week.days.flatMap((day) => {
      const tasks = [];
      if (day.recipe?.name) {
        tasks.push((async () => { const p = await searchPhoto(day.recipe.name); if (p) day.photo = p; })());
      }
      (day.extras || []).forEach((extra, i) => {
        tasks.push((async () => { const p = await searchPhoto(extra.name); if (p) day.extras[i].photo = p; })());
      });
      return tasks;
    })
  ));

  res.json({ weeks: enrichedWeeks, notes: plan.notes || '' });
}

function buildPrompt(preferences, members, byPriority, recentNames, numWeeks, planExtrasText = '', dayNotes = {}, loved = [], disliked = [], pantry = [], thisWeekWishes = '', weeklyBudget = null, simpleNight = false, deals = []) {
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

  return `${VOICE_GUIDE}

---

You plan meals for a household. Write dish names, overviews and notes in the voice above. Plan ${weeksText} of dinners, plus any extra meals (breakfast, lunch, snacks) the household has asked for.

HOUSEHOLD-LEVEL PREFERENCES (shared by the kitchen):
${preferences || 'No specific preferences — be creative and varied.'}

WHO'S EATING:
${membersSection || '  - (no individual preferences on file)'}

STARRED RECIPES:
${starredSection || 'None starred yet — suggest freely based on preferences.'}

RECENTLY EATEN (avoid repeating for 2 weeks):
${avoidList}

RATINGS HISTORY — what this household actually liked when they cooked it:
${loved.length ? `  LOVED (4-5★): ${loved.slice(0, 15).join(', ')}` : '  (no high ratings recorded yet)'}
${disliked.length ? `  DISLIKED (1-2★): ${disliked.slice(0, 15).join(', ')} — avoid these patterns` : ''}

PANTRY (already on the shelf — prefer recipes that use these to minimise shopping):
${pantry.length ? `  ${pantry.slice(0, 30).join(', ')}` : '  (empty)'}
${deals.length ? `\nDEALS THIS WEEK (items on offer at local supermarkets — prioritise these ingredients where they fit):\n  ${deals.map((d) => `${d.item}${d.store ? ` (${d.store})` : ''}${d.price ? ` ${d.price}` : ''}`).join(', ')}` : ''}
${weeklyBudget ? `\nWEEKLY BUDGET: €${weeklyBudget} — keep the shopping list affordable; favour seasonal produce, cheaper cuts, and pulses where possible.` : ''}
${simpleNight ? `\nEASY NIGHT: include one night this week where dinner is genuinely minimal effort — a good supermarket pizza, assembled wraps, beans on toast, or similar. Mark the reason as "easy night" for that day.` : ''}
${planExtrasText ? `\nEXTRAS THE HOUSEHOLD WANTS PLANNED (standing instructions, apply every week):\n${planExtrasText}` : ''}
${thisWeekWishes?.trim() ? `\nTHIS WEEK SPECIFICALLY (one-off wishes — weight these above everything else):\n${thisWeekWishes.trim()}` : ''}
${dayNotesSection ? `\nPER-DAY NOTES:\n${dayNotesSection}` : ''}

HOW TO READ USER INPUT
Users write casually. Read every input for intent, not literal words. Here are examples across the full range of things they ask — use these to reason about inputs you haven't seen before:

  Timing:
  • "quick meals this week" → keep all dinners under ~30 min total
  • "long day Monday, keep it easy" → Monday dinner fast; still a dinner
  • "relaxed Sunday, something special" → Sunday can take up to 90 min
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

PLANNING PRINCIPLES

Cooking time defaults (use when the user hasn't said anything about time):
  Weekdays (Mon–Fri): aim for ~25–40 min total. Weekends: up to ~90 min is fine.
  These are soft defaults. Any timing the user specifies overrides them.

Dietary constraints:
  Absolute avoids (allergies, ethics, explicit dislikes) — exclude from every dish.
  Adaptive diets (gluten-free, dairy-free, vegan, etc.) — keep the dish concept, adapt the ingredients, name the adaptation in the title.

Variety:
  Different main protein and different cuisine each day. No repeated hero ingredient on consecutive days.
  Dinner and any extras on the same day must be meaningfully different dishes.
  Spread themed days (fish, vegetarian, etc.) naturally across the week.

Starred recipes:
  HIGH-priority starred recipes should appear in week 1. Respect rotation priorities.

Waste-first thinking:
  One "cook once, eat twice" per week where natural. leftover_for must point at a meal that was already going to be planned — never invent an extras entry just to receive leftovers.
  Side dishes and extras should reuse ingredients already in the week's plan where possible.

Extras only when asked:
  Every day's "extras" array is [] unless the user explicitly requested a non-dinner meal for that day. Never add breakfast, lunch or snacks on your own initiative.

Real dishes only:
  Every suggestion must be a recognisable, real-world dish.

SELF-CHECK BEFORE OUTPUT
For every day confirm: (a) requested extras are in the "extras" array, not just in "notes"; (b) skipped days have skip=true, name=null, extras=[]; (c) exactly 7 day entries per week; (d) extras=[] on days where no extra was explicitly requested; (e) leftover_for never points at a spontaneously invented meal.

Return ONLY a JSON object, no markdown:
{
  "weeks": [
    {
      "days": [
        {
          "day": "Monday",
          "skip": false,
          "starred_id": "<exact recipe id from starred list, or null if new suggestion>",
          "name": "<dinner recipe name, or null if skip=true>",
          "overview": "<one sentence description, or null if skip=true>",
          "cuisine_type": "<Italian / Asian / etc., or null if skip=true>",
          "prep_time": <minutes or null>,
          "cook_time": <minutes or null>,
          "reason": "<one short sentence: why this dish, this day>",
          "leftover_for": "<e.g. 'Tuesday lunch', or null>",
          "uses_pantry": ["<pantry item this recipe uses>"],
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
