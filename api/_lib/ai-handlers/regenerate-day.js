import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../auth.js';
import { VOICE_GUIDE } from '../voice.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { searchPhoto } from '../pexels.js';

// Regenerate a single day of a week plan based on user feedback.
// Takes the current day's recipe + the user's change request ("swap for
// something lighter", "no fish", "more veggies") and returns a single
// replacement day in the same shape as suggest-week's per-day output.
//
// Cheaper and faster than regenerating the whole week because the other
// days stay put. Pulls the same household context (prefs, starred, pantry,
// ratings, recent plan) so the replacement still respects the rules.
export default async function handleRegenerateDay(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    day_name,               // "Monday"
    current_recipe_name,    // "Pasta carbonara"
    change_request,         // "too heavy, give me something lighter"
    other_days_names = [],  // Names of other days in the plan, to avoid collisions
  } = req.body || {};

  if (!day_name) return res.status(400).json({ error: 'day_name is required' });
  if (!change_request?.trim()) return res.status(400).json({ error: 'change_request is required' });

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { provider, token } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

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

  const starredMap = {};
  const starredList = [];
  starred.forEach((s) => {
    starredMap[s.recipe_id] = s.recipe_data;
    starredList.push({ id: s.recipe_id, name: s.recipe_data?.name });
  });

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

  const pantryNames = (pantryData || []).map((p) => p.name).filter(Boolean);
  const membersSection = (membersData || [])
    .map((m) => {
      const who = (m.display_name || '').trim() || 'someone';
      const prefs = (m.personal_prefs || '').trim();
      return prefs ? `  - ${who}: ${prefs}` : `  - ${who}: (no personal preferences listed)`;
    })
    .join('\n');

  const prompt = `${VOICE_GUIDE}

---

The household had "${current_recipe_name}" planned for ${day_name}. They want to swap it.

Their request: "${change_request.trim()}"

Replace the dish with something that:
- satisfies the request above
- still respects the rules below
- doesn't duplicate what's already on other days this week: ${other_days_names.join(', ') || '(no other days specified)'}

IMPORTANT — if the request is a dietary adaptation ("make it gluten-free", "dairy-free version",
"make it vegan"), DO NOT replace the dish with a different one. Keep the same dish concept and
only swap the offending ingredients (e.g. gluten-free pasta, oat milk, plant-based mince).
Name the result to make the adaptation clear ("Carbonara with gluten-free pasta").

COOKING TIME: ${['Monday','Tuesday','Wednesday','Thursday'].includes(day_name) ? 'This is a weekday — total time (prep + cook) must stay at or under 40 minutes.' : day_name === 'Friday' ? 'Friday — aim for under 50 minutes.' : 'Weekend — up to 90 minutes is fine.'}

HOUSEHOLD-LEVEL PREFERENCES:
${preferences || 'No specific preferences — be creative and varied.'}

WHO'S EATING:
${membersSection || '  - (no individual preferences on file)'}

STARRED RECIPES (reuse starred_id if one fits the request):
${starredList.map((r) => `  - starred_id: "${r.id}" | ${r.name}`).join('\n') || '  (none)'}

RATINGS HISTORY:
${loved.length ? `  LOVED: ${loved.slice(0, 10).join(', ')}` : '  (no high ratings yet)'}
${disliked.length ? `  DISLIKED: ${disliked.slice(0, 10).join(', ')}` : ''}

PANTRY:
${pantryNames.length ? `  ${pantryNames.slice(0, 20).join(', ')}` : '  (empty)'}

Return ONLY JSON, no markdown:
{
  "day": "${day_name}",
  "starred_id": "<id from list above if one fits, else null>",
  "name": "<recipe name>",
  "overview": "<one short sentence>",
  "cuisine_type": "<Italian / Asian / etc.>",
  "prep_time": <minutes or null>,
  "cook_time": <minutes or null>,
  "reason": "<one short sentence — why this dish satisfies the request>",
  "leftover_for": null,
  "uses_pantry": ["<pantry item this uses>"]
}`;

  let rawText;
  try {
    rawText = await callAi(provider, token, prompt);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'AI service error' });
  }
  if (!rawText) return res.status(502).json({ error: 'Empty AI response' });

  let parsed;
  try { parsed = JSON.parse(rawText); } catch {
    return res.status(502).json({ error: 'Could not parse AI response' });
  }

  let recipe;
  if (parsed.starred_id && starredMap[parsed.starred_id]) {
    recipe = { ...starredMap[parsed.starred_id], _fromStarred: true };
  } else {
    recipe = {
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: parsed.name || 'Suggested recipe',
      source: 'AI Suggestion',
      overview: parsed.overview || '',
      prepTime: parsed.prep_time || null,
      cookTime: parsed.cook_time || null,
      servings: 2,
      ingredients: [],
      steps: [],
      keywords: parsed.cuisine_type ? [parsed.cuisine_type] : [],
      macros: {},
      _aiSuggestion: true,
    };
  }

  const photo = recipe?.name ? await searchPhoto(recipe.name) : null;

  return res.json({
    day: parsed.day || day_name,
    recipe,
    reason: parsed.reason || '',
    leftover_for: parsed.leftover_for || null,
    uses_pantry: Array.isArray(parsed.uses_pantry) ? parsed.uses_pantry : [],
    photo,
  });
}
