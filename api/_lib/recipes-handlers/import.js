import { getUserAndHousehold } from '../auth.js';
import { decrypt } from '../crypto.js';
import { createClient } from '@supabase/supabase-js';

export default async function handleImport(req, res) {
  const { url } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'A valid URL is required' });
  }

  const apiKey = await resolveApiKey(req);
  if (!apiKey) return res.status(503).json({ error: 'No Gemini API key configured' });

  let html;
  try {
    const pageRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MealPlannerBot/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!pageRes.ok) return res.status(422).json({ error: 'Could not fetch that URL' });
    html = await pageRes.text();
  } catch {
    return res.status(422).json({ error: 'Could not reach that URL' });
  }

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 12000);

  const prompt = `Extract the recipe from this webpage text and return ONLY a JSON object — no markdown, no explanation.

WEBPAGE TEXT:
${text}

Return this exact structure (use null for missing fields):
{
  "id": "<url-slug derived from recipe name, lowercase, hyphens>",
  "name": "<recipe name>",
  "source": "Web import",
  "sourceUrl": "${url}",
  "prepTime": <number in minutes or null>,
  "cookTime": <number in minutes or null>,
  "servings": <number or 2>,
  "overview": "<one sentence description>",
  "keywords": ["<tag1>"],
  "dietary": [],
  "cuisine": null,
  "season": null,
  "macros": { "calories": null, "protein": null, "carbs": null, "fat": null },
  "ingredients": [{ "name": "<ingredient name>", "amount": "<amount with unit or empty string>" }],
  "steps": ["<step 1>"]
}

If the page does not contain a recipe, return: { "error": "No recipe found on this page" }`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );

  if (!geminiRes.ok) return res.status(502).json({ error: 'AI service error' });

  const geminiData = await geminiRes.json();
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) return res.status(502).json({ error: 'Empty AI response' });

  let recipe;
  try { recipe = JSON.parse(raw); } catch {
    return res.status(502).json({ error: 'Could not parse AI response' });
  }

  if (recipe.error) return res.status(422).json({ error: recipe.error });
  if (!recipe.id) recipe.id = `import-${Date.now()}`;

  res.json(recipe);
}

async function resolveApiKey(req) {
  try {
    const { ctx } = await getUserAndHousehold(req);
    if (ctx) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await supabase
        .from('household_preferences')
        .select('gemini_api_key_encrypted')
        .eq('household_id', ctx.householdId)
        .single();
      if (data?.gemini_api_key_encrypted) return decrypt(data.gemini_api_key_encrypted);
    }
  } catch { /* fall through */ }
  return process.env.GEMINI_API_KEY || null;
}
