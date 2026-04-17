'use strict';

const { createClient } = require('@supabase/supabase-js');
const { normalizeHelloFresh } = require('../_lib/normalize');

// Runs nightly at 3 AM UTC (configured in vercel.json).
// On Vercel Hobby (10s limit): only uses the HelloFresh API (fast, ~1-2s).
// On Vercel Pro (60s limit): can also scrape Marley Spoon and NYT if credentials are set.
module.exports = async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const recipes = [];
  let hfCount = 0;

  // ── HelloFresh (API-based, fast) ────────────────────────────────────────────
  try {
    const hfRecipes = await scrapeHelloFresh();
    recipes.push(...hfRecipes);
    hfCount = hfRecipes.length;
  } catch (err) {
    console.error('HelloFresh scrape failed:', err.message);
  }

  // ── Upsert into Supabase ────────────────────────────────────────────────────
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

  res.json({ ok: true, hellofresh: hfCount, total: recipes.length });
};

async function scrapeHelloFresh() {
  const clientId = process.env.HELLOFRESH_CLIENT_ID || 'hellofresh-dev-test';
  const clientSecret = process.env.HELLOFRESH_CLIENT_SECRET;
  if (!clientSecret) return [];

  // Get token
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

  // Fetch this week's recipes
  const params = new URLSearchParams({
    country: 'nl',
    locale: 'nl-NL',
    limit: '20',
    order: '-date',
  });
  const recipesRes = await fetch(
    `https://gw.hellofresh.com/api/recipes/search?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!recipesRes.ok) return [];
  const data = await recipesRes.json();
  return (data.items || []).map(normalizeHelloFresh);
}
