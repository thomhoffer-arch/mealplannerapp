-- Public recipe share links. Each row snapshots the recipe at share time
-- (so edits to the source don't rewrite the public view) and is keyed by
-- a random token embedded in the URL.

create extension if not exists pgcrypto;

create table public.recipe_shares (
  token        text primary key default encode(gen_random_bytes(12), 'hex'),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  recipe_data  jsonb not null,
  view_count   int  not null default 0,
  created_at   timestamptz default now(),
  expires_at   timestamptz
);

create index recipe_shares_household_idx on public.recipe_shares (household_id);

alter table public.recipe_shares enable row level security;

-- No client-side RLS policies — all access goes through the API (the
-- service-role key bypasses RLS). Views happen with a public token and
-- get no JWT, so client-direct reads via supabase-js shouldn't work.
