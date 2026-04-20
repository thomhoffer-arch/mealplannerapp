import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../_lib/auth.js';
import { VOICE_GUIDE } from '../_lib/voice.js';
import { resolveAiProvider, callAi } from '../_lib/ai-call.js';
import { checkAndIncrementUsage, isGiftedHousehold, WEEKLY_FREE_LIMIT } from '../_lib/usage.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipe, request } = req.body || {};
  if (!recipe?.name) return res.status(400).json({ error: 'recipe.name is required' });

  const isAdjust = typeof request === 'string' && request.trim().length > 0;

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { provider, token, usingSharedKey } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  if (usingSharedKey && !(await isGiftedHousehold(supabase, ctx.householdId))) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Weekly limit of ${WEEKLY_FREE_LIMIT} AI calls reached. Add your Gemini key or upgrade in Settings for unlimited use.`,
      });
    }
  }

  const prompt = isAdjust ? buildAdjustPrompt(recipe, request.trim()) : buildGeneratePrompt(recipe);

  let rawText;
  try {
    rawText = await callAi(provider, token, prompt);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'AI service error' });
  }
  if (!rawText) return res.status(502).json({ error: 'Empty AI response' });

  let result;
  try { result = JSON.parse(rawText); } catch {
    return res.status(502).json({ error: 'Could not parse AI response' });
  }

  res.json(result);
}

function buildGeneratePrompt(recipe) {
  const { name, overview, cuisineType, prepTime, cookTime } = recipe;
  const totalTime = (prepTime || 0) + (cookTime || 0);
  const timeHint = totalTime > 0 ? ` Total time around ${totalTime} minutes.` : '';
  const cuisineHint = cuisineType ? ` Cuisine: ${cuisineType}.` : '';
  const overviewHint = overview ? `\nContext: ${overview}` : '';

  return `${VOICE_GUIDE}

---

Write a complete dinner recipe for "${name}".${overviewHint}
${cuisineHint}${timeHint}
Portions for 2 people.

Return ONLY a JSON object, no markdown:
{
  "ingredients": [{ "name": "chicken thighs, bone-in skin-on", "amount": "2" }],
  "steps": ["Pat the chicken dry and season generously on both sides..."],
  "servings": 2,
  "prepTime": <minutes as integer>,
  "cookTime": <minutes as integer>,
  "macros": { "calories": 520, "protein": 38, "carbs": 22, "fat": 28 }
}`;
}

function buildAdjustPrompt(recipe, request) {
  const ingredientsList = (recipe.ingredients || [])
    .map((i) => `  - ${i.amount ? `${i.amount} ` : ''}${i.name}`)
    .join('\n');

  const stepsList = (recipe.steps || [])
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join('\n');

  return `${VOICE_GUIDE}

---

Adjust this recipe based on the user request. Change only what the request asks for.

RECIPE: ${recipe.name}
INGREDIENTS:
${ingredientsList || '  (none listed)'}
STEPS:
${stepsList || '  (none listed)'}

USER REQUEST: "${request}"

Return ONLY a JSON object, no markdown:
{
  "ingredients": [{ "name": "...", "amount": "..." }],
  "steps": ["..."],
  "servings": ${recipe.servings || 2},
  "prepTime": <minutes as integer>,
  "cookTime": <minutes as integer>,
  "macros": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }
}`;
}
