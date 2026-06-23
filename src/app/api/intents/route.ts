/**
 * Intents — the shadow agent's inbox.
 *
 *   POST /api/intents  body: { text: string, kind?: 'research' | 'draft' | 'auto' }
 *     Creates a queued intent. If kind = 'auto' (or omitted), classifies via
 *     Claude Haiku at submission time so the user never has to think about
 *     which runner to invoke. Fires the worker in the background via after().
 *
 *   GET /api/intents?limit=50
 *     Returns the user's recent intents, newest first, excluding archived.
 */
import { NextResponse } from 'next/server'
import { after } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase-server'
import { runResearchIntent } from '@/lib/intent-runners/research'
import { runDraftIntent } from '@/lib/intent-runners/draft'
import { runCodeIntent } from '@/lib/intent-runners/code'
import { sendPushToUser } from '@/lib/push'
import {
  findRelatedMemories,
  storeIntentEmbedding,
  formatMemoriesForPrompt,
} from '@/lib/intent-memory'
import { getUserContext, formatUserContextForPrompt } from '@/lib/user-context'
import { getUserAnthropic, NoAgentError } from '@/lib/user-ai'

// Allow the runner to finish well within Vercel's 300s default
export const maxDuration = 300

type IntentKind = 'research' | 'draft' | 'code'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const requestedKind = typeof body.kind === 'string' ? body.kind : 'auto'

  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  if (text.length > 2000) return NextResponse.json({ error: 'text too long' }, { status: 400 })

  // Resolve kind. Heuristic first (cheap, instant); fall back to Haiku only
  // for ambiguous cases. For now, if the user explicitly specified, trust them.
  const kind: IntentKind =
    requestedKind === 'research' || requestedKind === 'draft' || requestedKind === 'code'
      ? requestedKind
      : detectKindHeuristic(text)

  const { data: created, error } = await supabase
    .from('intents')
    .insert({ user_id: user.id, text, kind, status: 'queued' })
    .select('*')
    .single()

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
  }

  after(async () => {
    await runIntent(created.id, created.text, created.kind as IntentKind)
  })

  return NextResponse.json({ intent: created })
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)))

  const { data, error } = await supabase
    .from('intents')
    .select('*')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ intents: data ?? [] })
}

// ── Kind detection ────────────────────────────────────────────────────────────
const DRAFT_VERBS = [
  'draft', 'write', 'compose', 'reply', 'respond', 'craft', 'rewrite',
  'shorten', 'tighten', 'edit',
]

function detectKindHeuristic(text: string): IntentKind {
  // Code intents are the most specific signal — a github URL is almost
  // always a code-change request. Check first.
  if (/https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/.test(text)) {
    return 'code'
  }
  const first = text.trim().toLowerCase().split(/\s+/, 4).join(' ')
  for (const verb of DRAFT_VERBS) {
    if (first.startsWith(verb + ' ') || first.startsWith(verb + ':')) return 'draft'
  }
  return 'research'
}

// ── Worker ────────────────────────────────────────────────────────────────────
async function runIntent(intentId: string, text: string, kind: IntentKind) {
  const supabase = await createClient()

  const { data: intentRow } = await supabase
    .from('intents')
    .select('user_id')
    .eq('id', intentId)
    .single()
  const userId = intentRow?.user_id as string | undefined

  await supabase
    .from('intents')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', intentId)

  try {
    // Resolve the user's own AI agent — their key, not the platform's.
    const client = userId ? await getUserAnthropic(userId) : await getUserAnthropic('')

    // Context gathering — both lookups in parallel, both best-effort.
    const [memories, userCtx] = await Promise.all([
      findRelatedMemories(supabase, text).catch(() => []),
      userId
        ? getUserContext(supabase, userId).catch(() => null)
        : Promise.resolve(null),
    ])
    const memoryContext = formatMemoriesForPrompt(memories)
    const userContext = userCtx ? formatUserContextForPrompt(userCtx) : ''
    const usedMemoryIds = memories.map((m) => m.id)

    // Dispatch to the right runner
    let resultMd: string
    let resultSummary: string
    let citations: { title: string; url: string }[] | null = null
    let model: string

    if (kind === 'draft') {
      const r = await runDraftIntent(text, memoryContext, userContext, client)
      resultMd = r.resultMd
      resultSummary = r.resultSummary
      model = r.model
    } else if (kind === 'code') {
      const r = await runCodeIntent(text, memoryContext, userContext, client)
      resultMd = r.resultMd
      resultSummary = r.resultSummary
      model = r.model
    } else {
      const r = await runResearchIntent(text, memoryContext, userContext, client)
      resultMd = r.resultMd
      resultSummary = r.resultSummary
      citations = r.citations
      model = r.model
    }

    await supabase
      .from('intents')
      .update({
        status: 'done',
        result_md: resultMd,
        result_summary: resultSummary,
        citations,
        model,
        used_memory_ids: usedMemoryIds,
        completed_at: new Date().toISOString(),
      })
      .eq('id', intentId)

    // Backfill embedding so this intent shows up in future memory lookups
    await storeIntentEmbedding(supabase, intentId, text, resultSummary).catch((e) => {
      console.warn('[intents] embedding backfill failed:', e instanceof Error ? e.message : e)
    })

    if (userId) {
      const previewBody =
        resultSummary && resultSummary.length > 0
          ? resultSummary
          : text.length > 120 ? text.slice(0, 117) + '…' : text
      await sendPushToUser(supabase, userId, {
        title: 'Jalayu — ready for you',
        body: previewBody,
        url: `/dashboard?intent=${intentId}`,
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[intents] runner failed', intentId, message)
    await supabase
      .from('intents')
      .update({
        status: 'failed',
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', intentId)

    if (userId) {
      await sendPushToUser(supabase, userId, {
        title: 'Jalayu — couldn’t finish',
        body: text.length > 100 ? text.slice(0, 97) + '…' : text,
        url: `/dashboard?intent=${intentId}`,
      })
    }
  }
}
