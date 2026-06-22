/**
 *   POST /api/academy/positions/manage
 *   body: { symbol, stopPrice?, target1Price?, target2Price?, trailPercent? }
 *
 * Attach (or update) protective exits on a position you already hold — a
 * stop-loss, take-profit targets, and/or a trailing stop. Flips the position
 * to "managed" so the monitor + cron handle the exits.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getQuote } from '@/lib/yahoo-finance'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    symbol?: string
    stopPrice?: number | null
    target1Price?: number | null
    target2Price?: number | null
    trailPercent?: number | null
  }
  const symbol = (body.symbol ?? '').toUpperCase().trim()
  if (!symbol) return NextResponse.json({ error: 'Missing symbol' }, { status: 400 })

  const { data: pos } = await supabase
    .from('academy_positions').select('*').eq('user_id', user.id).eq('symbol', symbol).maybeSingle()
  if (!pos) return NextResponse.json({ error: `No open position in ${symbol}` }, { status: 404 })

  // Seed the trailing anchor at the current price when a trail is set
  let trailAnchor: number | null = pos.trail_anchor ?? null
  if (body.trailPercent != null && body.trailPercent > 0) {
    try { trailAnchor = (await getQuote(symbol)).price } catch { trailAnchor = Number(pos.avg_entry_price) }
  }

  const update: Record<string, unknown> = {
    managed: true,
    original_shares: pos.original_shares ?? pos.shares,
    stop_price: body.stopPrice ?? pos.stop_price ?? null,
    target1_price: body.target1Price ?? pos.target1_price ?? null,
    target2_price: body.target2Price ?? pos.target2_price ?? null,
    trail_percent: body.trailPercent ?? null,
    trail_anchor: trailAnchor,
  }

  const { error } = await supabase.from('academy_positions').update(update).eq('id', pos.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
