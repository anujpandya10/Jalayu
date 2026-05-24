-- ════════════════════════════════════════════════════════════════════════════
-- 023: APEX VETO LAYER — engine ↔ Apex synthesis + skipped-trade analytics
-- ════════════════════════════════════════════════════════════════════════════

-- Snapshot engine state at Apex evaluation time (disagreement-as-signal)
alter table public.apex_decisions
  add column if not exists engine_score_at_decision numeric,
  add column if not exists engine_setup_at_decision text;

-- Trades the engine would have taken but Apex (or price-stale cache) blocked
create table if not exists public.engine_apex_vetoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,

  symbol text not null,
  asset_type text not null,
  direction text not null,              -- LONG | SHORT
  engine_score numeric not null,
  engine_setup text not null,
  entry_price numeric not null,

  apex_decision_id uuid references public.apex_decisions(id) on delete set null,
  apex_decision text,                   -- BUY | SELL | HOLD (null if no valid cache)
  apex_conviction numeric,
  apex_price_at_decision numeric,

  veto_type text not null,              -- apex_vetoed_hold | apex_vetoed_opposite | apex_low_conviction | apex_confirmed | apex_strong | no_apex_cache
  position_multiplier numeric not null default 1.0,  -- 0 = skipped, 0.5 = scaled, 1.0/1.2 = proceed

  would_have_budget_usd numeric,
  executed boolean not null default false,

  created_at timestamptz not null default now()
);

alter table public.engine_apex_vetoes enable row level security;

drop policy if exists "Users manage own apex vetoes" on public.engine_apex_vetoes;
create policy "Users manage own apex vetoes"
  on public.engine_apex_vetoes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_vetoes_user_created
  on public.engine_apex_vetoes(user_id, created_at desc);
create index if not exists idx_vetoes_user_symbol
  on public.engine_apex_vetoes(user_id, symbol, created_at desc);
create index if not exists idx_vetoes_user_type
  on public.engine_apex_vetoes(user_id, veto_type, created_at desc);
