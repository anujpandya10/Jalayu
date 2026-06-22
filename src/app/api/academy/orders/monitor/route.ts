/**
 *   POST /api/academy/orders/monitor
 * Runs the fill/manage pass for the current user. Polled by the practice desk
 * while it's open; the cron does the same for everyone every minute.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { monitorAcademyOrders } from '@/lib/academy-orders'

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const events = await monitorAcademyOrders(supabase, user.id)
    return NextResponse.json({ events })
  } catch (err) {
    console.error('[academy/monitor]', err)
    return NextResponse.json({ events: [], error: 'monitor failed' }, { status: 200 })
  }
}
