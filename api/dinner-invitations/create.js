'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');

// POST /api/dinner-invitations/create
// Body: {
//   meal_plan_item_id?: uuid,     // optional — pin invite to a plan item
//   recipe_snapshot:    object,   // required — the dish as it was at invite time
//   dinner_date:        "YYYY-MM-DD",
//   dinner_time?:       "HH:MM",
//   location?:          "ours" | "Vera's" | free text,
//   host_note?:         string,
//   guest_name?:        string,   // what the host typed for the guest
// }
// Returns: { token, shareUrl }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await getUserAndHousehold(req);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

  const {
    meal_plan_item_id = null,
    recipe_snapshot,
    dinner_date,
    dinner_time = null,
    location = 'ours',
    host_note = null,
    guest_name = null,
  } = req.body || {};

  if (!recipe_snapshot || !recipe_snapshot.name) {
    return res.status(400).json({ error: 'recipe_snapshot with a name is required' });
  }
  if (!dinner_date || !/^\d{4}-\d{2}-\d{2}$/.test(dinner_date)) {
    return res.status(400).json({ error: 'dinner_date must be YYYY-MM-DD' });
  }
  if (dinner_time && !/^\d{2}:\d{2}(:\d{2})?$/.test(dinner_time)) {
    return res.status(400).json({ error: 'dinner_time must be HH:MM' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

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

  // Origin comes from the request so dev/prod both work.
  const origin = req.headers.origin || `https://${req.headers.host}`;
  const shareUrl = `${origin}/?dinner_invite=${data.token}`;

  res.json({ token: data.token, shareUrl });
};
