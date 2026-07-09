-- ════════════════════════════════════════════════════════════════════════════
-- 046: FEEDBACK & SUPPORT
-- ════════════════════════════════════════════════════════════════════════════
--
-- An in-app support channel for already-authenticated users (unlike
-- signup_requests, which is pre-account). A user submits, sees their own
-- history, and sees the owner's reply once posted. The owner replies through
-- the owner-gated /api/feedback/admin route (service-role), which is the only
-- place admin_reply/status is ever set — regular RLS doesn't need column-level
-- restrictions for that because the API route is the sole write path used by
-- the client for updates to another user's row.

create table if not exists public.feedback_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,

  category text not null default 'general' check (category in ('general', 'bug', 'feature', 'support')),
  message text not null,

  status text not null default 'open' check (status in ('open', 'replied', 'closed')),
  admin_reply text,
  replied_at timestamptz,

  created_at timestamptz not null default now()
);

alter table public.feedback_requests enable row level security;

drop policy if exists "Users manage own feedback" on public.feedback_requests;
create policy "Users manage own feedback"
  on public.feedback_requests for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_feedback_requests_status
  on public.feedback_requests(status, created_at desc);
