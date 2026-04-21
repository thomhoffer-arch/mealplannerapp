alter table public.household_preferences
  add column if not exists meal_prep_mode boolean not null default false;
