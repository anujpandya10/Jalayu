-- ════════════════════════════════════════════════════════════════════════════
-- 047: 7-DAY PREMIUM TRIAL
-- ════════════════════════════════════════════════════════════════════════════
--
-- Every new user gets a free 7-day trial of the premium modules (Trading,
-- Academy, Vault, Health). The window is set at onboarding completion to
-- now() + 7 days; while it's in the future, premium modules are usable. Once
-- it passes, they lock (request continued access via Feedback; paid plans
-- later). The owner is never gated by this.
--
-- Nullable by design: existing users (and any account created before this
-- column) simply have no trial, so premium stays grant-only for them — the app
-- treats a null/absent value as "not in trial," never as an error.

alter table public.profiles
  add column if not exists premium_trial_ends_at timestamptz;
