import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../auth.js';
import { VOICE_GUIDE } from '../voice.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { checkAndIncrementUsage, isGiftedHousehold } from '../usage.js';

// Generates full recipe details for multiple AI stubs in one request.
// The central rate limiter counts this as a single call regardless of batch size,
// so loading a week plan doesn't consume N rate-limit slots for N AI recipes.
export default async function handleGenerateRecipesBatch(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipes } = req.body || {};
  if (!Array.isArray(recipes) || recipes.length === 0) {
    return res.status(400).json({ error: 'recipes array is required' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const [{ provider, token, usingSharedKey }, { data: prefData }] = await Promise.all([
    resolveAiProvider(supabase, ctx.householdId),
    supabase.from('household_preferences').select('preferences_text').eq('household_id', ctx.householdId).maybeSingle(),
  ]);
  const householdPrefs = prefData?.preferences_text || '';

  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  // One usage check for the entire batch — fair for users on shared free-tier key.
  if (usingSharedKey && !(await isGiftedHousehold(supabase, ctx.householdId))) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Your kitchen's weekly AI limit has been reached. Upgrade for more, or wait until next week.`,
        code: 'weekly_limit_reached',
      });
    }
  }

  const results = await Promise.all(
    recipes.map(async (recipe) => {
      if (!recipe?.name) return { id: recipe?.id, success: false, error: 'missing name' };
      try {
        const rawText = await callAi(provider, token, buildGeneratePrompt(recipe, householdPrefs));
        const result = JSON.parse(rawText);
        return { id: recipe.id, success: true, ...result };
      } catch (err) {
        return { id: recipe.id, success: false, error: err.message };
      }
    })
  );

  res.json({ results });
}

function buildGeneratePrompt(recipe, householdPrefs = '') {
  const { name, overview, cuisineType, prepTime, cookTime, _sideDish } = recipe;
  const totalTime = (prepTime || 0) + (cookTime || 0);
  const timeHint = totalTime > 0 ? ` Total time around ${totalTime} minutes.` : '';
  const cuisineHint = cuisineType ? ` Cuisine: ${cuisineType}.` : '';
  const overviewHint = overview ? `\nContext: ${overview}` : '';

  const hasSide = !!_sideDish?.name;
  const sideIngList = hasSide && (_sideDish.ingredients || []).length > 0
    ? ` Ingredients: ${_sideDish.ingredients.map((i) => `${i.amount || ''} ${i.name}`.trim()).join(', ')}.`
    : '';
  const sideSection = hasSide
    ? `\nThis dinner is served with a side dish: "${_sideDish.name}".${_sideDish.description ? ` ${_sideDish.description}` : ''}${sideIngList} Write 3–5 steps for the side dish in "side_dish_steps".`
    : '';
  const sideSchema = hasSide ? `,\n  "side_dish_steps": ["Heat oil in a small pan over medium heat...", "..."]` : '';

  const prefsSection = householdPrefs
    ? `\nHOUSEHOLD PREFERENCES (dietary restrictions to respect):\n${householdPrefs}\n`
    : '';

  return `${VOICE_GUIDE}

---

Write a complete dinner recipe for "${name}".${overviewHint}
${cuisineHint}${timeHint}
Portions for 2 people.
${prefsSection}${sideSection}
If the dish name already implies a dietary adaptation (e.g. "with
gluten-free pasta", "vegetarian lasagne"), reflect that in the
ingredient list — label GF pasta as "gluten-free pasta", label
non-dairy alternatives explicitly. Don't silently swap to the
regular version.

Return ONLY a JSON object, no markdown:
{
  "ingredients": [{ "name": "chicken thighs, bone-in skin-on", "amount": "2" }],
  "steps": ["Pat the chicken dry and season generously on both sides..."],
  "servings": 2,
  "prepTime": <minutes as integer>,
  "cookTime": <minutes as integer>,
  "macros": { "calories": 520, "protein": 38, "carbs": 22, "fat": 28 }${sideSchema}
}`;
}
