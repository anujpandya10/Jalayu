-- Server-side auto trading (Vercel cron) — runs when dashboard tab is closed
alter table paper_portfolio
  add column if not exists auto_trading_enabled boolean not null default true;

comment on column paper_portfolio.auto_trading_enabled is
  'When true, /api/cron/trading runs the engine every minute on Vercel';
