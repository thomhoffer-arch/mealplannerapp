-- Track which household member last toggled meal prep mode on
ALTER TABLE household_preferences
  ADD COLUMN IF NOT EXISTS meal_prep_set_by_name text;
