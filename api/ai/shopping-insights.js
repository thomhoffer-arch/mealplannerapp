import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../_lib/auth.js';
import { resolveAiProvider, callAi } from '../_lib/ai-call.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { items = [], recipes = [] } = req.body || {};
  if (!items.length) return res.json({ insights: [] });

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

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

Identify up to 5 ingredients where the household will likely buy more than they need. For each, give a short practical tip on how to use up the rest.

Return ONLY JSON, no markdown:
{"insights":[{"ingredient":"spinach","tip":"Bags are usually 200–250g; toss the rest into scrambled eggs or a wrap."}]}

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
}
