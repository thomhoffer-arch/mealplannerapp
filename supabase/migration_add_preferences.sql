-- Run this in Supabase SQL Editor after schema.sql

create table public.household_preferences (
  household_id     uuid primary key references public.households(id) on delete cascade,
  preferences_text text not null default '',
  updated_at       timestamptz default now()
);

alter table public.household_preferences enable row level security;

create policy "Members can read preferences"
  on public.household_preferences for select
  using (household_id = public.get_household_id(auth.uid()));

create policy "Members can upsert preferences"
  on public.household_preferences for insert
  with check (household_id = public.get_household_id(auth.uid()));

create policy "Members can update preferences"
  on public.household_preferences for update
  using (household_id = public.get_household_id(auth.uid()));
