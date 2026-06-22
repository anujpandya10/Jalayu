-- ── Migration 032: Academy watchlist ─────────────────────────────────────────
create table if not exists academy_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  symbol text not null,
  name text,
  created_at timestamptz default now(),
  unique(user_id, symbol)
);

alter table academy_watchlist enable row level security;
create policy "own academy watchlist" on academy_watchlist for all using (auth.uid() = user_id);
