-- Make create_household_for_user idempotent.
--
-- The server-side auth helper (api/_lib/auth.js) calls this RPC to self-heal
-- when an authenticated user has no household_members row. If two requests
-- race, the original implementation would create two distinct households.
-- This version short-circuits when the user is already a member somewhere
-- and returns that household_id instead.
--
-- A small race window remains between the SELECT and the INSERTs, but the
-- worst case is a single stray empty household, not a broken account.
create or replace function public.create_household_for_user(uid uuid)
returns uuid
language plpgsql security definer
as $$
declare
  hid uuid;
begin
  select household_id into hid
  from public.household_members
  where user_id = uid
  limit 1;

  if hid is not null then
    return hid;
  end if;

  insert into public.households (created_by)
  values (uid)
  returning id into hid;

  insert into public.household_members (household_id, user_id)
  values (hid, uid);

  return hid;
end;
$$;
