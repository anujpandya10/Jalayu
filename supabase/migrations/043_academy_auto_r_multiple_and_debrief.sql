-- R-multiple support: the per-share dollar risk fixed at entry (|entry - initial stop|).
-- Stored once at entry and never updated when the stop trails/moves to break-even, so R
-- is always measured against the ORIGINAL risk — the real professional convention.
alter table public.academy_auto_positions add column if not exists risk_per_share numeric;
alter table public.academy_auto_trades add column if not exists risk_per_share numeric;

-- Distinct kind for the end-of-day desk recap, so the UI can style it as its own card.
alter table public.academy_auto_log drop constraint academy_auto_log_kind_check;
alter table public.academy_auto_log add constraint academy_auto_log_kind_check
  check (kind = any (array['ENTRY','TAKE_HALF','EXIT_FULL','STOP_HIT','STOP_MOVED','SCAN','INFO','ERROR','PLANNED','DEBRIEF']));
