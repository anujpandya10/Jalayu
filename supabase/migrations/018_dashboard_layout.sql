-- Per-user home dashboard widget order & visibility
alter table public.profiles add column if not exists dashboard_layout jsonb;
