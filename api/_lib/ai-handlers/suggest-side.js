import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../auth.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { checkAndIncrementUsage, isGiftedHousehold } from '../usage.js';

export default async function handleSuggestSide(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipe, preference, bag_ingredients, dietary_prefs } = req.body || {};
  const isBag = !!bag_ingredients;

  if (!isBag && !recipe?.name) return res.status(400).json({ error: 'recipe.name or bag_ingredients is required' });

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

  // Pantry-awareness + household preferences fetched together.
  const [{ data: pantryData }, { data: prefData }] = await Promise.all([
    supabase.from('pantry_items').select('name').eq('household_id', ctx.householdId),
    supabase.from('household_preferences').select('preferences_text').eq('household_id', ctx.householdId).maybeSingle(),
  ]);
  const pantry = (pantryData || []).map((p) => p.name).filter(Boolean).slice(0, 20);
  const pantryHint = pantry.length
    ? `\nPantry (already on hand, prefer when it fits): ${pantry.join(', ')}.`
    : '';
  const householdPrefs = prefData?.preferences_text || '';
  const prefHint = householdPrefs ? ` Household dietary preferences: ${householdPrefs}.` : '';

  let prompt;
  if (isBag) {
    const dietPart = dietary_prefs ? ` Dietary notes: ${dietary_prefs}.` : '';
    prompt = `A home cook just got a surprise food bag with these ingredients: ${bag_ingredients}.${dietPart}${prefHint}${pantryHint} Suggest 2-3 complete meals they can cook with what they have. Return ONLY JSON: {"suggestions":[{"name":"...","description":"one sentence","ingredients":[{"name":"ingredient name","amount":"quantity e.g. 200g"}]}]}`;
  } else {
    const prefPart = preference ? ` ${preference}.` : '';
    prompt = `Suggest 2-3 quick side dishes to go with ${recipe.name}.${prefPart}${prefHint}${pantryHint} Each side should be simple (under 15 min). Return ONLY JSON: {"suggestions":[{"name":"...","description":"one line","ingredients":[{"name":"ingredient name","amount":"quantity e.g. 2 cups"}]}]}`;
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
}
