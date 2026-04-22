-- Move premium status from household-level to user-level.
--
-- Previously is_gifted lived on household_preferences (per household), which
-- meant anyone who joined a gifted household inherited premium status.
-- is_premium on household_members is per-user: joining a household as a new
-- member always starts free, regardless of the inviter's status.
--
-- BYOK keys (gemini_api_key_hint, puter_token_hint) remain on
-- household_preferences intentionally — when you connect your own API key
-- you're covering the AI cost for the whole household, which is the right
-- shared-kitchen model.

-- 1. Add per-user premium flag
alter table public.household_members
  add column if not exists is_premium boolean not null default false;

-- 2. Migrate: gift all current members of already-gifted households so
--    existing privileged users keep their access.
update public.household_members hm
set is_premium = true
from public.household_preferences hp
where hp.household_id = hm.household_id
  and hp.is_gifted = true;

-- 3. The old is_gifted column on household_preferences is now superseded.
--    It is kept in place (not dropped) to avoid breaking any existing tooling
--    that writes to it, but the application no longer reads it for premium
--    checks.
