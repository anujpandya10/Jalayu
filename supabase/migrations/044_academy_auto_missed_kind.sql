-- Distinct kind for a heads-up that timed out unconfirmed (quote kept failing, or the
-- window closed before it could be resolved) — so the log carries a real record with a
-- real timestamp instead of the pending card just sitting frozen at 0s forever.
alter table public.academy_auto_log drop constraint academy_auto_log_kind_check;
alter table public.academy_auto_log add constraint academy_auto_log_kind_check
  check (kind = any (array['ENTRY','TAKE_HALF','EXIT_FULL','STOP_HIT','STOP_MOVED','SCAN','INFO','ERROR','PLANNED','DEBRIEF','MISSED']));
