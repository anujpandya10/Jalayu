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
    minSecondsSinceLastRun: force ? 0 : 50,
  })

  return NextResponse.json(result)
}
