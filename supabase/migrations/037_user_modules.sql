-- ════════════════════════════════════════════════════════════════════════════
-- 037: USER MODULES — Jalayu as a platform
-- ════════════════════════════════════════════════════════════════════════════
--
-- The personalization layer. Jalayu provides a fixed "ground" (the module
-- registry in src/lib/modules-registry.ts); each user grows their own house on
-- top of it. Two tables:
--
--   user_modules     — which modules a user has switched on, their per-module
--                      config, and the order they sit in. The dynamic shell
--                      renders from this instead of a hardcoded tab list.
--   user_life_intake — the raw answers to the 5-category life-intake, kept so
--                      the result stays transparent ("why is this on?") and
--                      fully resettable (delete the row to start over).
--
-- module_id is text and mirrors the SidebarView ids. Same per-user RLS pattern
-- as every table since 019.

create table if not exists public.user_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,

  module_id text not null,                    -- mirrors SidebarView id (e.g. 'trading')
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,  -- per-module settings the user (or AI) tunes
  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, module_id)
);

alter table public.user_modules enable row level security;

drop policy if exists "Users manage own modules" on public.user_modules;
create policy "Users manage own modules"
  on public.user_modules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_user_modules_user
  on public.user_modules(user_id, sort_order);

-- ── Raw life-intake answers (one row per user; resettable) ──
create table if not exists public.user_life_intake (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,   -- { questionId: [optionId, …] }
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_life_intake enable row level security;

drop policy if exists "Users manage own intake" on public.user_life_intake;
create policy "Users manage own intake"
  on public.user_life_intake for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
