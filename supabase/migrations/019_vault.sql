-- ════════════════════════════════════════════════════════════════════════════
-- VAULT — PIN-protected, client-side-encrypted storage for passwords/secrets
-- ════════════════════════════════════════════════════════════════════════════
--
-- Security model:
--   • PIN never leaves the browser. Server never sees plaintext PIN or content.
--   • Client derives an AES-GCM key from the PIN using PBKDF2-HMAC-SHA-256
--     with a per-user random salt and 250,000 iterations.
--   • Vault entries are encrypted client-side before upload. Server stores
--     only ciphertext + IV. Even a full DB breach exposes only ciphertext.
--   • RLS enforces user_id scoping at the database level (defense-in-depth).
--   • PIN verification: client decrypts a known "OK" token stored at setup.
--     If decryption produces the expected string, PIN is correct.
--   • Failed-attempt counter for basic brute-force resistance.

-- ─── vault_settings ──────────────────────────────────────────────────────────
-- One row per user. Holds the salt + verification blob.
create table if not exists public.vault_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  salt text not null,                  -- base64 random salt for PBKDF2
  iterations int not null default 250000,
  -- Encrypted verification token (base64 ciphertext + IV).
  -- Client tries to decrypt this with PIN-derived key on unlock.
  verification_blob text not null,
  verification_iv text not null,       -- base64 IV
  failed_attempts int not null default 0,
  locked_until timestamptz,            -- if set + in future, vault is throttled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vault_settings enable row level security;

drop policy if exists "Users manage own vault settings" on public.vault_settings;
create policy "Users manage own vault settings"
  on public.vault_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── vault_entries ───────────────────────────────────────────────────────────
-- One row per stored secret. Name is plaintext (for the list), content is
-- encrypted with the user's PIN-derived key.
create table if not exists public.vault_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,                  -- "Gmail password", "Bank routing", etc.
  kind text not null default 'secret', -- 'password' | 'note' | 'card' | 'secret'
  -- Encrypted blob: AES-GCM ciphertext, base64-encoded
  ciphertext text not null,
  iv text not null,                    -- base64 IV (96 bits for GCM)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vault_entries enable row level security;

drop policy if exists "Users manage own vault entries" on public.vault_entries;
create policy "Users manage own vault entries"
  on public.vault_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_vault_entries_user_created
  on public.vault_entries(user_id, created_at desc);

-- ─── updated_at trigger for vault_entries ────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists vault_entries_updated_at on public.vault_entries;
create trigger vault_entries_updated_at
  before update on public.vault_entries
  for each row execute function public.set_updated_at();

drop trigger if exists vault_settings_updated_at on public.vault_settings;
create trigger vault_settings_updated_at
  before update on public.vault_settings
  for each row execute function public.set_updated_at();
