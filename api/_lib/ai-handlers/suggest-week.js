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

  const { weeks = 1, plan_extras_text = '', day_notes = {}, this_week_wishes = '' } = req.body || {};
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

  const prompt = buildPrompt(preferences, members, byPriority, recentNames, numWeeks, plan_extras_text, day_notes, loved, disliked, pantryNames, this_week_wishes);

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
      let recipe;
      if (day.starred_id && starredMap[day.starred_id]) {
        recipe = { ...starredMap[day.starred_id], _fromStarred: true };
      } else {
        recipe = {
          id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: day.name || 'Suggested recipe',
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
      };
    }),
  }));

  // Fire all Pexels lookups in parallel; fails soft per day if PEXELS_API_KEY
  // isn't set or the service is flaky — the card simply renders without a
  // photo rather than blocking the whole plan.
  await Promise.all(enrichedWeeks.flatMap((week) =>
    week.days.map(async (day) => {
      if (!day.recipe?.name) return;
      const photo = await searchPhoto(day.recipe.name);
      if (photo) day.photo = photo;
    })
  ));

  res.json({ weeks: enrichedWeeks, notes: plan.notes || '' });
}

function buildPrompt(preferences, members, byPriority, recentNames, numWeeks, planExtrasText = '', dayNotes = {}, loved = [], disliked = [], pantry = [], thisWeekWishes = '') {
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

You plan weeknight dinners for a household. Write dish names, overviews and notes in the voice above. Plan ${weeksText} of dinner meals for this household.

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
${planExtrasText ? `\nEXTRAS THE HOUSEHOLD WANTS PLANNED (standing instructions):\n${planExtrasText}` : ''}
${thisWeekWishes?.trim() ? `\nTHIS WEEK SPECIFICALLY (one-off wishes — weight these heavily):\n${thisWeekWishes.trim()}` : ''}
${dayNotesSection ? `\nPER-DAY NOTES:\n${dayNotesSection}` : ''}
STRICT RULES:
1. Never plan the same main ingredient two days in a row.
2. Vary cuisine type every day.
3. Mix weekday-friendly quick meals (Mon–Thu) with more elaborate weekend meals (Fri–Sun).
4. Prioritise starred HIGH recipes — they should appear in week 1 if possible.
5. Respect dietary preferences strictly.
6. Every recipe must be a real, well-known dish.
7. Never repeat the same lunch or side dish across the week.
8. Optimise for ingredient reuse AND reach for pantry items where it works naturally.
9. Plan exactly ONE "cook once, eat twice" recipe per week — pick something
   that reheats well, cook 2x portions, and have that day's "leftover_for"
   point at the next day it covers (e.g. Monday's leftover_for = "Tuesday lunch").
10. Let the RATINGS HISTORY genuinely shape suggestions — echo patterns from
    LOVED, steer away from DISLIKED. Be subtle; don't just reuse the same dishes.

Return ONLY a JSON object, no markdown:
{
  "weeks": [
    {
      "days": [
        {
          "day": "Monday",
          "starred_id": "<exact recipe id from starred list, or null if new suggestion>",
          "name": "<recipe name>",
          "overview": "<one sentence description>",
          "cuisine_type": "<Italian / Asian / etc.>",
          "prep_time": <minutes or null>,
          "cook_time": <minutes or null>,
          "reason": "<one short sentence: why this dish, this day — reference ratings / pantry / starred when relevant>",
          "leftover_for": "<e.g. 'Tuesday lunch', or null if this isn't the cook-once-eat-twice day>",
          "uses_pantry": ["<pantry item this recipe uses>"]
        }
      ]
    }
  ],
  "notes": "<2-3 sentences explaining the overall plan shape>"
}

Each week must have exactly 7 days: Monday through Sunday.${numWeeks === 2 ? ' Return exactly 2 week objects.' : ' Return exactly 1 week object.'}`;
}
