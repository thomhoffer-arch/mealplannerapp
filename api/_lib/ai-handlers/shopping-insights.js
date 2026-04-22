import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../auth.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { checkAndIncrementUsage, isGiftedHousehold } from '../usage.js';

export default async function handleShoppingInsights(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { items = [], recipes = [] } = req.body || {};
  if (!items.length) return res.json({ insights: [] });

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { provider, token, usingSharedKey } = await resolveAiProvider(supabase, ctx.householdId);
  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  if (usingSharedKey && !(await isGiftedHousehold(supabase, ctx.householdId, ctx.user.id))) {
    const limited = await checkAndIncrementUsage(supabase, ctx.householdId);
    if (limited) {
      return res.status(429).json({
        error: `Your kitchen's weekly AI limit has been reached. Upgrade for more, or wait until next week.`,
        code: 'weekly_limit_reached',
      });
    }
  }

  const itemList = items.map((i) => `- ${i.name}${i.amount ? ` (${i.amount})` : ''}`).join('\n');
  const recipeList = recipes.map((r) => `- ${r.name}${r.servings ? ` (${r.servings} servings)` : ''}`).join('\n');

  const prompt = `You are a sustainable shopping advisor helping reduce food waste.

This household is cooking these meals this week:
${recipeList || '(no recipe names provided)'}

Their shopping list:
${itemList}

Identify up to 5 ingredients where the household will likely buy more than they need (e.g. a bunch of herbs when only a sprig is needed, a 250g bag of spinach when only a handful is used). For each:
1. Give a short practical tip on how to use the rest.
2. Suggest one specific simple dish — a side dish, a quick lunch, or a light breakfast — that would use that leftover ingredient. Keep the suggestion concrete (e.g. "spinach frittata", "herb butter on toast", "lemon yoghurt with honey").

Return ONLY JSON, no markdown:
{"insights":[{"ingredient":"spinach","tip":"Bags are usually 200–250g; toss the rest in tomorrow.","suggestion":"Quick spinach frittata for lunch"}]}

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
