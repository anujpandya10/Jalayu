-- ── Migration 031: trailing stops on held positions ──────────────────────────
-- Margin / buying power / PDT are computed live from cash + positions + trades
-- (no schema needed). This only adds the trailing-stop state to positions.

alter table academy_positions add column if not exists trail_percent numeric(8,4);
alter table academy_positions add column if not exists trail_anchor numeric(12,4);
