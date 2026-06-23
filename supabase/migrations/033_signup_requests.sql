-- ── Migration 033: Access requests (invite-only beta) ────────────────────────
-- Public sign-up is replaced by a "request access" form. Rows are written by a
-- service-role route and reviewed by the owner. RLS is ON with NO policies, so
-- only the service-role admin client can read/write — never the browser.

create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decision_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_signup_requests_status on public.signup_requests(status, created_at desc);

alter table public.signup_requests enable row level security;
-- Intentionally no policies: all access goes through the owner-gated admin routes.
