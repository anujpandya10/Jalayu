/**
 *   GET /api/academy/account → Webull-style account summary
 * Net value, buying power, day-trade BP, today's/total P&L, day-trade count, PDT.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { computeAccount } from '@/lib/academy-account'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const account = await computeAccount(supabase, user.id)
    return NextResponse.json(account)
  } catch (err) {
    console.error('[academy/account]', err)
    return NextResponse.json({ error: 'account compute failed' }, { status: 500 })
  }
}
