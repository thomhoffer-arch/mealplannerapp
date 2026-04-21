import { requireAuth } from '../auth.js';
import { resolveAiProvider, callAi } from '../ai-call.js';
import { normalizeSpoonacular, normalizeHelloFresh } from '../normalize.js';

// Federated recipe search across three sources, each independently toggled
// by its own env var / auth state:
//
//   - Spoonacular  — active when SPOONACULAR_API_KEY is set. Rich,
//                     structured recipes with nutrition info.
//   - HelloFresh   — active when HELLOFRESH_CLIENT_SECRET is set.
//   - LLM          — active when the caller is signed in. Returns 8 recipe
//                     stubs that can be fleshed out later via generate-recipe.
//                     Catches the "no external keys configured" case so the
//                     search UI always has something to show.
//
// To disable a source, just leave its env var unset — the code stays in
// place for when you add the key back.
export default async function handleSearch(req, res) {
  const { q = '', dietary = '', time = '', cuisine = '', source = 'all' } = req.query;

  const hasQuery = q.trim().length > 0;
  const hasFilters = dietary || time || cuisine;
  if (!hasQuery && !hasFilters) return res.json([]);

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const [spoonResults, hfResults, aiResults] = await Promise.all([
    source !== 'hellofresh' && source !== 'ai' ? searchSpoonacular(q, dietary, time, cuisine) : Promise.resolve([]),
    source !== 'spoonacular' && source !== 'ai' ? searchHelloFresh(q, dietary, time, cuisine) : Promise.resolve([]),
    source !== 'spoonacular' && source !== 'hellofresh' ? searchAi(q, dietary, time, cuisine, ctx) : Promise.resolve([]),
  ]);

  // External sources first, then AI stubs — so when Spoonacular is active,
  // its richer entries lead. Pure-AI mode (no external keys set) still
  // shows a full page of results.
  return res.json([...hfResults, ...spoonResults, ...aiResults]);
}

async function searchSpoonacular(q, dietary, time, cuisine) {
  if (!process.env.SPOONACULAR_API_KEY) return [];

  const params = new URLSearchParams({
    apiKey: process.env.SPOONACULAR_API_KEY,
    query: q,
    number: 20,
    addRecipeInformation: 'true',
    addRecipeNutrition: 'true',
    fillIngredients: 'true',
  });

  const diets = dietary ? dietary.split(',') : [];
  if (diets.includes('vegetarian')) params.set('diet', 'vegetarian');
  if (diets.includes('gluten-free')) params.set('intolerances', 'gluten');
  if (diets.includes('high-protein')) params.set('minProtein', '30');
  if (time === '<20min') params.set('maxReadyTime', '20');
  if (time === '20-40min') { params.set('minReadyTime', '20'); params.set('maxReadyTime', '40'); }
  if (time === '40+min') params.set('minReadyTime', '40');
  if (cuisine && cuisine !== 'light' && cuisine !== 'dutch') params.set('cuisine', cuisine);

  const response = await fetch(`https://api.spoonacular.com/recipes/complexSearch?${params}`);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.results || []).map(normalizeSpoonacular);
}

