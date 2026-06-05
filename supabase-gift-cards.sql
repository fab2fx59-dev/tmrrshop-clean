-- Cartes cadeaux TMRR
-- A coller dans Supabase > SQL Editor > New query, puis Run.

alter table public.gift_cards
  add column if not exists initial_amount numeric(10, 2),
  add column if not exists remaining_amount numeric(10, 2),
  add column if not exists used_at timestamptz,
  add column if not exists emailed_at timestamptz;

update public.gift_cards
set initial_amount = amount
where initial_amount is null;

update public.gift_cards
set remaining_amount = amount
where remaining_amount is null;

drop policy if exists "Users can create their own gift cards" on public.gift_cards;
create policy "Users can create their own gift cards"
  on public.gift_cards for insert
  with check (auth.uid() = buyer_user_id);

drop policy if exists "Users can update their own gift cards" on public.gift_cards;
create policy "Users can update their own gift cards"
  on public.gift_cards for update
  using (auth.uid() = buyer_user_id)
  with check (auth.uid() = buyer_user_id);
