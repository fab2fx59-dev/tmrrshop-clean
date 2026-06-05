-- TMRR Shop - fidélité, adresse client et codes promo
-- A coller dans Supabase > SQL Editor > New query, puis Run.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists address text;

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  discount_percent integer not null default 15,
  used_at timestamptz,
  stripe_checkout_session_id text,
  created_at timestamptz not null default now()
);

alter table public.promo_codes enable row level security;

drop policy if exists "Users can read their own promo codes" on public.promo_codes;
create policy "Users can read their own promo codes"
  on public.promo_codes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own promo codes" on public.promo_codes;
create policy "Users can create their own promo codes"
  on public.promo_codes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own promo codes" on public.promo_codes;
create policy "Users can update their own promo codes"
  on public.promo_codes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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
  on conflict (id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    full_name = excluded.full_name,
    phone = excluded.phone,
    address = excluded.address,
    updated_at = now();

  return new;
end;
$$;
