/**
 *   POST /api/academy/reset
 *
 * Wipes the student's practice trades/positions/reviews and resets cash to
 * the seed constant. A practice account should be resettable without
 * asking anyone to do it by hand.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { ACADEMY_SEED_CAPITAL } from '@/lib/academy-config'

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await supabase.from('academy_positions').delete().eq('user_id', user.id)
  // academy_trade_reviews cascades automatically via its FK to academy_trades
  await supabase.from('academy_trades').delete().eq('user_id', user.id)

  const { error } = await supabase
    .from('academy_portfolio')
    .upsert({ user_id: user.id, cash: ACADEMY_SEED_CAPITAL, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, cash: ACADEMY_SEED_CAPITAL })
}
