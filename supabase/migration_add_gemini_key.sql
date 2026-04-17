-- Run in Supabase SQL Editor after migration_add_preferences.sql

alter table public.household_preferences
  add column if not exists gemini_api_key_encrypted text,
  add column if not exists gemini_api_key_hint      text;
