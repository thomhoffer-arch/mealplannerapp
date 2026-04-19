'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');

// GET /api/dinner-invitations/list
// Returns all invitations relevant to the logged-in household, split into
//   sent     — invitations this household is hosting
//   received — invitations the logged-in user has accepted (guest_user_id)
// The shopping list and week plan both filter off `received` to drop items
// on nights the user is eating elsewhere.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const ctx = await getUserAndHousehold(req);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

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

  // Look up the host household names for received invites so the UI can show
  // "at The Verelys'" instead of a uuid.
  const hostIds = [...new Set((recvRes.data || []).map((r) => r.host_household_id))];
  let hostNames = {};
  if (hostIds.length) {
    const { data: hs } = await supabase
      .from('households')
      .select('id, name')
      .in('id', hostIds);
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

  res.json({ sent: sentRes.data || [], received });
};
