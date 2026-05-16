-- Paper trading portfolio
create table if not exists paper_portfolio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  cash numeric(12,2) not null default 500.00,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Open positions
create table if not exists paper_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  symbol text not null,
  name text,
  shares numeric(12,6) not null default 0,
  avg_buy_price numeric(12,4) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, symbol)
);

-- Full trade history
create table if not exists paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  symbol text not null,
  name text,
  action text not null check (action in ('BUY', 'SELL')),
  shares numeric(12,6) not null,
  price numeric(12,4) not null,
  total numeric(12,2) not null,
  pnl numeric(12,2),          -- null for buys, realized P&L for sells
  reason text,                 -- why the auto-trader made this trade
  auto boolean default false,  -- true = algo trade, false = manual
  created_at timestamptz default now()
);

-- Watchlist of symbols the algo monitors
create table if not exists trading_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  symbol text not null,
  name text,
  created_at timestamptz default now(),
  unique(user_id, symbol)
);

-- RLS
alter table paper_portfolio enable row level security;
alter table paper_positions enable row level security;
alter table paper_trades enable row level security;
alter table trading_watchlist enable row level security;

create policy "own portfolio" on paper_portfolio for all using (auth.uid() = user_id);
create policy "own positions" on paper_positions for all using (auth.uid() = user_id);
create policy "own trades" on paper_trades for all using (auth.uid() = user_id);
create policy "own watchlist" on trading_watchlist for all using (auth.uid() = user_id);
