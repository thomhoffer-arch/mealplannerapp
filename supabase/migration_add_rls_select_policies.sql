-- RLS SELECT policies for household_members and households.
-- Without these, authenticated users get 403 on every table read even though
-- the RPC functions (which run as SECURITY DEFINER) work fine.
--
-- Idempotent: DROP IF EXISTS before each CREATE so a partial earlier run
-- doesn't block re-running. Safe to execute multiple times.

-- household_members: each user may only see their own membership rows.
DROP POLICY IF EXISTS "users can read own memberships" ON public.household_members;
CREATE POLICY "users can read own memberships"
  ON public.household_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- household_members: users may insert their own membership (needed for join_household_by_token).
DROP POLICY IF EXISTS "users can insert own memberships" ON public.household_members;
CREATE POLICY "users can insert own memberships"
  ON public.household_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- households: a user may read a household if they are listed as a member.
DROP POLICY IF EXISTS "members can read their household" ON public.households;
CREATE POLICY "members can read their household"
  ON public.households
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT household_id
      FROM public.household_members
      WHERE user_id = auth.uid()
    )
  );
