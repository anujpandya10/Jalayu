/**
 * Intents — the shadow agent's inbox.
 *
 *   POST /api/intents  body: { text: string, kind?: string }
 *     Creates a queued intent and fires the runner in the background via after().
 *     Returns the row immediately so the UI can show "queued" / "running".
 *
 *   GET /api/intents?limit=50
 *     Returns the user's recent intents, newest first, excluding archived.
 */
import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { runResearchIntent } from '@/lib/intent-runners/research'
import { sendPushToUser } from '@/lib/push'

// Allow the runner to finish well within Vercel's 300s default
export const maxDuration = 300

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const kind = typeof body.kind === 'string' ? body.kind : 'research'

  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  if (text.length > 2000) return NextResponse.json({ error: 'text too long' }, { status: 400 })

  const { data: created, error } = await supabase
    .from('intents')
    .insert({ user_id: user.id, text, kind, status: 'queued' })
    .select('*')
    .single()

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
  }

  // Fire-and-forget: run the intent after the response is sent.
  after(async () => {
    await runIntent(created.id, created.text, created.kind)
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

// ── Worker ────────────────────────────────────────────────────────────────────
async function runIntent(intentId: string, text: string, kind: string) {
  // New Supabase client — the request-scoped one in POST() may have been disposed
  const supabase = await createClient()

  // Need the user id for push fan-out (and as a defensive RLS check below)
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
    if (kind !== 'research') {
      throw new Error(`Intent kind "${kind}" not yet supported`)
    }

    const result = await runResearchIntent(text)

    await supabase
      .from('intents')
      .update({
        status: 'done',
        result_md: result.resultMd,
        result_summary: result.resultSummary,
        citations: result.citations,
        model: result.model,
        completed_at: new Date().toISOString(),
      })
      .eq('id', intentId)

    if (userId) {
      const previewBody =
        result.resultSummary && result.resultSummary.length > 0
          ? result.resultSummary
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
