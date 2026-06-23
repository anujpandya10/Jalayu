/**
 *   POST /api/academy/auto/tick
 * Client-pollable version of the auto trader's tick, for an instant-feeling
 * UI while the Auto Trader tab is open. The per-minute cron runs the exact
 * same function so it keeps working when the tab is closed.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { runAutoTraderTick } from '@/lib/academy-auto-trader'

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await runAutoTraderTick(supabase, user.id)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[academy/auto/tick]', err)
    return NextResponse.json({ ran: false, reason: 'tick failed', events: [] }, { status: 200 })
  }
}
