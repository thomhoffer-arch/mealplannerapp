import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../_lib/auth.js';
import { applyCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (req.method === 'GET') {
    const [sentRes, recvRes] = await Promise.all([
      supabase
        .from('dinner_invitations')
        .select('token, meal_plan_item_id, recipe_snapshot, dinner_date, dinner_time, location, host_note, guest_name, guest_user_id, status, created_at, responded_at')
        .eq('host_household_id', ctx.householdId)
        .order('dinner_date', { ascending: true }),
      supabase
        .from('dinner_invitations')
        .select('token, recipe_snapshot, dinner_date, dinner_time, location, host_note, host_household_id, status, responded_at')
        .eq('guest_user_id', ctx.user.id)
        .in('status', ['pending', 'going'])
        .order('dinner_date', { ascending: true }),
    ]);

    if (sentRes.error) return res.status(500).json({ error: sentRes.error.message });
    if (recvRes.error) return res.status(500).json({ error: recvRes.error.message });

    const hostIds = [...new Set((recvRes.data || []).map((r) => r.host_household_id))];
    let hostNames = {};
    if (hostIds.length) {
      const { data: hs } = await supabase.from('households').select('id, name').in('id', hostIds);
      hostNames = Object.fromEntries((hs || []).map((h) => [h.id, h.name]));
    }

    const received = (recvRes.data || []).map((r) => ({
      token: r.token,
      dish: r.recipe_snapshot?.name,
      dinner_date: r.dinner_date,
      dinner_time: r.dinner_time,
      location: r.location,
      host_note: r.host_note,
      host_name: hostNames[r.host_household_id] || 'your host',
      status: r.status,
      responded_at: r.responded_at,
    }));

    return res.json({ sent: sentRes.data || [], received });
  }

  if (req.method === 'POST') {
    const {
      meal_plan_item_id = null,
      recipe_snapshot,
      dinner_date,
      dinner_time = null,
      location = 'ours',
      host_note = null,
      guest_name = null,
    } = req.body || {};

    if (!recipe_snapshot?.name) return res.status(400).json({ error: 'recipe_snapshot with a name is required' });
    if (!dinner_date || !/^\d{4}-\d{2}-\d{2}$/.test(dinner_date)) return res.status(400).json({ error: 'dinner_date must be YYYY-MM-DD' });
    if (dinner_time && !/^\d{2}:\d{2}(:\d{2})?$/.test(dinner_time)) return res.status(400).json({ error: 'dinner_time must be HH:MM' });

    const { data, error } = await supabase
      .from('dinner_invitations')
      .insert({
        host_household_id: ctx.householdId,
        host_user_id: ctx.user.id,
        meal_plan_item_id,
        recipe_snapshot,
        dinner_date,
        dinner_time,
        location: (location || 'ours').slice(0, 80),
        host_note: host_note ? String(host_note).slice(0, 500) : null,
        guest_name: guest_name ? String(guest_name).slice(0, 80) : null,
      })
      .select('token')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const origin = req.headers.origin || `https://${req.headers.host}`;
    return res.json({ token: data.token, shareUrl: `${origin}/?dinner_invite=${data.token}` });
  }

  return res.status(405).end();
}
