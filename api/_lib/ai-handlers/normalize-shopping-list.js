import { createClient } from '@supabase/supabase-js';
import { getUserAndHousehold } from '../auth.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { isUserPremium } from '../usage.js';

export default async function handleNormalizeShoppingList(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.json({ items: [] });

  const authResult = await getUserAndHousehold(req);
  if (authResult.error) return res.status(authResult.error.status).json({ error: authResult.error.message });
  const { ctx } = authResult;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { provider, token, usingSharedKey } = await resolveAiProvider(supabase, ctx.householdId);

  if (!(await isUserPremium(supabase, ctx.householdId, ctx.user.id))) {
    return res.status(403).json({ error: 'premium_required' });
  }

  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  const listText = items.map((item, i) => `${i}: "${item.name}"`).join('\n');

  const prompt = `You are a shopping list cleaner. Clean the ingredient names below so they read exactly as a person would write them on a handwritten shopping list — short, clean, lowercase, no quantities, no prep instructions.

Rules:
- Remove leading quantities and units (e.g. "300g large shrimp" → "large shrimp", "2 tbsp olive oil" → "olive oil", "500ml chicken stock" → "chicken stock")
- Remove preparation words (finely, roughly, sliced, chopped, diced, minced, grated, shredded, crushed, beaten, softened, melted, peeled, deveined, trimmed, etc.)
- Remove serving/garnish notes (for serving, to serve, for garnish, as needed, for topping)
- Remove cooking state words that don't change what you buy (roasted, boiled, steamed) — but keep them when the cooked state IS the product (e.g. "cooked ham", "smoked salmon")
- Never split or merge items — one cleaned name per index
- If an item is purely a prep/serving note and has no place on a shopping list, set skip: true
- Keep all names lowercase
- If the name is already clean, return it unchanged

Return ONLY valid JSON, no markdown:
{"results":[{"index":0,"name":"clean name","skip":false},...]}

Items to clean:
${listText}`;

  let text;
  try {
    text = await callAi(provider, token, prompt);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  try {
    const cleaned = (text || '').replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return res.json({ items: parsed.results || [] });
  } catch {
    return res.json({ items: [] });
  }
}
