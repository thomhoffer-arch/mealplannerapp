alter table household_preferences
  add column if not exists country text default null;
