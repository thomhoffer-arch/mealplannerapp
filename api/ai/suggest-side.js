'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');
const { resolveAiProvider, callAi } = require('../_lib/ai-call');

// POST /api/ai/suggest-side
// Body: { recipe: { name, cuisine_type?, ingredients? }, preference?: string }
// Returns: { suggestions: [{ name: string, description: string }] }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipe, preference } = req.body || {};
  if (!recipe?.name) return res.status(400).json({ error: 'recipe.name is required' });

  const ctx = await getUserAndHousehold(req).catch(() => null);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { provider, token } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  const prefPart = preference ? ` ${preference}.` : '';
  const prompt = `Suggest 2-3 quick side dishes to go with ${recipe.name}.${prefPart} Each side should be simple (under 15 min), complement the main, and not repeat main ingredients. Return ONLY JSON: {"suggestions":[{"name":"...","description":"one line, what it adds"}]}`;

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
