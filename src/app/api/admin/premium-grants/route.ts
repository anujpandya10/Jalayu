/**
 *   GET    /api/admin/premium-grants            → owner-only: list all grants
 *   POST   /api/admin/premium-grants             → owner-only: grant { email, moduleId, note? }
 *   DELETE /api/admin/premium-grants             → owner-only: revoke { email, moduleId }
 *
 * Same two-gate pattern as /api/access-request: isOwnerEmail() on the caller's
 * session, then the service-role admin client for the actual read/write (grants
 * table has no write policies — the owner-gated route is the only writer).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { isOwnerEmail } from '@/lib/owner'
import { listPremiumGrants, grantPremiumModule, revokePremiumModule } from '@/lib/user-premium'

async function requireOwner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isOwnerEmail(user?.email)) return null
  return user
}

/** Low user-count app — list-and-filter is proportionate; revisit if this ever needs to scale. */
async function findUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  if (!admin) return null
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const match = data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  return match?.id ?? null
}

export async function GET() {
  const owner = await requireOwner()
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })
  const grants = await listPremiumGrants(admin)

  // Resolve emails for display — the grant rows only store user ids.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const emailById = new Map((data?.users ?? []).map((u) => [u.id, u.email ?? '']))
  const out = grants.map((g) => ({ ...g, email: emailById.get(g.user_id) ?? g.user_id }))
  return NextResponse.json(out)
}

export async function POST(request: Request) {
  const owner = await requireOwner()
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { email?: string; moduleId?: string; note?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !body.moduleId) return NextResponse.json({ error: 'email and moduleId are required' }, { status: 400 })

  const userId = await findUserIdByEmail(admin, email)
  if (!userId) return NextResponse.json({ error: `No user found for ${email}` }, { status: 404 })

  await grantPremiumModule(admin, userId, body.moduleId, owner.id, body.note)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const owner = await requireOwner()
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { email?: string; moduleId?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !body.moduleId) return NextResponse.json({ error: 'email and moduleId are required' }, { status: 400 })

  const userId = await findUserIdByEmail(admin, email)
  if (!userId) return NextResponse.json({ error: `No user found for ${email}` }, { status: 404 })

  await revokePremiumModule(admin, userId, body.moduleId)
  return NextResponse.json({ ok: true })
}
