'use strict';

const { createClient } = require('@supabase/supabase-js');
const { normalizeHelloFresh } = require('../_lib/normalize');

// Runs weekly — Mon (HelloFresh), Wed (Marley Spoon), Fri (NYT) — see vercel.json.
// Each invocation scrapes one site, staying within Vercel Hobby's 10s limit.
module.exports = async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  const site = req.query.site;
  if (!site) return res.status(400).json({ error: 'site param required' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let recipes = [];

  if (site === 'hellofresh') {
    recipes = await scrapeHelloFresh();
  } else if (site === 'marleyspoon') {
    recipes = await scrapeMarleySpoon();
  } else if (site === 'nyt') {
    recipes = await scrapeNYT();
  } else {
    return res.status(400).json({ error: 'unknown site' });
  }

  if (recipes.length > 0) {
    const { error } = await supabase
      .from('scraped_recipes')
      .upsert(
        recipes.map((r) => ({
          id: r.id,
          source: r.source,
          data: r,
          scraped_at: new Date().toISOString(),
        })),
        { onConflict: 'id' }
      );
    if (error) console.error('Supabase upsert error:', error.message);
  }

  res.json({ ok: true, site, count: recipes.length });
};

// ── HelloFresh (unofficial API — fast, ~1s) ───────────────────────────────────
async function scrapeHelloFresh() {
  const clientId = process.env.HELLOFRESH_CLIENT_ID || 'hellofresh-dev-test';
  const clientSecret = process.env.HELLOFRESH_CLIENT_SECRET;
  if (!clientSecret) return [];

  const tokenRes = await fetch('https://gw.hellofresh.com/gw/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'public',
    }),
  });
  if (!tokenRes.ok) return [];
  const { access_token: token } = await tokenRes.json();

  const res = await fetch(
    'https://gw.hellofresh.com/api/recipes/search?country=nl&locale=nl-NL&limit=20&order=-date',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map(normalizeHelloFresh);
}

// ── Marley Spoon (Contentful CDA — requires MARLEYSPOON_SPACE_ID + TOKEN) ────
async function scrapeMarleySpoon() {
  const spaceId = process.env.MARLEYSPOON_SPACE_ID;
  const token = process.env.MARLEYSPOON_ACCESS_TOKEN;
  if (!spaceId || !token) return [];

  const res = await fetch(
    `https://cdn.contentful.com/spaces/${spaceId}/entries?content_type=recipe&limit=20&access_token=${token}`
  );
  if (!res.ok) return [];
  const data = await res.json();

  return (data.items || []).map((item) => {
    const f = item.fields || {};
    return {
      id: `ms-${item.sys.id}`,
      name: f.title || 'Marley Spoon Recipe',
      source: 'Marley Spoon',
      image: f.photo?.fields?.file?.url ? `https:${f.photo.fields.file.url}` : null,
      prepTime: f.prepTime || 10,
      cookTime: (f.totalTime || 30) - (f.prepTime || 10),
      servings: f.servings || 2,
      dietary: (f.tags || []).map((t) => t?.fields?.name?.toLowerCase()).filter(Boolean),
      cuisine: 'international',
      season: 'all',
      overview: f.description || '',
      keywords: [],
      macros: {
        protein: f.nutritionFacts?.protein || 0,
        carbs: f.nutritionFacts?.carbohydrates || 0,
        fat: f.nutritionFacts?.fat || 0,
        calories: f.nutritionFacts?.calories || 0,
      },
      steps: (f.steps || []).map((s) => s?.fields?.description || ''),
      ingredients: (f.ingredients || []).map((i) => ({
        name: i?.fields?.ingredient?.fields?.name || '',
        amount: `${i?.fields?.amount || ''} ${i?.fields?.unit || ''}`.trim(),
      })),
    };
  });
}

// ── NYT Cooking (requires NYT_SESSION_COOKIE from a logged-in browser) ────────
async function scrapeNYT() {
  const cookie = process.env.NYT_SESSION_COOKIE;
  if (!cookie) return [];

  // Fetch the NYT Cooking recipe listing page
  const res = await fetch('https://cooking.nytimes.com/search?q=', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      Cookie: cookie,
    },
  });
  if (!res.ok) return [];
  const html = await res.text();

  // Extract JSON-LD recipe blocks
  const ldMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  const recipes = [];

  for (const [, json] of ldMatches) {
    try {
      const ld = JSON.parse(json);
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item['@type'] !== 'Recipe') continue;
        recipes.push({
          id: `nyt-${item.url?.split('/').pop() || Math.random().toString(36).slice(2)}`,
          name: item.name || 'NYT Recipe',
          source: 'NYT Cooking',
          image: item.image?.[0] || item.image || null,
          prepTime: parsePT(item.prepTime),
          cookTime: parsePT(item.cookTime),
          servings: parseInt(item.recipeYield) || 2,
          dietary: [],
          cuisine: 'international',
          season: 'all',
          overview: item.description || '',
          keywords: (item.keywords || '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 5),
          macros: {
            calories: parseInt(item.nutrition?.calories) || 0,
            protein: parseInt(item.nutrition?.proteinContent) || 0,
            carbs: parseInt(item.nutrition?.carbohydrateContent) || 0,
            fat: parseInt(item.nutrition?.fatContent) || 0,
          },
          steps: (item.recipeInstructions || []).map((s) =>
            typeof s === 'string' ? s : s.text || ''
          ),
          ingredients: (item.recipeIngredient || []).map((i) => ({ name: i, amount: '' })),
        });
      }
    } catch {
      // skip malformed JSON-LD
    }
  }

  return recipes;
}

function parsePT(pt) {
  if (!pt) return 0;
  const m = String(pt).match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? (parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0)) : 0;
}
