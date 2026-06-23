/**
 *   POST /api/academy/auto/toggle   body: { enabled: boolean }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { AUTO_SEED_CAPITAL } from '@/lib/academy-auto-trader'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { enabled } = await request.json() as { enabled?: boolean }

  const { data: existing } = await supabase.from('academy_auto_portfolio').select('user_id').eq('user_id', user.id).maybeSingle()
  if (existing) {
    await supabase.from('academy_auto_portfolio').update({ enabled: !!enabled, updated_at: new Date().toISOString() }).eq('user_id', user.id)
  } else {
    await supabase.from('academy_auto_portfolio').insert({ user_id: user.id, cash: AUTO_SEED_CAPITAL, enabled: !!enabled })
  }
  return NextResponse.json({ ok: true, enabled: !!enabled })
}
