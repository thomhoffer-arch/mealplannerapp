alter table public.household_preferences
  add column if not exists measurement_system text not null default 'metric'
    check (measurement_system in ('metric', 'imperial'));
