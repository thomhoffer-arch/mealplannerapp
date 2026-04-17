-- Run in Supabase SQL Editor after migration_add_gemini_key.sql

create table public.starred_recipes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id    text not null,
  recipe_data  jsonb not null,
  starred_at   timestamptz default now(),
  unique(household_id, recipe_id)
);

alter table public.starred_recipes enable row level security;

create policy "Members can read starred recipes"
  on public.starred_recipes for select
  using (household_id = public.get_household_id(auth.uid()));

create policy "Members can insert starred recipes"
  on public.starred_recipes for insert
  with check (household_id = public.get_household_id(auth.uid()));

create policy "Members can delete starred recipes"
  on public.starred_recipes for delete
  using (household_id = public.get_household_id(auth.uid()));

alter publication supabase_realtime add table public.starred_recipes;
