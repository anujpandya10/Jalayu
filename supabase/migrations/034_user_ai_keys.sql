-- ── Migration 034: Bring-your-own AI agent (per-user API keys) ────────────────
-- Each user connects their own provider key so no one ever spends the owner's
-- credits. Keys are stored ENCRYPTED (AES-256-GCM) — never plaintext. RLS lets
-- a user manage only their own row; the server resolver reads via service role.

create table if not exists public.user_ai_keys (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  provider text not null default 'anthropic' check (provider in ('anthropic', 'openai', 'google')),
  key_cipher text not null,          -- AES-256-GCM payload (iv:tag:data, hex)
  key_hint text,                     -- last 4 chars, for display only
  model text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_ai_keys enable row level security;
create policy "own ai key" on public.user_ai_keys for all using (auth.uid() = user_id);
