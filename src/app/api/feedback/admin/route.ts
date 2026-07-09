/**
 *   GET   /api/feedback/admin   → owner-only: every user's feedback
 *   PATCH /api/feedback/admin   → owner-only: reply { id, reply }
 *
 * Same isOwnerEmail() + service-role pattern as /api/access-request — the
 * owner-gated route is the only place admin_reply/status is ever set.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isOwnerEmail } from '@/lib/owner'

async function requireOwner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return isOwnerEmail(user?.email) ? user : null
}

export async function GET() {
  const owner = await requireOwner()
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })

  const { data, error } = await admin.from('feedback_requests').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailById = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? '']))
  const out = (data ?? []).map((r) => ({ ...r, email: emailById.get(r.user_id as string) ?? r.user_id }))
  return NextResponse.json(out)
}

export async function PATCH(request: Request) {
  const owner = await requireOwner()
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { id?: string; reply?: string; status?: string }
  const reply = (body.reply ?? '').trim()
  if (!body.id || !reply) return NextResponse.json({ error: 'id and reply are required' }, { status: 400 })

  const { error } = await admin.from('feedback_requests').update({
    admin_reply: reply,
    status: body.status === 'closed' ? 'closed' : 'replied',
    replied_at: new Date().toISOString(),
  }).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
