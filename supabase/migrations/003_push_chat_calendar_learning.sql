-- Push subscriptions, chat persistence, calendar tokens, learning enrollments, notes.meta

alter table public.notes add column if not exists meta jsonb;

-- Push (Web Push) subscriptions per device
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

-- Chat message history (persisted companion thread)
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

drop policy if exists "Users manage own chat messages" on public.chat_messages;
create policy "Users manage own chat messages"
  on public.chat_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_chat_messages_user_created on public.chat_messages(user_id, created_at desc);

-- Long-term memory snippets for system prompt (friend-like continuity)
create table if not exists public.chat_memory_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fact text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_memory_facts enable row level security;

drop policy if exists "Users manage own chat memory facts" on public.chat_memory_facts;
create policy "Users manage own chat memory facts"
  on public.chat_memory_facts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_chat_memory_facts_user on public.chat_memory_facts(user_id, created_at desc);

-- Optional Google Calendar connection (OAuth tokens — encrypt at rest in production)
create table if not exists public.calendar_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  provider text not null default 'google',
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_connections enable row level security;

drop policy if exists "Users manage own calendar connections" on public.calendar_connections;
create policy "Users manage own calendar connections"
  on public.calendar_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Learning track enrollment
create table if not exists public.learning_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_id text not null,
  day_index integer not null default 0,
  started_at timestamptz not null default now(),
  unique (user_id, track_id)
);

alter table public.learning_enrollments enable row level security;

drop policy if exists "Users manage own learning enrollments" on public.learning_enrollments;
create policy "Users manage own learning enrollments"
  on public.learning_enrollments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
