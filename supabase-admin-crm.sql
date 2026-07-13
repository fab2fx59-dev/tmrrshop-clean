alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists address text;

alter table public.orders
  add column if not exists admin_notes text,
  add column if not exists tracking_number text,
  add column if not exists shipped_at timestamptz,
  add column if not exists archived_at timestamptz;

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
    first_name = coalesce(nullif(excluded.first_name, ''), public.profiles.first_name),
    last_name = coalesce(nullif(excluded.last_name, ''), public.profiles.last_name),
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
    address = coalesce(nullif(excluded.address, ''), public.profiles.address),
    updated_at = now();

  return new;
end;
$$;
