-- ── Migration 030: Webull-style order types ───────────────────────────────────
-- Extends academy_orders to support Stop and Stop-Limit (alongside Limit), plus
-- time-in-force (DAY expires at the session close, GTC rests until filled).

alter table academy_orders add column if not exists order_type text not null default 'LIMIT'
  check (order_type in ('LIMIT', 'STOP', 'STOP_LIMIT'));
alter table academy_orders add column if not exists tif text not null default 'DAY'
  check (tif in ('DAY', 'GTC'));
alter table academy_orders add column if not exists stop_trigger numeric(12,4);
alter table academy_orders add column if not exists expires_at timestamptz;

-- STOP (market-on-trigger) entries have no limit price
alter table academy_orders alter column limit_price drop not null;
