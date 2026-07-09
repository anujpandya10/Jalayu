-- ════════════════════════════════════════════════════════════════════════════
-- 045: PREMIUM TIER SCAFFOLDING + SIGNUP HARDENING
-- ════════════════════════════════════════════════════════════════════════════
--
-- Adds the minimal schema to support:
--   1. Manual (non-Stripe) owner grants of premium modules to specific users.
--   2. IP capture on signup_requests for basic anti-abuse / owner review context.
--
-- No billing/subscription tables — this is scaffolding only, per product
-- decision to defer real payments. Grants stay the source of truth for "does
-- this user have access right now," regardless of how that access was earned,
-- so a future subscriptions table can be added later without touching this.

-- ── Premium module grants ──
create table if not exists public.user_premium_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,

  module_id text not null,                    -- mirrors SidebarView id (e.g. 'trading')
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null,  -- owner who granted it
  note text,                                  -- optional context ("beta tester", etc.)

  unique (user_id, module_id)
);

alter table public.user_premium_grants enable row level security;

-- Users can see their own grants (so the client can check "am I granted?"),
-- but only the owner-gated admin routes (service-role key) can write.
drop policy if exists "Users view own premium grants" on public.user_premium_grants;
create policy "Users view own premium grants"
  on public.user_premium_grants for select
  using (auth.uid() = user_id);
-- Intentionally no insert/update/delete policies — all writes go through
-- /api/admin/premium-grants (owner-gated) using the service-role key.

create index if not exists idx_user_premium_grants_user
  on public.user_premium_grants(user_id);

-- ── Signup request hardening: capture submitting IP for owner review ──
alter table public.signup_requests
  add column if not exists ip_address text;

create index if not exists idx_signup_requests_created_at
  on public.signup_requests(created_at desc);