async function searchAi(q, dietary, time, cuisine, ctx) {
  const { provider, token } = await resolveAiProvider(ctx.supabase, ctx.householdId);
  if (!token) return [];

  // Load household preferences so suggestions respect dietary wishes
  const [{ data: prefData }, { data: membersData }] = await Promise.all([
    ctx.supabase.from('household_preferences').select('preferences_text').eq('household_id', ctx.householdId).maybeSingle(),
    ctx.supabase.from('household_members').select('display_name, personal_prefs').eq('household_id', ctx.householdId),
  ]);
  const preferences = prefData?.preferences_text || '';
  const memberPrefs = (membersData || [])
    .map((m) => (m.personal_prefs || '').trim())
    .filter(Boolean)
    .join('; ');

  const constraints = [
    time === '<20min' && 'under 20 minutes total',
    time === '20-40min' && '20-40 minutes total',
    time === '40+min' && 'at least 40 minutes',
    cuisine && cuisine !== 'light' && cuisine !== 'dutch' && `${cuisine} cuisine`,
    cuisine === 'light' && 'light and healthy',
    cuisine === 'dutch' && 'Dutch / Benelux style',
    (dietary || '').split(',').includes('vegetarian') && 'vegetarian',
    (dietary || '').split(',').includes('gluten-free') && 'gluten-free',
    (dietary || '').split(',').includes('high-protein') && 'high-protein (30g+ per serving)',
  ].filter(Boolean).join(', ');

  const householdContext = [
    preferences && `Household preferences: ${preferences}`,
    memberPrefs && `Individual preferences: ${memberPrefs}`,
  ].filter(Boolean).join('\n');

  const prompt = `You are a dinner-search assistant. Suggest 8 real, well-known dishes matching this query: "${q || '(no query, use constraints below)'}".${constraints ? ` Must be: ${constraints}.` : ''}

Adapt every dish to honour the household's dietary wishes below — keep the dish concept but reformulate ingredients as needed (e.g. a gluten-free pasta uses rice pasta; a dairy-free risotto uses olive oil). Do NOT exclude a dish just because of a dietary constraint — adapt it instead. Name the adaptation in the dish title when the change is significant.
${householdContext ? `\n${householdContext}\n` : ''}
Favour variety — mix cuisines and techniques instead of returning eight near-duplicates. Ground every dish in a recipe a home cook actually makes.

Return ONLY JSON, no markdown:
{
  "recipes": [
    {
      "id": "<lowercase-kebab-case-slug-from-name>",
      "name": "<recipe name>",
      "overview": "<one short sentence>",
      "cuisine": "<Italian | Asian | Mexican | …>",
      "keywords": ["<tag1>", "<tag2>"],
      "prepTime": <minutes or null>,
      "cookTime": <minutes or null>,
      "servings": 2,
      "dietary": ["<e.g. vegetarian, gluten-free, high-protein>"]
    }
  ]
}`;

  let rawText;
  try {
    rawText = await callAi(provider, token, prompt);
  } catch (err) {
    console.warn('[recipes/search] AI search failed:', err.message);
    return [];
  }

  let parsed;
  try { parsed = JSON.parse(rawText); } catch { return []; }

  return (parsed.recipes || []).map((r, i) => ({
    id: r.id || `ai-search-${Date.now()}-${i}`,
    name: r.name || 'Suggested recipe',
    source: 'AI Suggestion',
    overview: r.overview || '',
    cuisine: r.cuisine || null,
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
    prepTime: r.prepTime || null,
    cookTime: r.cookTime || null,
    servings: r.servings || 2,
    ingredients: [],
    steps: [],
    macros: {},
    dietary: Array.isArray(r.dietary) ? r.dietary : [],
    _aiSuggestion: true,
  }));
}

async function searchHelloFresh(q, dietary, time, cuisine) {
  const token = await getHelloFreshToken();
  if (!token) return [];

  const params = new URLSearchParams({ country: 'nl', locale: 'nl-NL', limit: '12', order: '-favorites' });
  if (q) params.set('q', q);

  const response = await fetch(
    `https://gw.hellofresh.com/api/recipes/search?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) return [];
  const data = await response.json();

  let recipes = (data.items || []).map(normalizeHelloFresh);
  if (time === '<20min') recipes = recipes.filter((r) => r.prepTime + r.cookTime < 20);
  if (time === '20-40min') recipes = recipes.filter((r) => { const t = r.prepTime + r.cookTime; return t >= 20 && t <= 40; });
  if (time === '40+min') recipes = recipes.filter((r) => r.prepTime + r.cookTime > 40);
  return recipes;
}

let _hfToken = null;
let _hfTokenExpiry = 0;

async function getHelloFreshToken() {
  if (_hfToken && Date.now() < _hfTokenExpiry) return _hfToken;
  const clientId = process.env.HELLOFRESH_CLIENT_ID || 'hellofresh-dev-test';
  const clientSecret = process.env.HELLOFRESH_CLIENT_SECRET;
  if (!clientSecret) return null;
  try {
    const response = await fetch('https://gw.hellofresh.com/gw/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope: 'public' }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    _hfToken = data.access_token;
    _hfTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return _hfToken;
  } catch { return null; }
}
