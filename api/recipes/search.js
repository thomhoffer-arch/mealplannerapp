import { normalizeSpoonacular, normalizeHelloFresh } from '../_lib/normalize.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { q = '', dietary = '', time = '', cuisine = '', source = 'all' } = req.query;

  const hasQuery = q.trim().length > 0;
  const hasFilters = dietary || time || cuisine;
  if (!hasQuery && !hasFilters) return res.json([]);

  const results = await Promise.allSettled([
    source !== 'hellofresh' ? searchSpoonacular(q, dietary, time, cuisine) : Promise.resolve([]),
    source !== 'spoonacular' ? searchHelloFresh(q, dietary, time, cuisine) : Promise.resolve([]),
  ]);

  const spoonacularResults = results[0].status === 'fulfilled' ? results[0].value : [];
  const hellofreshResults = results[1].status === 'fulfilled' ? results[1].value : [];

  res.json([...hellofreshResults, ...spoonacularResults]);
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
