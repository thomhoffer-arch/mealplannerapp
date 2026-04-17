-- Run in Supabase SQL Editor after migration_add_templates.sql
-- User-created recipes stored per household

create table public.user_recipes (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  name         text        not null,
  overview     text        not null default '',
  prep_time    int,
  cook_time    int,
  servings     int         not null default 2,
  ingredients  jsonb       not null default '[]',  -- [{ name, amount }]
  steps        jsonb       not null default '[]',  -- [string]
  created_at   timestamptz default now()
);

alter table public.user_recipes enable row level security;

create policy "Members can read user_recipes"
  on public.user_recipes for select
  using (household_id = public.get_household_id(auth.uid()));

create policy "Members can insert user_recipes"
  on public.user_recipes for insert
  with check (household_id = public.get_household_id(auth.uid()));

create policy "Members can update user_recipes"
  on public.user_recipes for update
  using (household_id = public.get_household_id(auth.uid()));

create policy "Members can delete user_recipes"
  on public.user_recipes for delete
  using (household_id = public.get_household_id(auth.uid()));

alter publication supabase_realtime add table public.user_recipes;
