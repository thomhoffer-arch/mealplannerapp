-- Gifted full access: set is_gifted = true on any household in Supabase dashboard
-- to grant them unlimited AI + full recipe library without a Puter token.
alter table public.household_preferences
  add column if not exists is_gifted boolean not null default false;
