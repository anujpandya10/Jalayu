-- ── Migration 035: Academy Auto Trader ───────────────────────────────────────
-- A third, fully separate paper account ($1000 seed) that trades on its own —
-- US stocks only, market hours only — using the engine's real setup logic.
-- Fully isolated from academy_portfolio (manual desk, $1000) and paper_portfolio
-- (main bot, $500) so none of them ever interfere with each other.

create table if not exists academy_auto_portfolio (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  cash numeric(12,2) not null default 1000.00,
  enabled boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists academy_auto_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  symbol text not null,
  name text,
  direction text not null check (direction in ('LONG', 'SHORT')),
  shares numeric(12,6) not null,
  original_shares numeric(12,6) not null,
  avg_entry_price numeric(12,4) not null,
  stop_price numeric(12,4),
  target1_price numeric(12,4),
  target2_price numeric(12,4),
  half_closed boolean not null default false,
  setup_tag text,
  entry_ema9 numeric(12,4),
  entry_ema21 numeric(12,4),
  entry_vwap numeric(12,4),
  entry_rsi numeric(6,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, symbol)
);

create table if not exists academy_auto_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  symbol text not null,
  name text,
  action text not null check (action in ('BUY', 'SELL')),
  direction text not null check (direction in ('LONG', 'SHORT')),
  shares numeric(12,6) not null,
  price numeric(12,4) not null,
  total numeric(12,2) not null,
  pnl numeric(12,2),
  setup_tag text,
  reason text,
  ema9 numeric(12,4),
  ema21 numeric(12,4),
  vwap numeric(12,4),
  rsi numeric(6,2),
  created_at timestamptz not null default now()
);

-- The plain-English narration feed — every decision, in order, with the
-- indicator snapshot that drove it.
create table if not exists academy_auto_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  symbol text,
  kind text not null check (kind in ('ENTRY', 'TAKE_HALF', 'EXIT_FULL', 'STOP_HIT', 'STOP_MOVED', 'SCAN', 'INFO')),
  note text not null,
  price numeric(12,4),
  shares numeric(12,6),
  pnl numeric(12,2),
  ema9 numeric(12,4),
  ema21 numeric(12,4),
  vwap numeric(12,4),
  rsi numeric(6,2),
  created_at timestamptz not null default now()
);

create index if not exists idx_academy_auto_log_user on academy_auto_log(user_id, created_at desc);

alter table academy_auto_portfolio enable row level security;
alter table academy_auto_positions enable row level security;
alter table academy_auto_trades enable row level security;
alter table academy_auto_log enable row level security;

create policy "own academy auto portfolio" on academy_auto_portfolio for all using (auth.uid() = user_id);
create policy "own academy auto positions" on academy_auto_positions for all using (auth.uid() = user_id);
create policy "own academy auto trades" on academy_auto_trades for all using (auth.uid() = user_id);
create policy "own academy auto log" on academy_auto_log for all using (auth.uid() = user_id);
