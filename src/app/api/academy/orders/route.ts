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

  const { data, error } = await supabase
    .from('academy_orders')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as Partial<PlaceOrderParams>
  if (!body.symbol || !body.direction || !body.shares || !body.entryKind) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const result = await placeOrder(supabase, user.id, {
    symbol: body.symbol,
    direction: body.direction === 'SHORT' ? 'SHORT' : 'LONG',
    shares: Number(body.shares),
    entryKind: body.entryKind === 'LIMIT' ? 'LIMIT' : 'MARKET',
    limitPrice: body.limitPrice ?? null,
    stopPrice: body.stopPrice ?? null,
    target1Price: body.target1Price ?? null,
    target2Price: body.target2Price ?? null,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, filled: result.filled, message: result.message })
}
