-- ════════════════════════════════════════════════════════════════════════════
-- 024: INTENTS — Jalayu as a shadow agent
-- ════════════════════════════════════════════════════════════════════════════
--
-- The new core of Jalayu. The user fires intents from the phone:
--   "research the best way to handle X"
--   "summarize the latest news on Y"
--   "fix bug Z in repo W"  (v2 — needs code runner)
--
-- Each intent is a row that progresses:
--   queued → running → done | needs_review | failed
--
-- The runner writes result_md back. The Home view polls and shows status.

create table if not exists public.intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,

  -- Input
  text text not null,
  kind text not null default 'research',     -- research | code | calendar | comms | … (v1 = research only)

  -- Lifecycle
  status text not null default 'queued',     -- queued | running | done | needs_review | failed
  error text,

  -- Output
  result_md text,
  result_summary text,                       -- one-line for the ledger
  citations jsonb,                           -- list of {title, url} for research
  model text,                                -- e.g. claude-sonnet-4-20250514

  -- Review tracking
  reviewed_at timestamptz,
  archived_at timestamptz,

  -- Timing
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table public.intents enable row level security;

drop policy if exists "Users manage own intents" on public.intents;
create policy "Users manage own intents"
  on public.intents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_intents_user_created
  on public.intents(user_id, created_at desc);
create index if not exists idx_intents_user_status
  on public.intents(user_id, status, created_at desc)
  where archived_at is null;
