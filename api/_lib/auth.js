import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function pickRequestedHouseholdId(req) {
  return (
    req.headers?.['x-household-id'] ||
    req.body?.household_id ||
    req.query?.household_id ||
    null
  );
}

// Resolves the caller's identity and active household.
//
// Returns:
//   { ctx: { user, householdId, supabase, memberships } } on success
//   { error: { status, message, code?, memberships? } } on failure
//
// Household selection rules (in priority order):
//   1. X-Household-Id header / household_id in body / household_id in query
//      → must be one of the user's memberships, else 403.
//   2. User has exactly one membership → use it.
//   3. User has multiple memberships → 400 with code 'household_required'
//      (unless `allowAmbiguous` is set, in which case householdId is null).
//   4. User has zero memberships → self-heal by creating a personal household
//      via the idempotent create_household_for_user RPC.
export async function getUserAndHousehold(req, { allowAmbiguous = false } = {}) {
  const token = req.headers?.authorization?.replace('Bearer ', '').trim();
  if (!token) return { error: { status: 401, message: 'Unauthorized' } };

  const supabase = adminClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    if (userErr) console.error('[auth] getUser error:', userErr.message);
    return { error: { status: 401, message: 'Unauthorized' } };
  }
  const user = userData.user;

  const { data: rows, error: memberErr } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id);

  if (memberErr) {
    console.error('[auth] household_members query failed:', memberErr.message);
    const isPermissionDenied = /permission denied/i.test(memberErr.message || '');
    return {
      error: {
        status: 500,
        message: isPermissionDenied
          ? 'Database permission denied — run supabase/migration_add_service_role_grants.sql, or verify SUPABASE_SERVICE_ROLE_KEY is the service_role key (not anon)'
          : 'Could not load household memberships',
      },
    };
  }

  const memberships = [...new Set((rows || []).map((r) => r.household_id))];
  const requested = pickRequestedHouseholdId(req);

  if (requested) {
    if (!memberships.includes(requested)) {
      return { error: { status: 403, message: 'Not a member of the requested household' } };
    }
    return { ctx: { user, householdId: requested, supabase, memberships } };
  }

  if (memberships.length === 1) {
    return { ctx: { user, householdId: memberships[0], supabase, memberships } };
  }

  if (memberships.length > 1) {
    if (allowAmbiguous) {
      return { ctx: { user, householdId: null, supabase, memberships } };
    }
    return {
      error: {
        status: 400,
        message: 'household_id required (user belongs to multiple households)',
        code: 'household_required',
        memberships,
      },
    };
  }

  const { data: hid, error: rpcErr } = await supabase.rpc('create_household_for_user', { uid: user.id });
  if (rpcErr || !hid) {
    console.error('[auth] create_household_for_user failed:', rpcErr?.message);
    return { error: { status: 500, message: 'Could not create personal household' } };
  }
  return { ctx: { user, householdId: hid, supabase, memberships: [hid] } };
}

// Convenience wrapper for route handlers. Writes the error response itself
// and returns ctx-or-null so the call site stays a one-liner:
//
//   const ctx = await requireAuth(req, res);
//   if (!ctx) return;
export async function requireAuth(req, res, opts) {
  const result = await getUserAndHousehold(req, opts);
  if (result.error) {
    const { status, message, ...extras } = result.error;
    res.status(status).json({ error: message, ...extras });
    return null;
  }
  return result.ctx;
}
