-- TMRR Shop - permissions commandes et paiement
-- A coller dans Supabase > SQL Editor > New query, puis Run.

drop policy if exists "Users can create their own orders" on public.orders;
create policy "Users can create their own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own pending orders" on public.orders;
create policy "Users can update their own pending orders"
  on public.orders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can create items for their own orders" on public.order_items;
create policy "Users can create items for their own orders"
  on public.order_items for insert
  with check (
    exists (
      select 1
      from public.orders
      where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create their own contest entries" on public.contest_entries;
create policy "Users can create their own contest entries"
  on public.contest_entries for insert
  with check (auth.uid() = user_id);
