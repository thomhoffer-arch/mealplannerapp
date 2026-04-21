-- RLS UPDATE policy was missing on household_members. Without it, the
-- OnboardingScreen.handleContinue UPDATE to set display_name /
-- personal_prefs / onboarded_at silently returned 0 rows affected
-- (RLS blocked it), so the onboarding screen reappeared on every
-- refresh because onboarded_at never actually got written.
--
-- Authenticated users may update *only their own* membership row.
-- Service_role (server) bypasses RLS entirely and is unaffected.
--
-- Idempotent: DROP IF EXISTS before CREATE.

DROP POLICY IF EXISTS "users can update own memberships" ON public.household_members;
CREATE POLICY "users can update own memberships"
  ON public.household_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
