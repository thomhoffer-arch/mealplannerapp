'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');
const { VOICE_GUIDE } = require('../_lib/voice');
const { resolveAiProvider, callAi } = require('../_lib/ai-call');
const { checkAndIncrementUsage, WEEKLY_FREE_LIMIT } = require('../_lib/usage');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PRIORITY_LABELS = { 1: 'HIGH — include every week', 2: 'MEDIUM — include every 2 weeks', 3: 'OCCASIONAL — include if it fits' };

// POST /api/ai/suggest-week
// Body: { weeks: 1 | 2 }
// Returns: { weeks: [{ week, days: [{ day, recipe }] }], notes }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { weeks = 1 } = req.body || {};
  const numWeeks = Math.min(Math.max(Number(weeks) || 1, 1), 2);

  const ctx = await getUserAndHousehold(req).catch(() => null);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { provider, token, usingSharedKey } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  if (usingSharedKey) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Weekly limit of ${WEEKLY_FREE_LIMIT} AI calls reached. Connect Puter or add your own Gemini key in Settings for unlimited use.`,
      });
    }
  }

  // Load all data in parallel
  const [{ data: prefData }, { data: starredData }, { data: cookedData }, { data: recentPlanData }, { data: membersData }] = await Promise.all([
    supabase.from('household_preferences').select('preferences_text').eq('household_id', ctx.householdId).maybeSingle(),
    supabase.from('starred_recipes').select('recipe_id, recipe_data, rotation_priority').eq('household_id', ctx.householdId),
    supabase.from('cooked_recipes').select('recipe_id').eq('household_id', ctx.householdId),
    supabase.from('meal_plan_items').select('recipe_data, added_at').eq('household_id', ctx.householdId)
      .order('added_at', { ascending: false }).limit(21),
    supabase.from('household_members').select('display_name, personal_prefs').eq('household_id', ctx.householdId),
  ]);

  const preferences = prefData?.preferences_text || '';
  const starred = starredData || [];
  const members = membersData || [];

  // Build a map for quick lookup and group by priority
  const starredMap = {};
  const byPriority = { 1: [], 2: [], 3: [] };
  starred.forEach((s) => {
    starredMap[s.recipe_id] = s.recipe_data;
    const p = s.rotation_priority || 2;
    byPriority[p].push({ id: s.recipe_id, name: s.recipe_data?.name, source: s.recipe_data?.source, keywords: s.recipe_data?.keywords });
  });

  // Recently planned (last 3 weeks worth) for variety context
  const recentNames = (recentPlanData || []).map((i) => i.recipe_data?.name).filter(Boolean);

  const prompt = buildPrompt(preferences, members, byPriority, recentNames, numWeeks);

  let rawText;
  try {
    rawText = await callAi(provider, token, prompt);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'AI service error' });
  }
  if (!rawText) return res.status(502).json({ error: 'Empty AI response' });

  let plan;
  try { plan = JSON.parse(rawText); } catch {
    return res.status(502).json({ error: 'Could not parse AI response' });
  }

  // Enrich: swap starred_id references with full recipe objects
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
      return { day: day.day, recipe };
    }),
  }));

  res.json({ weeks: enrichedWeeks, notes: plan.notes || '' });
};

function buildPrompt(preferences, members, byPriority, recentNames, numWeeks) {
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

WHO'S EATING (individual preferences — the plan must work for everyone at the table; where people differ, suggest simple adaptations like "olives on the side", "bake the chicken on a separate tray", "swap tofu for prawns for [name]"):
${membersSection || '  - (no individual preferences on file)'}

STARRED RECIPES (this household's favourites — use them in the plan):
${starredSection || 'None starred yet — suggest freely based on preferences.'}

RECENTLY EATEN (avoid repeating for 2 weeks):
${avoidList}

STRICT RULES:
1. Never plan the same main ingredient (e.g. pasta, chicken, salmon) two days in a row.
2. Vary cuisine type every day (no Italian two consecutive days, etc.).
3. Mix weekday-friendly quick meals (Mon–Thu) with more elaborate weekend meals (Fri–Sun).
4. Prioritise starred HIGH recipes — they should appear in week 1 if possible.
5. Respect dietary preferences strictly. If members conflict (one vegetarian, one meat-eater), pick recipes that split gracefully and put the adaptation in the overview.
6. If no starred recipes exist, invent appropriate recipes based on preferences.

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
          "cook_time": <minutes or null>
        }
      ]
    }
  ],
  "notes": "<2-3 sentences explaining the plan, variety choices, and how preferences were handled>"
}

Each week must have exactly 7 days: Monday through Sunday.${numWeeks === 2 ? ' Return exactly 2 week objects.' : ' Return exactly 1 week object.'}`;
}

