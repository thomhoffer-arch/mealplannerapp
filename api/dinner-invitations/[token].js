'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');

// GET  /api/dinner-invitations/:token   — public; returns the guest-facing view
// DELETE /api/dinner-invitations/:token  — host-only; cancels the invitation
//
// The public read intentionally omits host_user_id / host_household_id /
// meal_plan_item_id so the invite link carries nothing that identifies the
// host's account beyond their household's display name.
module.exports = async function handler(req, res) {
  const token = (req.query?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('dinner_invitations')
      .select('token, recipe_snapshot, dinner_date, dinner_time, location, host_note, guest_name, status, host_household_id, responded_at')
      .eq('token', token)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Invitation not found' });

    const { data: household } = await supabase
      .from('households')
      .select('name')
      .eq('id', data.host_household_id)
      .single();

    return res.json({
      token: data.token,
      dish: {
        name: data.recipe_snapshot?.name,
        overview: data.recipe_snapshot?.overview || null,
        cuisine: data.recipe_snapshot?.cuisine || null,
        prepTime: data.recipe_snapshot?.prepTime || null,
        cookTime: data.recipe_snapshot?.cookTime || null,
      },
      dinner_date: data.dinner_date,
      dinner_time: data.dinner_time,
      location: data.location,
      host_note: data.host_note,
      host_name: household?.name || 'your host',
      guest_name: data.guest_name,
      status: data.status,
      responded_at: data.responded_at,
    });
  }

  if (req.method === 'DELETE') {
    const ctx = await getUserAndHousehold(req);
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

    const { data: inv } = await supabase
      .from('dinner_invitations')
      .select('host_household_id')
      .eq('token', token)
      .single();

    if (!inv) return res.status(404).json({ error: 'Invitation not found' });
    if (inv.host_household_id !== ctx.householdId) {
      return res.status(403).json({ error: 'Only the host can cancel' });
    }

    const { error } = await supabase
      .from('dinner_invitations')
      .update({ status: 'cancelled' })
      .eq('token', token);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ cancelled: true });
  }

  return res.status(405).end();
};
