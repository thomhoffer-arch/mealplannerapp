-- Household-scoped RLS for every table the app reads/writes.
-- Grants + PERMISSIVE policies for SELECT/INSERT/UPDATE/DELETE, scoped so a
-- user can only touch rows whose household_id they are a member of.
--
-- Idempotent — DROP POLICY IF EXISTS before each CREATE; GRANT is safe to
-- re-run; ENABLE ROW LEVEL SECURITY is no-op if already on.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'meal_plan_items',
    'custom_ingredients',
    'cooked_recipes',
    'shopping_checks',
    'household_preferences',
    'starred_recipes',
    'user_recipes',
    'pantry_items',
    'plan_templates',
    'survey_responses'
  ];
  check_clause text := 'household_id IN (SELECT household_id FROM public.household_members WHERE user_id = auth.uid())';
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.' || quote_ident(t) || ' TO authenticated';
    EXECUTE 'ALTER TABLE public.' || quote_ident(t) || ' ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "members read" ON public.' || quote_ident(t);
    EXECUTE 'CREATE POLICY "members read" ON public.' || quote_ident(t) ||
            ' FOR SELECT TO authenticated USING (' || check_clause || ')';

    EXECUTE 'DROP POLICY IF EXISTS "members insert" ON public.' || quote_ident(t);
    EXECUTE 'CREATE POLICY "members insert" ON public.' || quote_ident(t) ||
            ' FOR INSERT TO authenticated WITH CHECK (' || check_clause || ')';

    EXECUTE 'DROP POLICY IF EXISTS "members update" ON public.' || quote_ident(t);
    EXECUTE 'CREATE POLICY "members update" ON public.' || quote_ident(t) ||
            ' FOR UPDATE TO authenticated USING (' || check_clause ||
            ') WITH CHECK (' || check_clause || ')';

    EXECUTE 'DROP POLICY IF EXISTS "members delete" ON public.' || quote_ident(t);
    EXECUTE 'CREATE POLICY "members delete" ON public.' || quote_ident(t) ||
            ' FOR DELETE TO authenticated USING (' || check_clause || ')';
  END LOOP;
END $$;
