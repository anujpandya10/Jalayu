-- ════════════════════════════════════════════════════════════════════════════
-- 048: RISK PROFILES + TRADING DISCLAIMER + ACADEMY EXPERIENCE LEVEL
-- ════════════════════════════════════════════════════════════════════════════
--
-- Three independent, additive columns on profiles:
--   risk_profile                    — shared Cautious/Balanced/Aggressive tier,
--                                      read by all 3 paper-trading systems
--                                      (main bot, academy manual desk, academy
--                                      auto trader) via src/lib/risk-profiles.ts.
--                                      Defaults to 'balanced' so every existing
--                                      user keeps today's exact behavior with
--                                      zero migration of trade history needed.
--   trading_disclaimer_accepted_at  — one-time plain-English acknowledgment,
--                                      null = not yet shown/accepted. Gates the
--                                      first real action in any of the 3
--                                      trading systems (first order placed,
--                                      first auto-trader enable).
--   academy_experience_level        — optional branching key for curriculum
--                                      ordering (src/lib/academy-levels.ts).
--                                      Null = show the curriculum's default
--                                      authored `order` sequence (today's
--                                      behavior, unchanged).
--
-- All nullable-or-defaulted by design — no backfill required, no existing
-- user's behavior changes until they explicitly interact with a gated action.

alter table public.profiles
  add column if not exists risk_profile text not null default 'balanced'
    check (risk_profile in ('cautious', 'balanced', 'aggressive')),
  add column if not exists trading_disclaimer_accepted_at timestamptz,
  add column if not exists academy_experience_level text
    check (academy_experience_level in ('new', 'basics', 'experienced'));
