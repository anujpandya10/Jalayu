/**
 *   GET  /api/modules   → the user's module config ([] = never personalized)
 *   POST /api/modules   → toggle one module { moduleId, enabled }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getUserModules, setModuleEnabled } from '@/lib/user-modules'
import { getGrantedPremiumModuleIds } from '@/lib/user-premium'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [modules, grantedPremium] = await Promise.all([
    getUserModules(supabase, user.id),
    getGrantedPremiumModuleIds(supabase, user.id),
  ])
  return NextResponse.json({
    modules,
    enabled: modules.filter((m) => m.enabled).map((m) => m.module_id),
    grantedPremium,
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
