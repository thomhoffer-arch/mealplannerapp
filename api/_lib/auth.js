'use strict';

const { createClient } = require('@supabase/supabase-js');

// Verifies the Bearer JWT from the request and returns { user, householdId }.
// Returns null if the token is missing, invalid, or the user has no household.
async function getUserAndHousehold(req) {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return null;
  return { user, householdId: member.household_id, supabase };
}

module.exports = { getUserAndHousehold };
