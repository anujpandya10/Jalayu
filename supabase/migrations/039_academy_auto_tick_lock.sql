-- The cron (every minute) and the client's own poll (every 25s while the tab is open) both
-- call runAutoTraderTick for the same user with zero coordination — cash is a plain
-- read-then-write with no guard, so two overlapping ticks can clobber each other's debit/
-- credit. A short TTL lock (self-expiring, so a crashed tick can't deadlock the account)
-- makes overlapping ticks a no-op instead of a race.
alter table public.academy_auto_portfolio add column if not exists tick_lock_until timestamptz;
