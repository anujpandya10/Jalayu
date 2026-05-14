import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return NextResponse.json({ error: 'Missing Bearer token' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const body = await req.json()
  if (!body?.consent || body.consent !== true) {
    return NextResponse.json({ error: 'consent: true required' }, { status: 400 })
  }
  const domain = typeof body.domain === 'string' ? body.domain.trim().slice(0, 200) : ''
  if (!domain) {
    return NextResponse.json({ error: 'domain required' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]
  const minutes = typeof body.durationMinutes === 'number' ? Math.max(0, Math.min(24 * 60, body.durationMinutes)) : null

  const { error } = await supabase.from('activity_logs').insert({
    user_id: user.id,
    date: today,
    app_category: domain,
    duration_minutes: minutes,
    notes: 'extension_v1',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
