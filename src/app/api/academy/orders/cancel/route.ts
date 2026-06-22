/**
 *   POST /api/academy/orders/cancel  body: { id }
 * Cancels a pending limit order (no cash was reserved, so nothing to refund).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await request.json() as { id?: string }
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('academy_orders')
    .update({ status: 'CANCELLED', note: 'Cancelled by user' })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'PENDING')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
