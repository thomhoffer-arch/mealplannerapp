alter table public.household_preferences
  add column if not exists diet_variety text not null default 'balanced'
    check (diet_variety in ('familiar', 'balanced', 'adventurous'));
