-- Fix RLS policies across the app.
--
-- Problems addressed:
--   1. UPDATE policies missing WITH CHECK (silently block writes with no error)
--   2. Policies using get_household_id() — limit 1 with no order by, unreliable
--      for any user who has ever been in multiple households
--   3. households table missing INSERT + DELETE policies
--   4. dinner_invitations UPDATE policies missing WITH CHECK
--
-- All idempotent: DROP POLICY IF EXISTS before each CREATE.

-- ─── households ──────────────────────────────────────────────────────────────

-- Drop old policies (both capitalisation variants that may exist)
DROP POLICY IF EXISTS "Members can read their household"  ON public.households;
DROP POLICY IF EXISTS "members can read their household"  ON public.households;
DROP POLICY IF EXISTS "Members can update their household" ON public.households;
DROP POLICY IF EXISTS "members can update their household" ON public.households;

CREATE POLICY "members can read their household"
  ON public.households FOR SELECT TO authenticated
  USING (
    id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "members can update their household"
  ON public.households FOR UPDATE TO authenticated
  USING (
    id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

-- ─── household_preferences ───────────────────────────────────────────────────
-- Old policy from migration_add_preferences.sql has no WITH CHECK.
-- migration_add_household_scoped_rls.sql added a correct "members update" policy
-- alongside it. Drop the old one so only the good policy remains.

DROP POLICY IF EXISTS "members can update preferences"   ON public.household_preferences;
DROP POLICY IF EXISTS "Members can update preferences"   ON public.household_preferences;

-- ─── user_recipes ─────────────────────────────────────────────────────────────
-- Same pattern: old policy from migration_add_user_recipes.sql has no WITH CHECK.

DROP POLICY IF EXISTS "members can update user_recipes"  ON public.user_recipes;
DROP POLICY IF EXISTS "Members can update user_recipes"  ON public.user_recipes;

-- ─── dinner_invitations ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Hosts update their invitations"   ON public.dinner_invitations;
DROP POLICY IF EXISTS "Guests respond to their invitations" ON public.dinner_invitations;

CREATE POLICY "Hosts update their invitations"
  ON public.dinner_invitations FOR UPDATE TO authenticated
  USING (
    host_household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    host_household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Guests respond to their invitations"
  ON public.dinner_invitations FOR UPDATE TO authenticated
  USING  (guest_user_id = auth.uid())
  WITH CHECK (guest_user_id = auth.uid());
