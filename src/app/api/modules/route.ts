/**
 *   GET  /api/modules   → the user's module config ([] = never personalized)
 *   POST /api/modules   → toggle one module { moduleId, enabled }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserModules, setModuleEnabled } from '@/lib/user-modules'
import { getGrantedPremiumModuleIds, resolvePremiumAccess } from '@/lib/user-premium'
import { MODULE_REGISTRY } from '@/lib/modules-registry'
import { isOwnerEmail } from '@/lib/owner'

const ALL_PREMIUM_IDS = MODULE_REGISTRY.filter((m) => m.tier === 'premium').map((m) => m.id)

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isOwner = isOwnerEmail(user.email)
  const [modules, explicitGrants, trialEndsAt] = await Promise.all([
    getUserModules(supabase, user.id),
    getGrantedPremiumModuleIds(supabase, user.id),
    // Defensive: if migration 047 hasn't been applied yet the column is missing and the
    // query errors — treat that as "no trial" rather than 500-ing the whole nav.
    supabase.from('profiles').select('premium_trial_ends_at').eq('id', user.id).maybeSingle()
      .then((r) => (!r.error && r.data ? (r.data.premium_trial_ends_at as string | null) : null)),
  ])

  const access = resolvePremiumAccess({ isOwner, explicitGrants, trialEndsAt, allPremiumIds: ALL_PREMIUM_IDS })

  return NextResponse.json({
    modules,
    enabled: modules.filter((m) => m.enabled).map((m) => m.module_id),
    // "grantedPremium" = permanently unlocked (owner or explicit grant). Trial access is
    // conveyed separately so the nav can badge it distinctly instead of as a plain unlock.
    grantedPremium: access.unlockedPremiumIds,
    trial: { active: access.trialActive, endsAt: access.trialEndsAt, daysLeft: access.trialDaysLeft },
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { moduleId?: string; enabled?: boolean }
  if (!body.moduleId || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'moduleId and enabled are required' }, { status: 400 })
  }

  await setModuleEnabled(supabase, user.id, body.moduleId, body.enabled)
  const modules = await getUserModules(supabase, user.id)
  return NextResponse.json({ ok: true, enabled: modules.filter((m) => m.enabled).map((m) => m.module_id) })
}
