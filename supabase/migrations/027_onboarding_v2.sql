-- ════════════════════════════════════════════════════════════════════════════
-- 027: ONBOARDING V2 — make the shadow knowable to strangers
-- ════════════════════════════════════════════════════════════════════════════
--
-- Additive only. Existing users keep working; missing fields read as empty.
-- The old onboarding columns (work_type, wake_time, day_structure) are kept
-- so we don't break data for users who completed the legacy 6-step flow.
--
-- profile_notes shape (jsonb array, newest first):
--   [
--     {
--       "asked_at": "2026-06-06T19:00:00Z",
--       "prompt":   "<question Jalayu asked>",
--       "answer":   "<user's reply>",
--       "source":   "letter" | "onboarding" | "manual"
--     },
--     ...
--   ]

alter table public.profiles
  add column if not exists pronouns text,
  add column if not exists life_stage text,
  add column if not exists help_domains text[] default '{}'::text[],
  add column if not exists voice_prefs text[] default '{}'::text[],
  add column if not exists boundaries text,
  add column if not exists profile_notes jsonb default '[]'::jsonb,
  add column if not exists last_deepening_at timestamptz;
