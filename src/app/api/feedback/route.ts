/**
 *   GET  /api/feedback   → the caller's own submissions + any reply
 *   POST /api/feedback   → submit { category, message }
 *
 * Plain RLS-scoped reads/writes — feedback_requests' "Users manage own
 * feedback" policy already restricts everything to auth.uid() = user_id, so
 * no admin client is needed here (unlike signup_requests, which is pre-auth).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const CATEGORIES = new Set(['general', 'bug', 'feature', 'support'])

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error: qErr } = await supabase
    .from('feedback_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { category?: string; message?: string }
  const category = CATEGORIES.has(body.category ?? '') ? body.category! : 'general'
  const message = (body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

  const { error: insErr } = await supabase.from('feedback_requests').insert({ user_id: user.id, category, message })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
