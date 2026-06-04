-- ════════════════════════════════════════════════════════════════════════════
-- 026: DAILY LETTERS — Jalayu closes the day with you
-- ════════════════════════════════════════════════════════════════════════════
--
-- One letter per user per day. Generated when ShadowHome detects it's
-- after 7pm local AND no letter has been written yet for today's date.
-- The text references the day's intents, mood, completed tasks, and
-- the user's broader context so it feels like a companion looking back
-- with you, not a generic summary.

create table if not exists public.daily_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- One letter per user per date (local-day key, formatted YYYY-MM-DD)
  letter_date date not null,

  text_md text not null,
  model text,

  generated_at timestamptz not null default now(),
  dismissed_at timestamptz,

  unique (user_id, letter_date)
);

alter table public.daily_letters enable row level security;

drop policy if exists "Users manage own daily letters" on public.daily_letters;
create policy "Users manage own daily letters"
  on public.daily_letters for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_daily_letters_user_date
  on public.daily_letters(user_id, letter_date desc);
