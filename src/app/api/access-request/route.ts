/**
 *   POST /api/access-request   → public: submit a request to join (no auth)
 *   GET  /api/access-request   → owner-only: list all requests
 *
 * Writes go through the service-role admin client (the table has RLS on with no
 * policies), so the browser can never read other people's requests.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isOwnerEmail } from '@/lib/owner'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function POST(request: Request) {
  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as {
    name?: string; email?: string; answers?: Record<string, unknown>
  }
  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  if (!name || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter your name and a valid email.' }, { status: 400 })
  }
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}

  // Don't stack duplicate pending requests for the same email
  const { data: recent } = await admin
    .from('signup_requests').select('status').eq('email', email).order('created_at', { ascending: false }).limit(1)
  if (recent?.[0]?.status === 'pending') {
    return NextResponse.json({ ok: true, message: 'You already have a request in review — hang tight.' })
  }

  const { error } = await admin.from('signup_requests').insert({ name, email, answers })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isOwnerEmail(user?.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })
  const { data, error } = await admin
    .from('signup_requests').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
