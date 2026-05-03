import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../auth.js';
import { resolveAiProvider, callGemini } from '../ai-call.js';
import { isUserPremium } from '../usage.js';

const TODAY = () => new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

export default async function handleSearchDeals(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const [{ provider, token, usingSharedKey }, isPremium] = await Promise.all([
    resolveAiProvider(supabase, ctx.householdId),
    isUserPremium(supabase, ctx.householdId, ctx.user.id),
  ]);

  // Deals need Google Search grounding, only available on Gemini.
  // Households with their own Gemini key always get through.
  // Premium households without a personal key fall back to the shared deals key.
  // Everyone else must add their own Gemini key.
  let dealsToken;
  if (provider === 'gemini' && !usingSharedKey) {
    dealsToken = token;
  } else if (isPremium) {
    const sharedDealsKey = process.env.GEMINI_DEALS_API_KEY || process.env.GEMINI_API_KEY;
    if (!sharedDealsKey) {
      return res.status(503).json({ error: 'Deals search is temporarily unavailable.' });
    }
    dealsToken = sharedDealsKey;
  } else {
    return res.status(403).json({
      error: usingSharedKey
        ? 'Deals search requires your own Gemini API key. Add one in Settings.'
        : 'Deals search is only available with a Gemini API key.',
    });
  }

  const prompt = `Today is ${TODAY()}.

Search for items currently on offer (in bonus / aanbieding) at Albert Heijn, Jumbo, and Picnic in the Netherlands this week. Focus on ingredients useful for home cooking: fresh produce, meat, fish, dairy, and staples. Skip cleaning products, snacks, alcohol, and ready meals.

Return ONLY a JSON object, no markdown:
{"deals":[{"item":"spinach","store":"Albert Heijn","price":"€0.89"},{"item":"salmon fillet","store":"Jumbo","price":"€5.99"},{"item":"chicken breast","store":"Picnic","price":"€4.99"}]}

Include up to 20 items. If you cannot find current deals, return {"deals":[]}.`;

  let rawText;
  try {
    const { data } = await callGemini(dealsToken, {
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
