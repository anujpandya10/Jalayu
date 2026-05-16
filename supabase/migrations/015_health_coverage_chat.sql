-- Health coverage AI chat history (insurance Q&A with web research)

CREATE TABLE IF NOT EXISTS public.health_coverage_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  sources     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.health_coverage_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own health coverage messages" ON public.health_coverage_messages;
CREATE POLICY "Users manage own health coverage messages"
  ON public.health_coverage_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_health_coverage_messages_user
  ON public.health_coverage_messages (user_id, created_at ASC);
