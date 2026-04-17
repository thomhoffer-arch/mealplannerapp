-- Run in Supabase SQL Editor after migration_add_ai_usage.sql

alter table public.cooked_recipes
  add column if not exists rating smallint check (rating between 1 and 5);
