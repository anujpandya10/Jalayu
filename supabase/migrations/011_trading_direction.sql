alter table paper_positions add column if not exists direction text default 'LONG';
alter table paper_trades add column if not exists direction text default 'LONG';
