/**
 *   POST /api/academy/auto/autostart   body: { autoStart: boolean }
 * Controls whether the bot arms itself each trading day at 9:15am ET without
 * a manual Start click. Separate from /toggle (which is the "right now"
 * on/off switch) — turning autoStart off does NOT stop a session already
 * running today, it just means tomorrow won't auto-arm.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { AUTO_SEED_CAPITAL } from '@/lib/academy-auto-trader'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { autoStart } = await request.json() as { autoStart?: boolean }

  const { data: existing } = await supabase.from('academy_auto_portfolio').select('user_id').eq('user_id', user.id).maybeSingle()
  if (existing) {
    await supabase.from('academy_auto_portfolio').update({ auto_start: !!autoStart, updated_at: new Date().toISOString() }).eq('user_id', user.id)
  } else {
    await supabase.from('academy_auto_portfolio').insert({ user_id: user.id, cash: AUTO_SEED_CAPITAL, enabled: false, auto_start: !!autoStart })
  }
  return NextResponse.json({ ok: true, autoStart: !!autoStart })
}
