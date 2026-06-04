/**
 *   GET   /api/letter/today  → today's letter or { letter: null }
 *   POST  /api/letter/today  → generates today's letter if missing, returns it
 *   PATCH /api/letter/today  → marks today's letter dismissed
 *
 * Date key uses the server's local day. Good enough until per-user
 * timezones are stored on profiles.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { generateDailyLetter } from '@/lib/letter-generator'

export const maxDuration = 60

function todayDateKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('daily_letters')
    .select('*')
    .eq('user_id', user.id)
    .eq('letter_date', todayDateKey())
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ letter: data ?? null })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dateKey = todayDateKey()

  // Idempotent: if today's letter already exists, return it
  const existing = await supabase
    .from('daily_letters')
    .select('*')
    .eq('user_id', user.id)
    .eq('letter_date', dateKey)
    .maybeSingle()

  if (existing.data) {
    return NextResponse.json({ letter: existing.data, generated: false })
  }

  let result
  try {
    result = await generateDailyLetter(supabase, user.id)
  } catch (err) {
    console.error('[letter] generation failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'generation failed' },
      { status: 500 },
    )
  }

  const { data: created, error: insertErr } = await supabase
    .from('daily_letters')
    .insert({
      user_id: user.id,
      letter_date: result.letterDate,
      text_md: result.textMd,
      model: result.model,
    })
    .select('*')
    .single()

  if (insertErr || !created) {
    // Race: someone else inserted (unlikely, but possible if the same
    // user opens two tabs at the same moment). Re-fetch.
    const refetched = await supabase
      .from('daily_letters')
      .select('*')
      .eq('user_id', user.id)
      .eq('letter_date', dateKey)
      .maybeSingle()
    if (refetched.data) return NextResponse.json({ letter: refetched.data, generated: false })
    return NextResponse.json({ error: insertErr?.message ?? 'insert failed' }, { status: 500 })
  }

  return NextResponse.json({ letter: created, generated: true })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (body.dismissed !== true) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('daily_letters')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('letter_date', todayDateKey())
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ letter: data })
}
