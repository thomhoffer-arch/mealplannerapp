'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');
const { decrypt } = require('../_lib/crypto');

const DAILY_FREE_LIMIT = 50;

// POST /api/ai/suggest
// Body: { recipe, preferences, starredRecipes }
// Returns: { suitable, issues, substitutions, tips }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipe, preferences, starredRecipes } = req.body || {};
  if (!recipe) return res.status(400).json({ error: 'recipe is required' });

  const ctx = await getUserAndHousehold(req).catch(() => null);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Resolve which API key to use: household key → server default
  const { apiKey, usingSharedKey } = await resolveApiKey(ctx, supabase);
  if (!apiKey) return res.status(503).json({ error: 'No Gemini API key configured' });

  // Enforce daily cap when using the shared server key
  if (usingSharedKey && ctx) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Daily limit of ${DAILY_FREE_LIMIT} AI suggestions reached. Add your own Gemini API key in Settings for unlimited use.`,
      });
    }
  }

  const prompt = buildPrompt(recipe, preferences || {}, starredRecipes || []);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  if (!response.ok) {
    console.error('Gemini error:', await response.text());
    return res.status(502).json({ error: 'AI service error' });
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return res.status(502).json({ error: 'Empty AI response' });

  try {
    res.json(JSON.parse(text));
  } catch {
    res.status(502).json({ error: 'Could not parse AI response' });
  }
};

async function resolveApiKey(ctx, supabase) {
  if (ctx) {
    try {
      const { data } = await supabase
        .from('household_preferences')
        .select('gemini_api_key_encrypted')
        .eq('household_id', ctx.householdId)
        .single();

      if (data?.gemini_api_key_encrypted) {
        return { apiKey: decrypt(data.gemini_api_key_encrypted), usingSharedKey: false };
      }
    } catch {
      // fall through
    }
  }
  return { apiKey: process.env.GEMINI_API_KEY || null, usingSharedKey: true };
}

async function checkAndIncrementUsage(supabase, householdId) {
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from('ai_usage')
    .select('call_count')
    .eq('household_id', householdId)
    .eq('usage_date', today)
    .single();

  if (data && data.call_count >= DAILY_FREE_LIMIT) return true;

  await supabase.from('ai_usage').upsert(
    { household_id: householdId, usage_date: today, call_count: (data?.call_count || 0) + 1 },
    { onConflict: 'household_id,usage_date' }
  );

  return false;
}

function buildPrompt(recipe, preferences, starredRecipes) {
  const preferencesText = (preferences.preferences_text || '').trim();

  const ingredientList = (recipe.ingredients || [])
    .map((i) => `- ${i.amount ? i.amount + ' ' : ''}${i.name}`)
    .join('\n');

  const starredSection = starredRecipes.length
    ? `RECIPES THIS HOUSEHOLD HAS STARRED (use to infer taste preferences):\n${starredRecipes.map((r) => `- ${r.name} (${r.source})`).join('\n')}`
    : '';

  return `You are a helpful cooking assistant. Analyse this recipe against the household's preferences and suggest specific adaptations.

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
