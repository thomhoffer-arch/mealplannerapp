-- Supabase revokes public execute on functions by default.
-- Without these grants, authenticated users get a 403 when calling
-- create_household_for_user or join_household_by_token via the REST API.

grant execute on function public.create_household_for_user(uuid)        to authenticated;
grant execute on function public.join_household_by_token(text, uuid)    to authenticated;

-- get_household_id is called internally by RLS policies (no direct API call
-- needed), but grant it anyway in case it's used from client code.
grant execute on function public.get_household_id(uuid)                 to authenticated;
