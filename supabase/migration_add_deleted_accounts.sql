-- Soft-delete ledger. When a user hits "delete account", we:
--   1. Remove them from all household_members rows (cascading any
--      household they were the last member of).
--   2. Ban their auth.users row via the Admin API (banned_until).
--   3. Record a row here with the scheduled hard-purge date.
--
-- The hard-purge itself isn't wired up yet — a future cron job should
-- read this table, find rows where purge_at < now(), and call
-- supabase.auth.admin.deleteUser() for each. Leaving it unbanned-after-
-- purge_at means an unclaimed account can also sign back in and start
-- fresh after the grace period, which is a reasonable "soft" behaviour.

create table public.deleted_accounts (
  user_id     uuid primary key,
  deleted_at  timestamptz not null default now(),
  purge_at    timestamptz not null,
  reason      text
);

alter table public.deleted_accounts enable row level security;

-- No client policies — only the service role touches this table.
