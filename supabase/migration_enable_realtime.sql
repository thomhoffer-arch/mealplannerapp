-- Add tables to supabase_realtime publication, skipping any already added.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'meal_plan_items', 'custom_ingredients', 'cooked_recipes',
    'shopping_checks', 'starred_recipes', 'pantry_items',
    'user_recipes', 'household_members'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- already a member, skip
    END;
  END LOOP;
END $$;
