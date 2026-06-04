-- ════════════════════════════════════════════════════════════════════════════
-- 025: INTENT MEMORY — Jalayu starts knowing you
-- ════════════════════════════════════════════════════════════════════════════
--
-- Every completed intent gets embedded (text + result_summary) so the
-- next intent can be enriched with similar past work. Cosine similarity
-- via pgvector; threshold ~0.55; top-3 within last 90 days.
--
-- Voyage AI voyage-3 outputs 1024-dim vectors → vector(1024).

create extension if not exists vector;

alter table public.intents
  add column if not exists embedding vector(1024),
  add column if not exists embedded_at timestamptz,
  add column if not exists used_memory_ids uuid[] default '{}'::uuid[];

-- ivfflat index for fast similarity search.
-- lists=50 is fine for a single-user app; tune later if needed.
create index if not exists idx_intents_embedding
  on public.intents using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: match_intents
--   Given a query embedding, return the caller's most similar past completed
--   intents within the last `cutoff_days` days, scored by cosine similarity.
--   SECURITY DEFINER + auth.uid() check ensures users only see their own rows.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.match_intents(
  query_embedding vector(1024),
  match_threshold float default 0.5,
  match_count int default 3,
  cutoff_days int default 90
)
returns table (
  id uuid,
  text text,
  kind text,
  result_summary text,
  completed_at timestamptz,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.text,
    i.kind,
    i.result_summary,
    i.completed_at,
    1 - (i.embedding <=> query_embedding) as similarity
  from public.intents i
  where i.user_id = auth.uid()
    and i.embedding is not null
    and i.status = 'done'
    and i.completed_at >= now() - (cutoff_days || ' days')::interval
    and 1 - (i.embedding <=> query_embedding) > match_threshold
  order by i.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_intents(vector, float, int, int) to authenticated;
