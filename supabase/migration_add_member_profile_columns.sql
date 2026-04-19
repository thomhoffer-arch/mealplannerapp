-- Per-user profile fields stored on the household_members row: each row
-- already has (user_id, household_id), so a user's prefs can differ per
-- kitchen (you vs. you-at-your-parents'). onboarded_at gates the
-- onboarding screen — null = hasn't completed it yet.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.household_members
  ADD COLUMN IF NOT EXISTS display_name   text,
  ADD COLUMN IF NOT EXISTS personal_prefs text,
  ADD COLUMN IF NOT EXISTS onboarded_at   timestamptz;
