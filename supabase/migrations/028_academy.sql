-- ── Migration 028: Academy — live manual paper-trading classroom ──────────────
-- Fully separate from paper_portfolio/paper_positions/paper_trades so the
-- auto-trading engine (which manages paper_positions with no `auto` filter)
-- never reaches in and manages a position the user is practicing manually.

-- ── academy_portfolio — the student's own $1000 practice account ──────────────
create table if not exists academy_portfolio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade unique not null,
  cash numeric(12,2) not null default 1000.00,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── academy_positions — open manual positions ──────────────────────────────────
create table if not exists academy_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  symbol text not null,
  name text,
  direction text not null default 'LONG' check (direction in ('LONG', 'SHORT')),
  shares numeric(12,6) not null default 0,
  avg_entry_price numeric(12,4) not null,
  declared_setup_tag text,
  declared_stop_loss numeric(12,4),
  declared_take_profit numeric(12,4),
  thesis text,
  entry_trade_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, symbol)
);

-- ── academy_trades — full manual trade history (entries + exits) ──────────────
create table if not exists academy_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  symbol text not null,
  name text,
  action text not null check (action in ('BUY', 'SELL')),
  direction text not null default 'LONG' check (direction in ('LONG', 'SHORT')),
  shares numeric(12,6) not null,
  price numeric(12,4) not null,
  total numeric(12,2) not null,
  pnl numeric(12,2),                  -- null for entries, realized P&L for exits
  declared_setup_tag text,
  declared_stop_loss numeric(12,4),
  declared_take_profit numeric(12,4),
  thesis text,
  engine_score_at_trade numeric(6,2), -- scoreAssetFull().score snapshot at trade time
  engine_setup_at_trade text,         -- scoreAssetFull().setupTag snapshot at trade time
  entry_trade_id uuid references academy_trades(id), -- set on the closing (exit) row only; lets stats trace a closed round-trip back to its entry review after the position row is gone
  created_at timestamptz not null default now()
);

-- ── academy_trade_reviews — one coach verdict per trade (entry or exit) ───────
create table if not exists academy_trade_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  trade_id uuid references academy_trades(id) on delete cascade not null,
  review_type text not null check (review_type in ('ENTRY', 'EXIT')),

  verdict text not null check (verdict in ('GOOD', 'QUESTIONABLE', 'BAD')),
  matched_setup_tag text,            -- what the coach thinks this actually was (may differ from declared)
  setup_match boolean,
  headline text not null,
  rationale text not null,
  better_action text,
  risk_note text,

  -- Indicator snapshot at review time (same shape as apex_decisions)
  rsi_1m numeric(6,2),
  vwap_dev_pct numeric(8,4),
  atr_pct numeric(8,4),
  regime text,
  vol_spike numeric(8,3),
  engine_score numeric(6,2),
  engine_setup text,

  -- EXIT-only hindsight follow-up, filled in later
  hindsight_checked_at timestamptz,
  hindsight_price numeric(12,4),
  hindsight_pct_move numeric(8,4),
  hindsight_verdict text,

  created_at timestamptz not null default now()
);

-- ── academy_chapter_progress — curriculum completion, follows the user across devices ─
create table if not exists academy_chapter_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  chapter_id text not null,
  completed boolean not null default false,
  scenario_correct boolean,
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, chapter_id)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table academy_portfolio enable row level security;
alter table academy_positions enable row level security;
alter table academy_trades enable row level security;
alter table academy_trade_reviews enable row level security;
alter table academy_chapter_progress enable row level security;

create policy "own academy portfolio" on academy_portfolio for all using (auth.uid() = user_id);
create policy "own academy positions" on academy_positions for all using (auth.uid() = user_id);
create policy "own academy trades" on academy_trades for all using (auth.uid() = user_id);
create policy "own academy trade reviews" on academy_trade_reviews for all using (auth.uid() = user_id);
create policy "own academy chapter progress" on academy_chapter_progress for all using (auth.uid() = user_id);
