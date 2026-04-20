import { createClient } from '@supabase/supabase-js';
import handleSearch from '../_lib/recipes-handlers/search.js';
import handleImport from '../_lib/recipes-handlers/import.js';
import { requireAuth } from '../_lib/auth.js';

// Consolidated recipes endpoint. Routed by method + query/body shape:
//   GET  /api/recipes?share=TOKEN         → view a public recipe share
//   GET  /api/recipes?q=…&dietary=…        → search Spoonacular + HelloFresh
//   POST /api/recipes  body { action: 'share', recipe }  → create share link
//   POST /api/recipes  body { url }        → scrape a URL via Gemini
//
// Keeps us under the Hobby 12-function cap. GET /api/recipes/:id lives in
// [id].js because it needs the path param.
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.query.share) return await viewShare(req, res);
      return await handleSearch(req, res);
    }
    if (req.method === 'POST') {
      if (req.body?.action === 'share') return await createShare(req, res);
      return await handleImport(req, res);
    }
    return res.status(405).end();
  } catch (err) {
    console.error('[recipes] unhandled:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}

async function createShare(req, res) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { recipe, expires_in_days } = req.body || {};
  if (!recipe?.name) return res.status(400).json({ error: 'recipe.name is required' });

  const expiresAt = expires_in_days
    ? new Date(Date.now() + Number(expires_in_days) * 86400_000).toISOString()
    : null;

  const { data, error } = await ctx.supabase
    .from('recipe_shares')
    .insert({
      household_id: ctx.householdId,
      created_by: ctx.user.id,
      recipe_data: recipe,
      expires_at: expiresAt,
    })
    .select('token')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const origin = req.headers.origin || `https://${req.headers.host}`;
  return res.json({ token: data.token, shareUrl: `${origin}/?recipe_share=${data.token}` });
}

async function viewShare(req, res) {
  const token = String(req.query.share || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing share token' });

  // Public read — no auth required. Service-role client so we can bypass RLS.
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('recipe_shares')
    .select('token, recipe_data, expires_at, view_count')
    .eq('token', token)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Share not found' });
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This share link has expired' });
  }

  // Best-effort view counter — don't block on it.
  supabase.from('recipe_shares').update({ view_count: (data.view_count || 0) + 1 }).eq('token', token)
    .then(() => {}, (e) => console.warn('[recipes/share] view_count update failed:', e?.message));

  return res.json({ recipe: data.recipe_data });
}
