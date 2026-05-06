import { getUserAndHousehold } from '../auth.js';
import { decrypt } from '../crypto.js';
import { callGemini } from '../ai-call.js';
import { createClient } from '@supabase/supabase-js';

export default async function handleImport(req, res) {
  const { url, language = 'English' } = req.body || {};
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

  // Pull schema.org JSON-LD Recipe blocks before stripping scripts. Most recipe
  // sites publish clean recipeInstructions/recipeIngredient here — far more
  // reliable than parsing the visible page text, which often gets truncated
  // before the steps section by surrounding menu/related-content markup.
  const jsonLdRecipe = extractJsonLdRecipe(html);
  const jsonLdSteps = jsonLdRecipe ? jsonLdInstructions(jsonLdRecipe) : [];
  const jsonLdIngs = jsonLdRecipe ? jsonLdIngredients(jsonLdRecipe) : [];

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 20000);

  const lang = language || 'English';
  const langInstruction = `\nLANGUAGE: ${lang}\nWrite ALL text fields (name, overview, ingredient names, steps) in ${lang} — translate from the source page if needed. JSON field names stay in English.\n`;

  const structuredHint = jsonLdRecipe
    ? `\nSTRUCTURED RECIPE DATA (from page's schema.org JSON-LD — prefer this for steps and ingredients; the visible text may be truncated):\n${JSON.stringify({
        name: jsonLdRecipe.name,
        description: jsonLdRecipe.description,
        recipeYield: jsonLdRecipe.recipeYield,
        prepTime: jsonLdRecipe.prepTime,
        cookTime: jsonLdRecipe.cookTime,
        ingredients: jsonLdIngs,
        steps: jsonLdSteps,
      })}\n`
    : '';

  const prompt = `Extract the recipe from this webpage text and return ONLY a JSON object — no markdown, no explanation.
${langInstruction}${structuredHint}
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

  let geminiData;
  try {
    ({ data: geminiData } = await callGemini(apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }));
  } catch (err) {
    return res.status(502).json({ error: err.message || 'AI service error' });
  }
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) return res.status(502).json({ error: 'Empty AI response' });

  let recipe;
  try { recipe = JSON.parse(raw); } catch {
    return res.status(502).json({ error: 'Could not parse AI response' });
  }

  if (recipe.error) return res.status(422).json({ error: recipe.error });
  if (!recipe.id) recipe.id = `import-${Date.now()}`;

  // Backfill from JSON-LD if the AI missed steps or ingredients
  if ((!Array.isArray(recipe.steps) || recipe.steps.length === 0) && jsonLdSteps.length) {
    recipe.steps = jsonLdSteps;
  }
  if ((!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) && jsonLdIngs.length) {
    recipe.ingredients = jsonLdIngs.map((s) => ({ name: s, amount: '' }));
  }

  res.json(recipe);
}

function extractJsonLdRecipe(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const found = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      collectRecipes(JSON.parse(m[1].trim()), found);
    } catch { /* skip malformed JSON-LD */ }
  }
  return found[0] || null;
}

function collectRecipes(node, out) {
  if (!node) return;
  if (Array.isArray(node)) { node.forEach((n) => collectRecipes(n, out)); return; }
  if (typeof node !== 'object') return;
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) out.push(node);
  if (node['@graph']) collectRecipes(node['@graph'], out);
}

function jsonLdInstructions(recipe) {
  const ri = recipe.recipeInstructions;
  if (!ri) return [];
  if (typeof ri === 'string') return ri.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  if (!Array.isArray(ri)) return [];
  const steps = [];
  for (const item of ri) {
    if (typeof item === 'string') { const s = item.trim(); if (s) steps.push(s); continue; }
    if (!item || typeof item !== 'object') continue;
    if (item['@type'] === 'HowToSection' && Array.isArray(item.itemListElement)) {
      for (const sub of item.itemListElement) {
        const t = sub?.text || sub?.name;
        if (t) steps.push(String(t).trim());
      }
    } else if (item.text) {
      steps.push(String(item.text).trim());
    }
  }
  return steps.filter(Boolean);
}

function jsonLdIngredients(recipe) {
  const ing = recipe.recipeIngredient || recipe.ingredients;
  if (!Array.isArray(ing)) return [];
  return ing.map((s) => String(s).trim()).filter(Boolean);
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
