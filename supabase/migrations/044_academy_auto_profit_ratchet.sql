-- Peak-equity ratchet: defend a high-water mark across days instead of treating every
-- session as a fresh start from seed capital. peak_equity is the account's all-time high
-- (cash + open position value); profit_defense_state tracks how much of that peak's profit
-- has been given back so the engine can tighten (SOFT) or halt new entries (HARD) instead
-- of quietly round-tripping a gain back to flat.
alter table public.academy_auto_portfolio add column if not exists peak_equity numeric(12,2) not null default 1000.00;
alter table public.academy_auto_portfolio add column if not exists profit_defense_state text not null default 'NONE'
  check (profit_defense_state in ('NONE', 'SOFT', 'HARD'));
