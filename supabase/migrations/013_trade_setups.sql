-- ── Migration 013: Trade Setup Logging + Strategy Config ──────────────────────
-- Captures a feature snapshot at every trade entry so the engine can learn
-- which setups are profitable and veto losers over time.

-- ── 1. trade_setups — feature snapshot at entry ───────────────────────────────
create table if not exists trade_setups (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  symbol          text not null,
  asset_type      text not null,   -- 'crypto' | 'stock' | 'forex'
  direction       text not null,   -- 'LONG' | 'SHORT'

  -- Indicator snapshot at the moment of entry
  entry_price     numeric(20,8)    not null,
  rsi_at_entry    numeric(6,2),    -- 0–100
  vwap_dev_pct    numeric(8,4),    -- % above/below VWAP (negative = below)
  atr_pct         numeric(8,4),    -- ATR as % of price (volatility proxy)
  vol_spike       numeric(8,3),    -- current_vol / MA20_vol multiplier
  change_24h      numeric(8,4),    -- % 24h change (from CoinGecko/Yahoo)
  initial_score   numeric(6,2),    -- signal score that triggered entry (-10..+10)

  -- Human-readable setup classification
  setup_tag       text not null default 'UNTAGGED',
  -- Examples: OVERSOLD_BOUNCE | PUMP_SHORT | VWAP_LONG | VWAP_SHORT |
  --           SUPERNOVA_SHORT | MOMENTUM_LONG | MEAN_REVERT | FOREX_DIP

  -- Outcome (filled on trade close)
  outcome_pnl     numeric(12,4),
  won             boolean,
  held_secs       integer,
  exit_reason     text,

  opened_at       timestamptz not null default now(),
  closed_at       timestamptz
);

alter table trade_setups enable row level security;
create policy "Users own their trade setups"
  on trade_setups for all using (auth.uid() = user_id);

create index idx_trade_setups_user      on trade_setups(user_id);
create index idx_trade_setups_tag       on trade_setups(user_id, setup_tag);
create index idx_trade_setups_opened    on trade_setups(opened_at desc);
create index idx_trade_setups_symbol    on trade_setups(symbol, opened_at desc);

-- ── 2. setup_stats — aggregated win rate per setup tag ────────────────────────
-- This is a VIEW — automatically stays current, no manual update needed.
create or replace view setup_stats as
  select
    user_id,
    setup_tag,
    asset_type,
    direction,
    count(*)                                                        as total_trades,
    coalesce(sum(case when won then 1 else 0 end), 0)              as wins,
    count(*) - coalesce(sum(case when won then 1 else 0 end), 0)   as losses,
    round(
      coalesce(sum(case when won then 1 else 0 end), 0)::numeric
      / nullif(count(*), 0) * 100
    , 1)                                                            as win_rate_pct,
    round(avg(outcome_pnl)::numeric, 4)                            as avg_pnl,
    round(sum(outcome_pnl)::numeric, 4)                            as total_pnl,
    round(avg(held_secs)::numeric, 0)                              as avg_hold_secs,
    max(opened_at)                                                  as last_trade_at
  from trade_setups
  where closed_at is not null
  group by user_id, setup_tag, asset_type, direction;

-- ── 3. strategy_config — per-user per-setup enable/disable toggle ─────────────
create table if not exists strategy_config (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  setup_tag       text not null,
  enabled         boolean not null default true,
  min_score_override numeric(4,1),   -- null = use global default
  notes           text,
  updated_at      timestamptz not null default now(),

  unique(user_id, setup_tag)
);

alter table strategy_config enable row level security;
create policy "Users own their strategy config"
  on strategy_config for all using (auth.uid() = user_id);

-- ── 4. Add setup_tag to paper_trades so UI can join ──────────────────────────
alter table paper_trades
  add column if not exists setup_tag text,
  add column if not exists setup_id  uuid references trade_setups(id);

comment on table trade_setups     is 'Indicator snapshot at every trade entry — used for win-rate learning';
comment on view  setup_stats      is 'Aggregated performance per setup tag per user';
comment on table strategy_config  is 'Per-user enable/disable and threshold overrides per setup tag';
