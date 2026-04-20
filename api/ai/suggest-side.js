'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');
const { resolveAiProvider, callAi } = require('../_lib/ai-call');

// POST /api/ai/suggest-side
// Body A — side dish: { recipe: { name, cuisine_type?, ingredients? }, preference?: string }
// Body B — surprise bag: { bag_ingredients: string, dietary_prefs?: string }
// Returns: { suggestions: [{ name: string, description: string }] }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipe, preference, bag_ingredients, dietary_prefs } = req.body || {};
  const isBag = !!bag_ingredients;

  if (!isBag && !recipe?.name) return res.status(400).json({ error: 'recipe.name or bag_ingredients is required' });

  const ctx = await getUserAndHousehold(req).catch(() => null);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { provider, token } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  let prompt;
  if (isBag) {
    const dietPart = dietary_prefs ? ` Dietary notes: ${dietary_prefs}.` : '';
    prompt = `A home cook just got a surprise food bag (like Too Good To Go) with these ingredients: ${bag_ingredients}.${dietPart} Suggest 2-3 complete meals they can cook with what they have. Use as much of the bag as possible to avoid waste. Each meal should be a real, well-known dish — adapted to use these specific ingredients. Return ONLY JSON: {"suggestions":[{"name":"...","description":"one sentence — what it is and which bag ingredients it uses"}]}`;
  } else {
    const prefPart = preference ? ` ${preference}.` : '';
    prompt = `Suggest 2-3 quick side dishes to go with ${recipe.name}.${prefPart} Each side should be simple (under 15 min), complement the main, and not repeat main ingredients. Return ONLY JSON: {"suggestions":[{"name":"...","description":"one line, what it adds"}]}`;
  }

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

  res.json({ suggestions: parsed.suggestions || [] });
};
