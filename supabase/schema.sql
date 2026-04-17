-- ─── Enable pgcrypto for gen_random_bytes ────────────────────────────────────
create extension if not exists pgcrypto;

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table public.households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Our Kitchen',
  invite_token text unique not null default encode(gen_random_bytes(16), 'hex'),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now()
);

create table public.household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  joined_at    timestamptz default now(),
  unique(household_id, user_id)
);

create table public.meal_plan_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id    text not null,
  recipe_data  jsonb not null,
  added_at     timestamptz default now()
);

create table public.custom_ingredients (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id    text not null,
  name         text not null,
  amount       text not null default '',
  added_at     timestamptz default now()
);

create table public.cooked_recipes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id    text not null,
  unique(household_id, recipe_id)
);

create table public.shopping_checks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_name    text not null,
  unique(household_id, item_name)
);

-- Stores scraped weekly menus from HelloFresh / Marley Spoon / NYT
create table public.scraped_recipes (
  id         text primary key,
  source     text not null,
  data       jsonb not null,
  scraped_at timestamptz default now()
);

-- ─── Helper function ──────────────────────────────────────────────────────────

create or replace function public.get_household_id(uid uuid)
returns uuid
language sql security definer stable
as $$
  select household_id
  from public.household_members
  where user_id = uid
  limit 1;
$$;

-- ─── Create household + add creator as member (atomic) ───────────────────────

create or replace function public.create_household_for_user(uid uuid)
returns uuid
language plpgsql security definer
as $$
declare
  hid uuid;
begin
  insert into public.households (created_by)
  values (uid)
  returning id into hid;

  insert into public.household_members (household_id, user_id)
  values (hid, uid);

  return hid;
end;
$$;

-- ─── Join an existing household by invite token ───────────────────────────────

create or replace function public.join_household_by_token(p_token text, p_user_id uuid)
returns uuid
language plpgsql security definer
as $$
declare
  hid uuid;
begin
  select id into hid
  from public.households
  where invite_token = p_token;

  if hid is null then
    raise exception 'Invalid invite token';
  end if;

  insert into public.household_members (household_id, user_id)
  values (hid, p_user_id)
  on conflict (household_id, user_id) do nothing;

  return hid;
end;
$$;

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table public.households          enable row level security;
alter table public.household_members   enable row level security;
alter table public.meal_plan_items     enable row level security;
alter table public.custom_ingredients  enable row level security;
alter table public.cooked_recipes      enable row level security;
alter table public.shopping_checks     enable row level security;
alter table public.scraped_recipes     enable row level security;

-- households: readable/writable by members
create policy "Members can read their household"
  on public.households for select
  using (id = public.get_household_id(auth.uid()));

create policy "Members can update their household"
  on public.households for update
  using (id = public.get_household_id(auth.uid()));

-- household_members: readable by members of the same household
create policy "Members can read household members"
  on public.household_members for select
  using (household_id = public.get_household_id(auth.uid()));

-- meal_plan_items
create policy "Household members can read meal plan"
  on public.meal_plan_items for select
  using (household_id = public.get_household_id(auth.uid()));

create policy "Household members can insert meal plan"
  on public.meal_plan_items for insert
  with check (household_id = public.get_household_id(auth.uid()));

create policy "Household members can delete meal plan"
  on public.meal_plan_items for delete
  using (household_id = public.get_household_id(auth.uid()));

-- custom_ingredients
create policy "Household members can read custom ingredients"
  on public.custom_ingredients for select
  using (household_id = public.get_household_id(auth.uid()));

create policy "Household members can insert custom ingredients"
  on public.custom_ingredients for insert
  with check (household_id = public.get_household_id(auth.uid()));

create policy "Household members can delete custom ingredients"
  on public.custom_ingredients for delete
  using (household_id = public.get_household_id(auth.uid()));

-- cooked_recipes
create policy "Household members can read cooked recipes"
  on public.cooked_recipes for select
  using (household_id = public.get_household_id(auth.uid()));

create policy "Household members can insert cooked recipes"
  on public.cooked_recipes for insert
  with check (household_id = public.get_household_id(auth.uid()));

create policy "Household members can delete cooked recipes"
  on public.cooked_recipes for delete
  using (household_id = public.get_household_id(auth.uid()));

-- shopping_checks
create policy "Household members can read shopping checks"
  on public.shopping_checks for select
  using (household_id = public.get_household_id(auth.uid()));

create policy "Household members can insert shopping checks"
  on public.shopping_checks for insert
  with check (household_id = public.get_household_id(auth.uid()));

create policy "Household members can delete shopping checks"
  on public.shopping_checks for delete
  using (household_id = public.get_household_id(auth.uid()));

-- scraped_recipes: readable by all authenticated users, writable by service role only
create policy "Authenticated users can read scraped recipes"
  on public.scraped_recipes for select
  using (auth.role() = 'authenticated');

-- ─── Realtime ─────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.meal_plan_items;
alter publication supabase_realtime add table public.custom_ingredients;
alter publication supabase_realtime add table public.cooked_recipes;
alter publication supabase_realtime add table public.shopping_checks;
