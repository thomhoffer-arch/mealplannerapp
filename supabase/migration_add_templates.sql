-- Run in Supabase SQL Editor after migration_add_pantry.sql

create table public.plan_templates (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  name         text        not null,
  recipes      jsonb       not null default '[]',
  created_at   timestamptz default now()
);

alter table public.plan_templates enable row level security;

create policy "Members can read templates"
  on public.plan_templates for select
  using (household_id = public.get_household_id(auth.uid()));

create policy "Members can insert templates"
  on public.plan_templates for insert
  with check (household_id = public.get_household_id(auth.uid()));

create policy "Members can delete templates"
  on public.plan_templates for delete
  using (household_id = public.get_household_id(auth.uid()));
