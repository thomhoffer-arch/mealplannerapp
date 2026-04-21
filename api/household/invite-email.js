import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../_lib/auth.js';

export default async function handleInviteEmail(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body || {};
  if (!email?.trim()) return res.status(400).json({ error: 'email is required' });

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('invite_token')
    .eq('id', ctx.householdId)
    .single();

  if (householdError || !household) {
    return res.status(404).json({ error: 'Household not found' });
  }

  const origin = req.headers.origin || process.env.SITE_URL || '';
  const redirectTo = `${origin}?invite=${household.invite_token}`;

  const { error } = await supabase.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
    redirectTo,
  });

  if (error) return res.status(400).json({ error: error.message });

  return res.json({ ok: true });
}
