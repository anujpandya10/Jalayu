import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { runTradingTick, type TickEvent } from '@/lib/trading-engine'

export type { TickEvent }

/** Dashboard tick — skips if server cron ran in the last 50s unless ?force=1 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const force = new URL(req.url).searchParams.get('force') === '1'

  const result = await runTradingTick(supabase, user.id, {
    force,
    // High-frequency mode: 8s minimum between ticks (was 28s).
    // A full tick takes 5-8s; 8s gap prevents overlap while maximizing responsiveness.
    minSecondsSinceLastRun: force ? 0 : 8,
  })

  return NextResponse.json(result)
}
