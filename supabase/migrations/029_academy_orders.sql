-- ── Migration 029: Academy auto-managed orders ───────────────────────────────
-- Adds bracket-management columns to positions + a pending-orders table for
-- limit entries. Powers: limit "buy/sell at this price", brackets (scaled
-- exits: sell half at target 1, rest at target 2), and the stop auto-moving
-- to break-even after the first target fills.

-- Bracket plan lives on the managed position
alter table academy_positions add column if not exists managed boolean not null default false;
alter table academy_positions add column if not exists original_shares numeric(12,6);
alter table academy_positions add column if not exists stop_price numeric(12,4);
alter table academy_positions add column if not exists target1_price numeric(12,4);
alter table academy_positions add column if not exists target2_price numeric(12,4);
alter table academy_positions add column if not exists half_closed boolean not null default false;

-- Pending limit entries awaiting a fill (market+bracket orders fill immediately
-- and never land here — they go straight to a managed position).
create table if not exists academy_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  symbol text not null,
  name text,
  direction text not null check (direction in ('LONG', 'SHORT')),
  shares numeric(12,6) not null,
  limit_price numeric(12,4) not null,
  -- optional bracket plan, applied when the limit fills
  stop_price numeric(12,4),
  target1_price numeric(12,4),
  target2_price numeric(12,4),
  status text not null default 'PENDING' check (status in ('PENDING', 'FILLED', 'CANCELLED')),
  note text,
  created_at timestamptz not null default now(),
  filled_at timestamptz
);

alter table academy_orders enable row level security;
create policy "own academy orders" on academy_orders for all using (auth.uid() = user_id);
