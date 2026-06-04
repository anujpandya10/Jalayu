/**
 * Embeddings via Voyage AI — Anthropic's recommended embedding provider
 * to pair with Claude. Single helper that no-ops gracefully when the
 * VOYAGE_API_KEY env var is missing so memory features degrade to
 * "no enrichment" instead of breaking the runner.
 *
 *   voyage-3   → 1024-dim, balanced quality/cost
 *
 * If you'd rather use OpenAI / Cohere / a local model, the embed()
 * signature stays the same — just swap the body.
 */

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-3'

interface VoyageResponse {
  object: string
  data: { object: string; embedding: number[]; index: number }[]
  model: string
  usage: { total_tokens: number }
}

/**
 * Embed a string. Returns null if VOYAGE_API_KEY isn't configured
 * (callers treat this as "no memory enrichment available, proceed").
 *
 * Throws on actual API errors so the worker can log them — silent
 * "everything's fine" failures are worse than visible ones.
 */
export async function embed(text: string, kind: 'query' | 'document' = 'document'): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) return null

  const trimmed = text.trim().slice(0, 8000) // voyage limits ~16k tokens; this is well under
  if (!trimmed) return null

  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: [trimmed],
      model: VOYAGE_MODEL,
      input_type: kind === 'query' ? 'query' : 'document',
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Voyage embed failed (${res.status}): ${errText.slice(0, 200)}`)
  }

  const data = (await res.json()) as VoyageResponse
  const vec = data.data?.[0]?.embedding
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('Voyage returned no embedding')
  }
  return vec
}

/**
 * Format a JS number[] as the literal Postgres vector syntax pgvector expects.
 * Supabase doesn't natively serialise vectors over PostgREST, so we send a string.
 */
export function vectorLiteral(vec: number[]): string {
  // pgvector wants e.g. "[0.1,0.2,...]"
  return `[${vec.join(',')}]`
}
