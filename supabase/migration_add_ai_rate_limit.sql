-- AI request rate limiting table.
-- Tracks per-household call counts in short time windows to prevent burst abuse.
--
-- window_key format: "{window_seconds}_{epoch_bucket_integer}"
-- e.g. "5_342739200" = the 5-second bucket starting at Unix time 1713696000
--
-- Records accumulate but stay small — a household hitting the burst limit leaves
-- ~3 rows (one per window size). A cron job or manual DELETE can prune rows older
-- than an hour; they serve no purpose once the window has expired.

create table if not exists public.ai_rate_limit (
  household_id uuid        not null references public.households(id) on delete cascade,
  window_key   text        not null,
  call_count   integer     not null default 0,
  created_at   timestamptz not null default now(),
  primary key (household_id, window_key)
);

alter table public.ai_rate_limit enable row level security;

-- Only server-side service_role code touches this table; no user-facing policy needed.
grant select, insert, update, delete on public.ai_rate_limit to service_role;

-- Atomically increments the call count for a (household, window) pair and returns
-- the new count. Uses INSERT ON CONFLICT UPDATE so the increment is a single
-- round-trip with no read-then-write race condition.
create or replace function public.increment_ai_rate_limit(
  p_household_id uuid,
  p_window_key   text
)
returns integer
language plpgsql
security definer
as $$
declare
  new_count integer;
begin
  insert into public.ai_rate_limit (household_id, window_key, call_count)
  values (p_household_id, p_window_key, 1)
  on conflict (household_id, window_key)
  do update set call_count = ai_rate_limit.call_count + 1
  returning call_count into new_count;
  return new_count;
end;
$$;

grant execute on function public.increment_ai_rate_limit(uuid, text) to service_role;

-- Optional cleanup: delete expired windows (safe to run any time).
-- DELETE FROM public.ai_rate_limit WHERE created_at < now() - interval '2 hours';
