-- Supabase sometimes ships tables without the default table-level grants
-- to the `authenticated` role. When that happens, authenticated users get
-- 403 on every read/write *even with correct RLS policies*, because Postgres
-- denies at the GRANT layer before RLS is ever consulted.
--
-- Idempotent: GRANT is safe to re-run; it doesn't error on already-granted.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.households         TO authenticated;
