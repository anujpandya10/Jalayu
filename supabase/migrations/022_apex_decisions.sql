-- ════════════════════════════════════════════════════════════════════════════
-- 022: APEX DECISIONS — persisted LLM evaluations for EV analysis
-- ════════════════════════════════════════════════════════════════════════════
--
-- Every Apex evaluation gets logged here with:
--   • the EXACT data feed shown to the model (locked indicator contract)
--   • the model's structured output (decision + conviction + rationale + risk)
--   • portfolio context at decision time (equity + drawdown state)
--   • outcome correlation: backfilled by joining paper_trades on
--     symbol+direction within a 60-min window after the decision
--
-- This lets us answer real questions like:
--   "Across all Apex BUYs with conviction ≥ 8.5 AND
--    (RSI-1m < 30 AND RSI-15m > 50), what's the realized EV?"
-- via /api/trading/apex/history aggregation endpoint.

create table if not exists public.apex_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Asset snapshot
  symbol text not null,
  asset_type text not null,
  current_price numeric not null,

  -- The EXACT data feed shown to the model (locked contract)
  ema9 numeric,
  ema21 numeric,
  vwap_dev_pct numeric,
  atr_pct numeric,
  regime text,                     -- LOW_VOL | NORMAL | HIGH_VOL
  rsi_1m numeric,
  rsi_15m numeric,
  vol_spike numeric,

  -- Portfolio context at decision time
  equity_at_decision numeric not null,
  drawdown_pct numeric,
  drawdown_active boolean not null default false,

  -- LLM structured output (Apex JSON, parsed into columns for queryability)
  decision text not null,          -- BUY | SELL | HOLD
  conviction_score numeric not null,
  rationale text not null,
  suggested_position_size_pct numeric,
  stop_loss_target numeric,
  take_profit_target numeric,
  rr_ratio numeric,                -- server-computed from sl/tp/entry

  -- Linkage + outcome (backfilled / correlated)
  linked_paper_trade_id uuid,
  acted_on boolean not null default false,
  realized_pnl numeric,
  realized_pnl_pct numeric,
  exit_reason text,
  exit_at timestamptz,

  created_at timestamptz not null default now()
);

alter table public.apex_decisions enable row level security;

drop policy if exists "Users manage own apex decisions" on public.apex_decisions;
create policy "Users manage own apex decisions"
  on public.apex_decisions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_apex_user_created
  on public.apex_decisions(user_id, created_at desc);
create index if not exists idx_apex_user_symbol
  on public.apex_decisions(user_id, symbol, created_at desc);
create index if not exists idx_apex_user_decision
  on public.apex_decisions(user_id, decision, created_at desc);
