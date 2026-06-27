import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// How long an unanswered prompt stays worth showing — past this it's just clutter, and
// the stats route already counts a stale unanswered prompt as "missed" on its own.
const PROMPT_WINDOW_MS = 10 * 60_000

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('academy_auto_shadow_feedback').select('*').eq('user_id', user.id)
    .is('answer', null)
    .gte('created_at', new Date(Date.now() - PROMPT_WINDOW_MS).toISOString())
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = body?.id as string | undefined
  const answer = body?.answer as string | undefined
  if (!id || (answer !== 'YES' && answer !== 'NO')) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { error } = await supabase
    .from('academy_auto_shadow_feedback')
    .update({ answer, answered_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
