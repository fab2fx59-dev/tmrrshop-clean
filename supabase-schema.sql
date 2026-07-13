-- TMRR Shop - Supabase schema
-- A coller dans Supabase > SQL Editor > New query, puis Run.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  full_name text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  order_number text not null unique,
  customer_email text not null,
  status text not null default 'pending',
  total_amount numeric(10, 2) not null default 0,
  currency text not null default 'EUR',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  admin_notes text,
  tracking_number text,
  shipped_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_name text not null,
  product_category text,
  variant_model text,
  variant_size text,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null default 0,
  contest_entries integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.contest_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  entries_count integer not null default 1,
  source text not null default 'purchase',
  created_at timestamptz not null default now()
);

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  buyer_user_id uuid references auth.users(id) on delete set null,
  buyer_email text,
  recipient_email text,
  recipient_name text,
  amount numeric(10, 2) not null,
  message text,
  delivery_date date,
  status text not null default 'pending',
  code text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.contest_entries enable row level security;
alter table public.gift_cards enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can read their own orders"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "Users can read items from their own orders"
  on public.order_items for select
  using (
    exists (
      select 1
      from public.orders
      where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
    )
  );

create policy "Users can read their own contest entries"
  on public.contest_entries for select
  using (auth.uid() = user_id);

create policy "Users can read their own gift cards"
  on public.gift_cards for select
  using (auth.uid() = buyer_user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, full_name, phone, address)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'address', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
