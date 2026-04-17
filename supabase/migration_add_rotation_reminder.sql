-- Run in Supabase SQL Editor after migration_add_user_recipes.sql

-- Recipe rotation priority on starred recipes
-- 1 = every week, 2 = every two weeks, 3 = occasional
alter table public.starred_recipes
  add column if not exists rotation_priority smallint not null default 2
    check (rotation_priority between 1 and 3);

-- Weekly planning reminder stored per household
alter table public.household_preferences
  add column if not exists reminder_enabled boolean not null default false,
  add column if not exists reminder_day     text check (
    reminder_day in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
  );
