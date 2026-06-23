-- ── Migration 036: Auto Trader daily schedule ────────────────────────────────
-- Lets the Auto Trader arm itself once per trading day (instead of requiring
-- a manual Start click) and tracks the last session it kicked off, so the
-- morning prep narration only runs once per day no matter how often the
-- cron/tick fires.

alter table academy_auto_portfolio add column if not exists auto_start boolean not null default true;
alter table academy_auto_portfolio add column if not exists last_session_date date;
