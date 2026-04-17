-- Run in Supabase SQL Editor after migration_add_ai_usage.sql

-- Track whether a household has seen the willingness-to-pay survey
alter table public.household_preferences
  add column if not exists survey_completed_at timestamptz;

-- Store survey responses for demand analysis
create table public.survey_responses (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  willing      text        not null,   -- 'yes' | 'maybe' | 'no'
  price_point  text,                   -- '€2' | '€5' | '€10' | '€15+'
  message      text,
  created_at   timestamptz default now()
);

alter table public.survey_responses enable row level security;

create policy "Members can insert own survey response"
  on public.survey_responses for insert
  with check (household_id = public.get_household_id(auth.uid()));
