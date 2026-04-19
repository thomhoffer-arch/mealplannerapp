-- Run in Supabase SQL Editor after migration_add_gemini_key.sql
-- Stores an optional Puter auth token at the household level so one member
-- can enable pay-as-you-go AI (Claude, GPT, Gemini via Puter) for everyone.

alter table public.household_preferences
  add column if not exists puter_token_encrypted text,
  add column if not exists puter_token_hint      text;
