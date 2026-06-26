-- The live-tick error boundary (academy-auto-trader.ts) logs failures as kind 'ERROR',
-- but the original check constraint never allowed it — every error-log insert was
-- silently rejected, defeating the whole point of surfacing tick failures.
alter table public.academy_auto_log drop constraint academy_auto_log_kind_check;
alter table public.academy_auto_log add constraint academy_auto_log_kind_check
  check (kind = any (array['ENTRY','TAKE_HALF','EXIT_FULL','STOP_HIT','STOP_MOVED','SCAN','INFO','ERROR']));
