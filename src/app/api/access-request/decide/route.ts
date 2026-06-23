/**
 *   POST /api/access-request/decide  (owner-only)
 *   body: { id, decision: 'approved' | 'declined', note? }
 *
 * Approve → Supabase sends the invite (set-password) email = their sign-up link.
 * Decline → just records it; the owner sends a decline note via a prefilled
 * mailto on the client (no email provider needed).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isOwnerEmail } from '@/lib/owner'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isOwnerEmail(user?.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })

  const { id, decision, note } = await request.json() as { id?: string; decision?: string; note?: string }
  if (!id || (decision !== 'approved' && decision !== 'declined')) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const { data: reqRow } = await admin.from('signup_requests').select('*').eq('id', id).single()
  if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  let invited = false
  let inviteError: string | null = null
  if (decision === 'approved') {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jalayu.com'
    const { error } = await admin.auth.admin.inviteUserByEmail(reqRow.email, { redirectTo: `${siteUrl}/onboarding` })
    if (error) inviteError = error.message
    else invited = true
  }

  await admin.from('signup_requests')
    .update({ status: decision, decision_note: note ?? null, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ok: true, invited, inviteError })
}
