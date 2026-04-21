import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../auth.js';
import { resolveAiProvider, callGemini } from '../ai-call.js';

const TODAY = () => new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

export default async function handleSearchDeals(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { provider, token, usingSharedKey } = await resolveAiProvider(supabase, ctx.householdId);

  // Deals search requires the household's own Gemini key — it uses Google Search
  // grounding which isn't available on the shared free-tier key or via Puter.
  if (usingSharedKey) {
    return res.status(403).json({ error: 'Deals search requires your own Gemini API key. Add one in Settings.' });
  }
  if (provider !== 'gemini') {
    return res.status(403).json({ error: 'Deals search is only available with a Gemini API key.' });
  }

  const prompt = `Today is ${TODAY()}.

Search for items currently on offer (in bonus / aanbieding) at Albert Heijn and Jumbo supermarkets in the Netherlands this week. Focus on ingredients useful for home cooking: fresh produce, meat, fish, dairy, and staples. Skip cleaning products, snacks, alcohol, and ready meals.

Return ONLY a JSON object, no markdown:
{"deals":[{"item":"spinach","store":"Albert Heijn","price":"€0.89"},{"item":"salmon fillet","store":"Jumbo","price":"€5.99"}]}

Include up to 20 items. If you cannot find current deals, return {"deals":[]}.`;

  let rawText;
  try {
    const { data } = await callGemini(token, {
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
    });
    const parts = data.candidates?.[0]?.content?.parts || [];
    rawText = parts[parts.length - 1]?.text || '';
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Search failed' });
  }

  if (!rawText) return res.status(502).json({ error: 'Empty response from search' });

  // Extract JSON even if the model wrapped it in prose
  const jsonMatch = rawText.match(/\{[\s\S]*"deals"[\s\S]*\}/);
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    return res.status(502).json({ error: 'Could not parse deals response' });
  }

  res.json({ deals: parsed.deals || [] });
}
