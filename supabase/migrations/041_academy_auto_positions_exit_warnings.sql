-- "Getting close" exit warnings — a one-shot flag per position per side so the proximity
-- push (within ~0.1% of the stop or first target) fires once, not every tick while price
-- hovers near the line.
alter table public.academy_auto_positions add column if not exists warned_near_stop boolean not null default false;
alter table public.academy_auto_positions add column if not exists warned_near_target boolean not null default false;
