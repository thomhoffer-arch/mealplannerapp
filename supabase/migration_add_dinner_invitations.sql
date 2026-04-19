-- Dinner invitations: a host invites someone to a specific dinner on a specific
-- date/time. The guest views a public page by token. If the guest is already a
-- user in the app and accepts, their own household plan surfaces an "eating out"
-- entry that drops the items they would've otherwise shopped for, and the host's
-- plan shows a "+Name" guest chip on that meal.
--
-- Schema intent:
--   • A token is always unique; the public page keys off it.
--   • recipe_snapshot is stored as-is so cancellations or edits on the host's
--     side don't alter what the guest was invited to.
--   • dinner_date + dinner_time together define "when" — intentionally
--     separate so future edits to either are cheap.
--   • guest_user_id is populated only after a logged-in user accepts.
--   • RLS lets hosts manage their own invites and guests read ones addressed
--     to them. Public read-by-token is handled server-side in the API.

create table public.dinner_invitations (
  id                  uuid primary key default gen_random_uuid(),
  token               text unique not null default encode(gen_random_bytes(16), 'hex'),

  -- Host side
  host_household_id   uuid not null references public.households(id) on delete cascade,
  host_user_id        uuid not null references auth.users(id) on delete cascade,
  meal_plan_item_id   uuid references public.meal_plan_items(id) on delete set null,
  recipe_snapshot     jsonb not null,

  -- When and where
  dinner_date         date not null,
  dinner_time         time,                                  -- 19:30, nullable for "tbd"
  location            text default 'ours',                   -- "ours", "Vera's", free text
  host_note           text,

  -- Guest side
  guest_name          text,                                  -- what the host typed
  guest_user_id       uuid references auth.users(id) on delete set null,
  status              text not null default 'pending'
                        check (status in ('pending','going','declined','cancelled')),

  created_at          timestamptz default now(),
  responded_at        timestamptz
);

create index dinner_invitations_host_idx    on public.dinner_invitations(host_household_id, dinner_date);
create index dinner_invitations_guest_idx   on public.dinner_invitations(guest_user_id, dinner_date);
create index dinner_invitations_token_idx   on public.dinner_invitations(token);

alter table public.dinner_invitations enable row level security;

-- Hosts: full control over their household's invitations
create policy "Hosts read their invitations"
  on public.dinner_invitations for select
  using (host_household_id = public.get_household_id(auth.uid()));

create policy "Hosts create their invitations"
  on public.dinner_invitations for insert
  with check (host_household_id = public.get_household_id(auth.uid()));

create policy "Hosts update their invitations"
  on public.dinner_invitations for update
  using (host_household_id = public.get_household_id(auth.uid()));

create policy "Hosts delete their invitations"
  on public.dinner_invitations for delete
  using (host_household_id = public.get_household_id(auth.uid()));

-- Guests: once matched via guest_user_id, read + update their own row
create policy "Guests read their invitations"
  on public.dinner_invitations for select
  using (guest_user_id = auth.uid());

create policy "Guests respond to their invitations"
  on public.dinner_invitations for update
  using (guest_user_id = auth.uid());

-- Realtime so both sides see status changes as they happen
alter publication supabase_realtime add table public.dinner_invitations;
