/**
 *   POST /api/academy/auto/reset
 * Wipes the auto trader's positions/trades/log and resets cash to the seed —
 * turns it off too, so it doesn't immediately start trading again unattended.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { AUTO_SEED_CAPITAL } from '@/lib/academy-auto-trader'

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.from('academy_auto_positions').delete().eq('user_id', user.id)
  await supabase.from('academy_auto_trades').delete().eq('user_id', user.id)
  await supabase.from('academy_auto_log').delete().eq('user_id', user.id)

  const { error } = await supabase
    .from('academy_auto_portfolio')
    .upsert({ user_id: user.id, cash: AUTO_SEED_CAPITAL, enabled: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, cash: AUTO_SEED_CAPITAL })
}
