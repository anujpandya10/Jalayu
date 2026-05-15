-- 004_passive_engagement.sql
-- Adds event_type to tasks (for unified calendar view) and nudge_log for idempotent push nudges

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS event_type text DEFAULT 'task';

-- nudge_log: one row per user per nudge_type per calendar day — prevents duplicate nudges
CREATE TABLE IF NOT EXISTS nudge_log (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  nudge_type  text        NOT NULL,  -- 'mood_check' | 'task_reminder' | 'reflection_prompt'
  sent_at     timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE nudge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own nudge log"
  ON nudge_log FOR ALL
  USING (auth.uid() = user_id);

-- Index for fast daily uniqueness check
CREATE INDEX IF NOT EXISTS nudge_log_user_type_day
  ON nudge_log (user_id, nudge_type, (sent_at::date));
