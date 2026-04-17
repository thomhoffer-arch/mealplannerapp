-- Run in Supabase SQL Editor after migration_add_rating.sql

create table public.pantry_items (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  name         text        not null,
  amount       text        not null default '',
  added_at     timestamptz default now()
);

alter table public.pantry_items enable row level security;

create policy "Members can read pantry"
  on public.pantry_items for select
  using (household_id = public.get_household_id(auth.uid()));

create policy "Members can insert pantry"
  on public.pantry_items for insert
  with check (household_id = public.get_household_id(auth.uid()));

create policy "Members can delete pantry"
  on public.pantry_items for delete
  using (household_id = public.get_household_id(auth.uid()));

alter publication supabase_realtime add table public.pantry_items;
