import { createClient } from '@supabase/supabase-js';

export async function getUserAndHousehold(req) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error) { console.error('[auth] getUser error:', error.message); return null; }
  if (!user) { console.error('[auth] getUser returned no user'); return null; }

  const { data: member, error: memberError } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single();

  if (memberError) console.error('[auth] household_members query error:', memberError.message);
  if (!member) return null;
  return { user, householdId: member.household_id, supabase };
}
