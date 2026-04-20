alter table public.household_preferences
  add column if not exists plan_meal_types jsonb not null default '{"lunch":false,"breakfast":false,"baking":false}'::jsonb;
