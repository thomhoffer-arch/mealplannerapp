import { createClient } from '@supabase/supabase-js';
import { getUserAndHousehold } from '../auth.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { isGiftedHousehold } from '../usage.js';

export default async function handleNormalizePantryItem(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const authResult = await getUserAndHousehold(req);
  if (authResult.error) return res.status(authResult.error.status).json({ error: authResult.error.message });
  const { ctx } = authResult;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { provider, token, usingSharedKey } = await resolveAiProvider(supabase, ctx.householdId);

  // Only available for own-key users and gifted households — no shared quota spent.
  if (usingSharedKey && !(await isGiftedHousehold(supabase, ctx.householdId))) {
    return res.status(403).json({ error: 'own_key_required' });
  }

  if (!token) return res.status(503).json({ error: 'No AI provider configured' });

  const prompt = `You are a pantry ingredient classifier. Given a pantry item name, decide if it's ambiguous — meaning the same word refers to genuinely different ingredients that you'd buy separately.

AMBIGUOUS examples:
- "pepper" → black pepper (spice), chili pepper (vegetable), bell pepper (vegetable)
- "oil" → olive oil, vegetable oil, coconut oil, sesame oil
- "vinegar" → white wine vinegar, balsamic vinegar, apple cider vinegar
- "stock" → chicken stock, beef stock, vegetable stock
- "milk" → whole milk, oat milk, almond milk, coconut milk

NOT ambiguous (just one thing, qualifier doesn't matter):
- "garlic", "butter", "eggs", "flour", "sugar", "onion", "lemon", "pasta", "rice"
- "olive oil" (already specific), "black pepper" (already specific)

Pantry item: "${name.replace(/"/g, "'")}"

Return ONLY valid JSON, no markdown:
{"canonical":"most common interpretation","ambiguous":true,"alternatives":["other type 1","other type 2"]}

If not ambiguous: {"canonical":"canonical name","ambiguous":false,"alternatives":[]}`;

  let text;
  try {
    text = await callAi(provider, token, prompt);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  const cleaned = (text || '').replace(/```json\n?|\n?```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return res.json({
      canonical: String(parsed.canonical || name).toLowerCase().trim(),
      ambiguous: !!parsed.ambiguous,
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 4) : [],
    });
  } catch {
    return res.json({ canonical: name, ambiguous: false, alternatives: [] });
  }
}
