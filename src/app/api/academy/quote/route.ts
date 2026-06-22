/**
 *   GET /api/academy/quote?symbol=AAPL
 *
 * Live quote + the engine's own real-time signal read for that ticker, so
 * the order ticket can show "current signal: VWAP_LONG, score 4.2" before
 * the student commits. Works for any ticker — no universe restriction.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getQuote } from '@/lib/yahoo-finance'
import { scoreAssetFull } from '@/lib/trading-signals'
import type { AssetData } from '@/lib/market-data'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const symbol = req.nextUrl.searchParams.get('symbol')
  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 })
  }

  try {
    const quote = await getQuote(symbol.toUpperCase())
    const asset: AssetData = {
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change24h: quote.changePct,
      change7d: 0,
      assetType: 'stock',
    }
    const signal = await scoreAssetFull(asset)
    return NextResponse.json({
      quote,
      signal: {
        score: signal.score,
        direction: signal.direction,
        action: signal.action,
        setupTag: signal.setupTag,
        reason: signal.reason,
        indicators: signal.indicators,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch quote'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
