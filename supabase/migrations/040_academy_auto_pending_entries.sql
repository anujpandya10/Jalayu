-- "Heads up" staging: instead of deciding-and-buying in the same tick with zero warning,
-- a qualifying setup gets announced here first (full plan: symbol, price, shares, setup)
-- and only executes ~60-90s later if it still qualifies on a fresh read. Lets a human
-- following along on another screen place the same hypothetical trade in real time.
create table if not exists public.academy_auto_pending_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  symbol text not null,
  name text,
  direction text not null,
  planned_shares numeric not null,
  planned_price numeric not null,
  setup_tag text,
  reason text,
  ema9 numeric, ema21 numeric, vwap numeric, rsi numeric,
  planned_at timestamptz not null default now()
);
alter table public.academy_auto_pending_entries enable row level security;
drop policy if exists "Users manage own pending entries" on public.academy_auto_pending_entries;
create policy "Users manage own pending entries" on public.academy_auto_pending_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.academy_auto_log drop constraint academy_auto_log_kind_check;
alter table public.academy_auto_log add constraint academy_auto_log_kind_check
  check (kind = any (array['ENTRY','TAKE_HALF','EXIT_FULL','STOP_HIT','STOP_MOVED','SCAN','INFO','ERROR','PLANNED']));
