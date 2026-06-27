-- "Did you also place this trade?" — collects a Yes/No after every entry/exit the user
-- might have been shadowing live, so we can show a real kept-up-with-entries-vs-exits
-- breakdown instead of just hoping the user remembers how it went.
create table if not exists public.academy_auto_shadow_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  event_type text not null check (event_type in ('ENTRY','EXIT')),
  symbol text not null,
  detail text not null,
  answer text check (answer in ('YES','NO')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
alter table public.academy_auto_shadow_feedback enable row level security;
drop policy if exists "Users manage own shadow feedback" on public.academy_auto_shadow_feedback;
create policy "Users manage own shadow feedback" on public.academy_auto_shadow_feedback for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_shadow_feedback_user_created on public.academy_auto_shadow_feedback(user_id, created_at desc);
