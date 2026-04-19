'use strict';

const { createClient } = require('@supabase/supabase-js');
const { getUserAndHousehold } = require('../_lib/auth');

// POST /api/dinner-invitations/respond
// Body: { token: string, action: 'accept' | 'decline' }
//
// Auth required — the responding user must be logged in. On accept we pin the
// invitation's guest_user_id to them so their own household plan and the host's
// plan can render the accepted state going forward. An already-accepted invite
// for a different user is rejected (that invite was already answered).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ctx = await getUserAndHousehold(req);
  if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

  const { token, action } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token' });
  if (action !== 'accept' && action !== 'decline') {
    return res.status(400).json({ error: "action must be 'accept' or 'decline'" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: invite } = await supabase
    .from('dinner_invitations')
    .select('id, status, guest_user_id, host_household_id')
    .eq('token', token)
    .single();

  if (!invite) return res.status(404).json({ error: 'Invitation not found' });
  if (invite.status === 'cancelled') {
    return res.status(410).json({ error: 'This invitation was cancelled' });
  }
  if (invite.guest_user_id && invite.guest_user_id !== ctx.user.id) {
    return res.status(409).json({ error: 'This invitation was already answered' });
  }
  if (invite.host_household_id === ctx.householdId) {
    return res.status(400).json({ error: "You can't RSVP to your own household's invite" });
  }

  const { error } = await supabase
    .from('dinner_invitations')
    .update({
      guest_user_id: ctx.user.id,
      status: action === 'accept' ? 'going' : 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: action === 'accept' ? 'going' : 'declined' });
};
