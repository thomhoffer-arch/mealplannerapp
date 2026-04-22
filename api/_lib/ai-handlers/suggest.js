import { createClient } from '@supabase/supabase-js';
import { getUserAndHousehold } from '../auth.js';
import { VOICE_GUIDE } from '../voice.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { checkAndIncrementUsage, isGiftedHousehold } from '../usage.js';

export default async function handleSuggest(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipe, preferences, starredRecipes } = req.body || {};
  if (!recipe) return res.status(400).json({ error: 'recipe is required' });

  // Optional auth: if the user isn't signed in we still serve the suggestion
  // using the shared Gemini key, just without household-scoped usage tracking.
  const authResult = await getUserAndHousehold(req).catch(() => ({ error: { status: 401 } }));
  const ctx = authResult.ctx || null;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { provider, token, usingSharedKey } = ctx
    ? await resolveAiProvider(supabase, ctx.householdId)
    : { provider: 'gemini', token: process.env.GEMINI_API_KEY || null, usingSharedKey: true };
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  if (usingSharedKey && ctx && !(await isGiftedHousehold(supabase, ctx.householdId))) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Your kitchen's weekly AI limit has been reached. Upgrade for more, or wait until next week.`,
        code: 'weekly_limit_reached',
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
}

function buildPrompt(recipe, preferences, starredRecipes) {
  const preferencesText = (preferences.preferences_text || '').trim();
  const ingredientList = (recipe.ingredients || [])
    .map((i) => `- ${i.amount ? i.amount + ' ' : ''}${i.name}`)
    .join('\n');
  const starredNames = (starredRecipes || []).slice(0, 10).map((r) => r.name).filter(Boolean).join(', ');

  return `${VOICE_GUIDE}

---

Analyse this recipe for a household and return suitability information.

RECIPE: ${recipe.name}
INGREDIENTS:
${ingredientList || '(none listed)'}

HOUSEHOLD PREFERENCES: ${preferencesText || 'none'}
STARRED RECIPES (favourites for context): ${starredNames || 'none'}

Return ONLY a JSON object:
{
  "suitable": true/false,
  "issues": ["issue 1"],
  "substitutions": [{"original": "ingredient", "substitute": "alternative", "reason": "why"}],
  "tips": ["tip 1"]
}`;
}
