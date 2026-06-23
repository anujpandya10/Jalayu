/**
 *   GET /api/cron/academy-auto-trader   (Vercel cron, every minute)
 * Runs the Auto Trader for every user who has it enabled, so it keeps
 * trading (and managing stops/targets) even when the tab is closed.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { runAutoTraderTick } from '@/lib/academy-auto-trader'

function verifyCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!verifyCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 })

  const { data: enabledUsers } = await supabase.from('academy_auto_portfolio').select('user_id').eq('enabled', true)

  let processed = 0
  const errors: string[] = []
  for (const row of enabledUsers ?? []) {
    try {
      await runAutoTraderTick(supabase, row.user_id)
      processed++
    } catch (err) {
      errors.push(`${row.user_id}: ${err instanceof Error ? err.message : 'failed'}`)
    }
  }
  return NextResponse.json({ processed, errors })
}
