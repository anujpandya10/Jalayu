/**
 *   GET  /api/academy/orders   → pending limit orders
 *   POST /api/academy/orders   → place a market/limit order, optionally bracketed
 *
 * Body (POST): {
 *   symbol, direction: 'LONG'|'SHORT', shares,
 *   entryKind: 'MARKET'|'LIMIT', limitPrice?,
 *   stopPrice?, target1Price?, target2Price?   // bracket plan
 * }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { placeOrder, type PlaceOrderParams } from '@/lib/academy-orders'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Return the recent order book (all statuses) so the client can show
  // Working / Filled / Canceled tabs.
  const { data, error } = await supabase
    .from('academy_orders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as Partial<PlaceOrderParams>
  if (!body.symbol || !body.direction || !body.shares || !body.orderType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const result = await placeOrder(supabase, user.id, {
    symbol: body.symbol,
    direction: body.direction === 'SHORT' ? 'SHORT' : 'LONG',
    shares: Number(body.shares),
    orderType: body.orderType,
    tif: body.tif === 'GTC' ? 'GTC' : 'DAY',
    limitPrice: body.limitPrice ?? null,
    stopTrigger: body.stopTrigger ?? null,
    stopPrice: body.stopPrice ?? null,
    target1Price: body.target1Price ?? null,
    target2Price: body.target2Price ?? null,
    overrideGate: body.overrideGate ?? false,
  })

  if (!result.ok) return NextResponse.json({ error: result.error, gate: result.gate, needsOverride: result.needsOverride }, { status: result.status })
  return NextResponse.json({ ok: true, filled: result.filled, message: result.message, gate: result.gate })
}
