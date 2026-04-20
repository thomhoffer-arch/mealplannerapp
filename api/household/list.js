import { requireAuth } from '../_lib/auth.js';

// Returns every household this user belongs to, hydrated with display name.
// Designed for a future UI household-switcher. Uses allowAmbiguous so users
// with multiple memberships can call this endpoint without selecting one
// first (which would be a chicken-and-egg problem).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const ctx = await requireAuth(req, res, { allowAmbiguous: true });
  if (!ctx) return;

  if (ctx.memberships.length === 0) {
    return res.json({ households: [], active_id: null });
  }

  const { data, error } = await ctx.supabase
    .from('households')
    .select('id, name')
    .in('id', ctx.memberships);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ households: data || [], active_id: ctx.householdId });
}
