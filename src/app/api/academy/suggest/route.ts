/**
 *   GET /api/academy/suggest?symbol=AAPL&direction=LONG
 *
 * "Should I take this, and where?" — reads the live engine signal + indicators
 * and returns a bullish/neutral/bearish verdict, ATR-based stop/target levels,
 * and a plain-English warning if the setup is fighting the read. Deterministic
 * (no AI call → instant, free).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getQuote } from '@/lib/yahoo-finance'
import { scoreAssetFull } from '@/lib/trading-signals'
import type { AssetData } from '@/lib/market-data'

const r2 = (n: number) => Math.round(n * 100) / 100

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const symbol = (req.nextUrl.searchParams.get('symbol') || '').toUpperCase().trim()
  if (!/^[A-Z.]{1,10}$/.test(symbol)) return NextResponse.json({ error: 'Enter a valid ticker' }, { status: 400 })
  const direction = req.nextUrl.searchParams.get('direction') === 'SHORT' ? 'SHORT' : 'LONG'

  let quote
  try { quote = await getQuote(symbol) } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Quote failed' }, { status: 502 })
  }
  const asset: AssetData = { symbol: quote.symbol, name: quote.name, price: quote.price, change24h: quote.changePct, change7d: 0, assetType: 'stock' }
  const signal = await scoreAssetFull(asset)
  const ind = signal.indicators
  const price = quote.price

  // ATR-based level sizing; fall back to ~1% of price if no candle data.
  const atr = ind && ind.atr > 0 ? ind.atr : price * 0.01
  const isLong = direction === 'LONG'
  const stop = r2(isLong ? price - 1.5 * atr : price + 1.5 * atr)
  const target1 = r2(isLong ? price + 1.5 * atr : price - 1.5 * atr)   // ~1:1 — take half here
  const target2 = r2(isLong ? price + 3.0 * atr : price - 3.0 * atr)   // ~2:1 — runner

  // Verdict aligned to the requested side
  const sideScore = isLong ? signal.score : -signal.score
  const verdict = sideScore >= 4 ? 'bullish' : sideScore <= -4 ? 'bearish' : 'neutral'
  const aligned = verdict === 'bullish'

  let warning: string | null = null
  if (!aligned && ind) {
    const emaTrend = ind.ema9 >= ind.ema21 ? 'EMA9 above EMA21 (up)' : 'EMA9 below EMA21 (down)'
    const want = isLong
      ? 'For a long, you\'d want EMA9 back above EMA21, RSI rising through ~45–55, and price holding above VWAP.'
      : 'For a short, you\'d want EMA9 below EMA21, RSI rolling down from overbought, and price rejecting VWAP from above.'
    warning = `The read isn't ${isLong ? 'bullish' : 'bearish'} right now: engine score ${signal.score.toFixed(1)} (${signal.setupTag}), RSI ${ind.rsi.toFixed(0)}, ${emaTrend}. A ${isLong ? 'long' : 'short'} bracket here is fighting the tape. ${want}`
  } else if (!aligned) {
    warning = `Not enough candle data to confirm a ${isLong ? 'bullish' : 'bearish'} read for ${symbol} right now — size down or wait for the market to be open.`
  }

  return NextResponse.json({
    symbol, direction, price,
    verdict, aligned,
    score: signal.score, setupTag: signal.setupTag, reason: signal.reason,
    rsi: ind?.rsi ?? null,
    atr: r2(atr),
    suggested: { stop, target1, target2 },
    warning,
  })
}
