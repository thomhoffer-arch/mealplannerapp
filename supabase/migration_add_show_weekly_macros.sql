-- Toggle for the weekly nutrition summary on the week planner view.
-- Default on for existing rows; users can turn it off in Settings.
alter table public.household_preferences
  add column if not exists show_weekly_macros boolean not null default true;
