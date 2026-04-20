'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');
const { VOICE_GUIDE } = require('../_lib/voice');
const { resolveAiProvider, callAi } = require('../_lib/ai-call');
const { checkAndIncrementUsage, WEEKLY_FREE_LIMIT } = require('../_lib/usage');

// POST /api/ai/generate-recipe
// Body: { recipe: { name, ... } }              → generate full recipe from stub
// Body: { recipe: { name, ... }, request: "" } → adjust existing recipe per request
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipe, request } = req.body || {};
  if (!recipe?.name) return res.status(400).json({ error: 'recipe.name is required' });

  const isAdjust = typeof request === 'string' && request.trim().length > 0;
  if (isAdjust === false && request !== undefined && request !== null) {
    return res.status(400).json({ error: 'request must be a non-empty string when provided' });
  }

  const ctx = await getUserAndHousehold(req).catch(() => null);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { provider, token, usingSharedKey } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  if (usingSharedKey) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Weekly limit of ${WEEKLY_FREE_LIMIT} AI calls reached. Connect Puter or add your own Gemini key in Settings.`,
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
};

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

Write it like a confident home cook — specific quantities, steps that explain what to look for, not just what to do.

RULES:
1. 6–10 ingredients with precise amounts. Use weight (g/ml) for things that vary by size, count for things that don't ("2 chicken thighs", "150g cherry tomatoes", "3 tbsp olive oil", "1 lemon, zested and juiced").
2. 4–7 numbered steps. Each step 1–3 sentences. Say what to look for: colour, texture, sound, smell — not just timings. Timings are a guide, not a rule.
3. No brand names. No "enjoy your meal". No "this dish". No closing sentence.
4. If there's a useful tip (e.g. resting meat, salting pasta water properly), weave it into the relevant step — don't bolt it on at the end.
5. servings: 2
6. Estimate macros per serving — rough is fine.
7. Adjust prepTime and cookTime if the original estimate seems off for this recipe.

Return ONLY a JSON object, no markdown:
{
  "ingredients": [
    { "name": "chicken thighs, bone-in skin-on", "amount": "2" },
    { "name": "cherry tomatoes", "amount": "200g" }
  ],
  "steps": [
    "Pat the chicken dry and season generously on both sides...",
    "Heat a wide, heavy pan over medium-high — hot enough that a drop of water bounces off..."
  ],
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

You are adjusting an existing recipe based on a specific user request. Change only what the request asks for. Keep everything else exactly as-is — same structure, same portions, same style.

RECIPE: ${recipe.name}
Servings: ${recipe.servings || 2}
Prep: ${recipe.prepTime || '?'} min | Cook: ${recipe.cookTime || '?'} min

CURRENT INGREDIENTS:
${ingredientsList || '  (none listed)'}

CURRENT STEPS:
${stepsList || '  (none listed)'}

USER REQUEST: "${request}"

RULES:
1. Only change what the request asks for. If they say "use chicken breast instead of thighs", swap the ingredient and update the relevant step — nothing else.
2. Keep the same number of steps where possible. Only add or remove a step if the change genuinely requires it.
3. If the request is about quantity or spice level, adjust just the ingredient amount and mention it in the relevant step.
4. Keep the voice: specific, direct, no marketing adjectives.
5. Return the complete updated recipe (all ingredients and all steps), not just the changed parts.

Return ONLY a JSON object, no markdown:
{
  "ingredients": [
    { "name": "chicken breast, skinless", "amount": "2" },
    { "name": "cherry tomatoes", "amount": "200g" }
  ],
  "steps": [
    "Pat the chicken dry...",
    "..."
  ],
  "servings": ${recipe.servings || 2},
  "prepTime": <minutes as integer>,
  "cookTime": <minutes as integer>,
  "macros": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }
}`;
}
