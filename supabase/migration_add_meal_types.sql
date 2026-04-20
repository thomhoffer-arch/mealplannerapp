alter table public.household_preferences
  add column if not exists plan_extras_text text;
