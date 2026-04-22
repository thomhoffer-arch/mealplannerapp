-- Per-user language preference for AI-generated content.
-- Defaults to English; each member can override independently.
ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
