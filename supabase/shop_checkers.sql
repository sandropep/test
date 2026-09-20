-- Run once in the Supabase SQL editor.
-- Maps each shop to the one checker who "owns" it. Separate from `visits`
-- (which records who actually performed a given visit) and from `shops`/
-- `users` themselves, so it doesn't touch any existing query or RLS policy.
-- A shop with no row here is simply unassigned.

create table if not exists public.shop_checkers (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  checker_id uuid not null references public.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.shop_checkers enable row level security;

-- Admins can read/write everything.
drop policy if exists "shop_checkers_admin_all" on public.shop_checkers;
create policy "shop_checkers_admin_all"
  on public.shop_checkers
  for all
  to authenticated
  using (exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
  ))
  with check (exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
  ));

-- Checkers can read their own assignment rows (needed for the "remaining
-- shops" section on the checker home screen). Additive to the admin policy
-- above: Postgres OR's together permissive policies for the same command,
-- so this only grants read access to a checker's own rows; writes stay
-- admin-only.
drop policy if exists "shop_checkers_checker_read_own" on public.shop_checkers;
create policy "shop_checkers_checker_read_own"
  on public.shop_checkers
  for select
  to authenticated
  using (checker_id = auth.uid());
