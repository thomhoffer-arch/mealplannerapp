-- Run in Supabase SQL Editor after migration_add_starred.sql
-- Tracks daily AI calls per household for the shared server key

create table public.ai_usage (
  household_id uuid    not null references public.households(id) on delete cascade,
  usage_date   date    not null default current_date,
  call_count   integer not null default 0,
  primary key (household_id, usage_date)
);

alter table public.ai_usage enable row level security;

-- Households can only see their own usage
create policy "Members can read own ai_usage"
  on public.ai_usage for select
  using (household_id = public.get_household_id(auth.uid()));
