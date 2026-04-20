-- Grant table privileges to the service_role (the role used by server-side
-- code with SUPABASE_SERVICE_ROLE_KEY). In a healthy Supabase project the
-- service_role has BYPASSRLS and full privileges by default, but if the
-- tables were created in a way that didn't pick up those defaults — e.g.
-- through a raw SQL migration without the right ownership — you can end
-- up with "permission denied for table X" errors from server handlers,
-- which is what we were seeing on requireAuth's household_members read.
--
-- Idempotent: GRANT is safe to re-run.
--
-- IF YOU STILL GET "permission denied" AFTER RUNNING THIS:
-- The most likely cause is that SUPABASE_SERVICE_ROLE_KEY on Vercel is
-- actually the ANON key, not the service_role key. Verify in Supabase:
--   Project → Settings → API → "service_role" key (not "anon" key).

-- Core auth-related
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.households          TO service_role;

-- Household-scoped data
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_preferences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plan_items       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_ingredients    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cooked_recipes        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_checks       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.starred_recipes       TO service_role;

-- Optional / feature tables (guarded with IF EXISTS-like patterns via DO blocks
-- so this migration doesn't fail on environments that haven't run every
-- feature migration yet).
DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pantry_items';
  IF FOUND THEN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.pantry_items TO service_role'; END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_recipes';
  IF FOUND THEN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_recipes TO service_role'; END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scraped_recipes';
  IF FOUND THEN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.scraped_recipes TO service_role'; END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_usage';
  IF FOUND THEN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage TO service_role'; END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dinner_invitations';
  IF FOUND THEN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.dinner_invitations TO service_role'; END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recipe_shares';
  IF FOUND THEN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_shares TO service_role'; END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deleted_accounts';
  IF FOUND THEN EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.deleted_accounts TO service_role'; END IF;
END $$;

-- Default for any future tables: give service_role full access automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
