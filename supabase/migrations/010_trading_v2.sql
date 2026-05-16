-- Add fields to paper_positions for TP/SL and asset type
alter table paper_positions
  add column if not exists asset_type text default 'stock',
  add column if not exists take_profit_price numeric(14,6),
  add column if not exists stop_loss_price numeric(14,6);

-- Track last algo run per user
alter table paper_portfolio
  add column if not exists last_run_at timestamptz,
  add column if not exists total_trades_run integer default 0;
