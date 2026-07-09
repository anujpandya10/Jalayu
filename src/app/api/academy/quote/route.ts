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
import { getTpSl } from '@/lib/trading-config'
import { resolveRiskProfile, type RiskTier } from '@/lib/risk-profiles'
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

    // Suggested-default stop/target from the user's own risk tier — a convenience pre-fill
    // for the order ticket, never enforced (brackets stay fully user-declared at placeOrder).
    const { data: profileRow } = await supabase.from('profiles').select('risk_profile').eq('id', user.id).maybeSingle()
    const cfg = resolveRiskProfile(profileRow?.risk_profile as RiskTier | undefined)
    const { tp, sl } = getTpSl(signal.setupTag, signal.direction, 'stock', cfg)
    const suggested = signal.direction === 'LONG'
      ? { stopPrice: quote.price * (1 - sl), target1Price: quote.price * (1 + tp / 2), target2Price: quote.price * (1 + tp) }
      : { stopPrice: quote.price * (1 + sl), target1Price: quote.price * (1 - tp / 2), target2Price: quote.price * (1 - tp) }

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
      suggested,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch quote'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
