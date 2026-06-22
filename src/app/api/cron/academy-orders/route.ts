/**
 *   GET /api/cron/academy-orders   (Vercel cron, every minute)
 * Runs the academy order monitor for every user who has a pending order or a
 * managed bracket position — so brackets fill/exit even when the app is closed.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { monitorAcademyOrders } from '@/lib/academy-orders'

function verifyCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!verifyCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 })

  // Only users with something to manage
  const [{ data: orderUsers }, { data: posUsers }] = await Promise.all([
    supabase.from('academy_orders').select('user_id').eq('status', 'PENDING'),
    supabase.from('academy_positions').select('user_id').eq('managed', true),
  ])
  const userIds = [...new Set([
    ...(orderUsers ?? []).map((r) => r.user_id as string),
    ...(posUsers ?? []).map((r) => r.user_id as string),
  ])]

  let processed = 0
  let actions = 0
  for (const userId of userIds) {
    try {
      const events = await monitorAcademyOrders(supabase, userId)
      actions += events.length
      processed++
    } catch (err) {
      console.warn('[cron/academy-orders] failed for', userId, err)
    }
  }
  return NextResponse.json({ processed, actions })
}
