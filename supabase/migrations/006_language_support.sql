-- 006_language_support.sql
-- Adds preferred_language (BCP-47) to profiles for multilingual AI responses

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'en';
