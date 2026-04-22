-- Per-user macro tracking toggle and daily targets.
-- Stored on household_members so each user has independent settings
-- across any household they belong to.
ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS macro_tracking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS macro_target_calories   integer,
  ADD COLUMN IF NOT EXISTS macro_target_protein    integer,
  ADD COLUMN IF NOT EXISTS macro_target_carbs      integer,
  ADD COLUMN IF NOT EXISTS macro_target_fat        integer;
