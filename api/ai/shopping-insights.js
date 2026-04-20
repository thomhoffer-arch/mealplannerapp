'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');
const { resolveAiProvider, callAi } = require('../_lib/ai-call');

// POST /api/ai/shopping-insights
// Body: { items: [{ name, amount }], recipes: [{ name, servings }] }
// Returns: { insights: [{ ingredient, tip }] }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { items = [], recipes = [] } = req.body || {};
  if (!items.length) return res.json({ insights: [] });

  const ctx = await getUserAndHousehold(req).catch(() => null);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { provider, token } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  const itemList = items.map((i) => `- ${i.name}${i.amount ? ` (${i.amount})` : ''}`).join('\n');
  const recipeList = recipes.map((r) => `- ${r.name}${r.servings ? ` (${r.servings} servings)` : ''}`).join('\n');

  const prompt = `You are a sustainable shopping advisor helping reduce food waste.

This household is cooking these meals this week:
${recipeList || '(no recipe names provided)'}

Their shopping list:
${itemList}

Identify up to 5 ingredients where the household will likely buy more than they need — because recipes typically use only part of a standard supermarket pack (e.g. a recipe needs 200g but spinach is sold in 400g bags, or needs half a can of coconut milk). For each, give a short, practical tip on how to use up the rest (in another meal this week, a quick add-on, or how to store/freeze it). Only flag ingredients that genuinely come in larger packs than the recipe needs — skip staples like olive oil, salt, or spices.

Return ONLY JSON, no markdown:
{"insights":[{"ingredient":"spinach","tip":"Recipes need about 150g total — bags are usually 200–250g. Toss the rest into scrambled eggs or a lunchtime wrap."},{"ingredient":"coconut milk","tip":"One can is 400ml; Thai curry only needs 200ml. Use the rest in a quick rice pudding or freeze in an ice-cube tray."}]}

Return an empty array if there are no meaningful waste opportunities.`;

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

  res.json({ insights: parsed.insights || [] });
};
