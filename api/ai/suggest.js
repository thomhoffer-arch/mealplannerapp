'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');
const { VOICE_GUIDE } = require('../_lib/voice');
const { resolveAiProvider, callAi } = require('../_lib/ai-call');
const { checkAndIncrementUsage, isGiftedHousehold, WEEKLY_FREE_LIMIT } = require('../_lib/usage');

// POST /api/ai/suggest
// Body: { recipe, preferences, starredRecipes }
// Returns: { suitable, issues, substitutions, tips }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipe, preferences, starredRecipes } = req.body || {};
  if (!recipe) return res.status(400).json({ error: 'recipe is required' });

  const ctx = await getUserAndHousehold(req).catch(() => null);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Resolve provider: Puter token → Gemini BYOK → shared Gemini
  const { provider, token, usingSharedKey } = ctx
    ? await resolveAiProvider(supabase, ctx.householdId)
    : { provider: 'gemini', token: process.env.GEMINI_API_KEY || null, usingSharedKey: true };
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  // Enforce weekly cap only when using the shared server key
  if (usingSharedKey && ctx && !(await isGiftedHousehold(supabase, ctx.householdId))) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Weekly limit of ${WEEKLY_FREE_LIMIT} AI suggestions reached. Connect Puter or add your own Gemini key in Settings for unlimited use.`,
      });
    }
  }

  const prompt = buildPrompt(recipe, preferences || {}, starredRecipes || []);

  let text;
  try {
    text = await callAi(provider, token, prompt);
  } catch (err) {
    console.error('AI error:', err.message);
    return res.status(502).json({ error: err.message || 'AI service error' });
  }
  if (!text) return res.status(502).json({ error: 'Empty AI response' });

  try {
    res.json(JSON.parse(text));
  } catch {
    res.status(502).json({ error: 'Could not parse AI response' });
  }
};

function buildPrompt(recipe, preferences, starredRecipes) {
  const preferencesText = (preferences.preferences_text || '').trim();

  const ingredientList = (recipe.ingredients || [])
    .map((i) => `- ${i.amount ? i.amount + ' ' : ''}${i.name}`)
    .join('\n');

  const starredSection = starredRecipes.length
    ? `RECIPES THIS HOUSEHOLD HAS STARRED (use to infer taste preferences):\n${starredRecipes.map((r) => `- ${r.name} (${r.source})`).join('\n')}`
    : '';

  return `${VOICE_GUIDE}

---

You help a household adapt a recipe to their preferences. Write any prose (substitution reasons, tips) in the voice above. Analyse this recipe and suggest specific adaptations.

HOUSEHOLD PREFERENCES:
${preferencesText || 'No preferences provided — suggest general improvements if any.'}

${starredSection}

RECIPE: ${recipe.name}
Source: ${recipe.source || 'Unknown'}
Servings: ${recipe.servings || 2}

INGREDIENTS:
${ingredientList || 'Not listed'}

STEPS (summary):
${(recipe.steps || []).slice(0, 3).join(' | ') || 'Not listed'}

Return ONLY a JSON object with this exact structure — no markdown, no explanation:
{
  "suitable": <boolean — true if recipe already fits the preferences>,
  "issues": [<string — each specific problem found, e.g. "pasta contains gluten">],
  "substitutions": [
    {
      "original": "<exact ingredient as listed>",
      "replacement": "<what to use instead>",
      "reason": "<one short sentence why>"
    }
  ],
  "tips": "<optional short paragraph with any useful cooking notes for the adaptations>"
}

If the recipe already fits all preferences, return suitable: true, empty issues and substitutions arrays, and a brief encouraging tip.`;
}
