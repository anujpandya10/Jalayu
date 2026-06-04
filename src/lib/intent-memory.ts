/**
 * Intent memory — Jalayu remembers what you've already asked it.
 *
 *   findRelatedMemories(supabase, text)
 *     embeds `text` and asks Postgres for the top-N most similar past
 *     completed intents within the cutoff window. Returns [] if no
 *     embedding could be produced (no Voyage key) or no match clears
 *     the similarity threshold.
 *
 *   storeIntentEmbedding(supabase, intentId, text, summary)
 *     embeds (text + summary) and writes the vector back to the row
 *     plus an embedded_at timestamp so it becomes searchable.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { embed } from '@/lib/embeddings'

export interface RelatedMemory {
  id: string
  text: string
  kind: string
  result_summary: string | null
  completed_at: string | null
  similarity: number
}

const MATCH_THRESHOLD = 0.55
const MATCH_COUNT = 3
const CUTOFF_DAYS = 90

/**
 * Embed `text` (treated as a query) and return up to MATCH_COUNT past
 * intents whose embedding is above MATCH_THRESHOLD cosine similarity.
 */
export async function findRelatedMemories(
  supabase: SupabaseClient,
  text: string,
): Promise<RelatedMemory[]> {
  let queryEmbedding: number[] | null
  try {
    queryEmbedding = await embed(text, 'query')
  } catch (e) {
    console.warn('[intent-memory] embed for query failed:', e instanceof Error ? e.message : e)
    return []
  }
  if (!queryEmbedding) return []

  const { data, error } = await supabase.rpc('match_intents', {
    query_embedding: queryEmbedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
    cutoff_days: CUTOFF_DAYS,
  })

  if (error) {
    console.warn('[intent-memory] match_intents rpc failed:', error.message)
    return []
  }
  return (data ?? []) as RelatedMemory[]
}

/**
 * Embed and persist the vector for a completed intent so it becomes
 * searchable by future queries. Best-effort: warnings logged, no throw.
 */
export async function storeIntentEmbedding(
  supabase: SupabaseClient,
  intentId: string,
  text: string,
  summary: string | null,
): Promise<void> {
  const composite = summary && summary.length > 0 ? `${text}\n\n${summary}` : text
  let vec: number[] | null
  try {
    vec = await embed(composite, 'document')
  } catch (e) {
    console.warn('[intent-memory] embed for storage failed:', e instanceof Error ? e.message : e)
    return
  }
  if (!vec) return

  const { error } = await supabase
    .from('intents')
    .update({
      // PostgREST accepts a number[] and casts to vector
      embedding: vec,
      embedded_at: new Date().toISOString(),
    })
    .eq('id', intentId)

  if (error) {
    console.warn('[intent-memory] write embedding failed:', error.message)
  }
}

/**
 * Render related memories as a system-prompt block for the runner.
 * Returns empty string when none — caller can concat unconditionally.
 */
export function formatMemoriesForPrompt(memories: RelatedMemory[]): string {
  if (memories.length === 0) return ''
  const lines = memories.map((m) => {
    const when = m.completed_at ? new Date(m.completed_at).toISOString().slice(0, 10) : 'recently'
    const summary = (m.result_summary || '').trim()
    return `- [${when}] "${m.text.slice(0, 200)}"${summary ? `\n  → previous answer: ${summary.slice(0, 300)}` : ''}`
  })
  return `\n\n[YOU'VE WORKED ON THIS PERSON BEFORE — RELATED PAST INTENTS]\nUse this to build on what you said before, reference past context when relevant, and avoid contradicting yourself. Don't recap the past answer unless asked — just stay coherent with it.\n${lines.join('\n')}\n`
}
