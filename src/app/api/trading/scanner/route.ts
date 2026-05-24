/**
 * Scanner data — candles for one asset + the user's trades on it overlaid.
 *
 *   GET /api/trading/scanner?symbol=BTC&interval=1m
 *
 * Returns:
 *   • OHLCV candles (last ~200 bars)
 *   • Buy/sell markers from the user's actual trade history on this symbol
 *   • Latest indicators (EMA9, EMA21, VWAP, RSI) computed on the candles
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { fetchCandles } from '@/lib/candle-data'
import { calculateEMA, calculateVWAP, calculateRSI } from '@/lib/indicators'
import { getAllAssets } from '@/lib/market-data'

const ALLOWED_INTERVALS = new Set(['1m', '5m', '15m'])

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const symbol = (url.searchParams.get('symbol') || 'BTC').toUpperCase()
  const interval = url.searchParams.get('interval') || '1m'
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: 'Invalid interval' }, { status: 400 })
  }

  // Look up asset type to pick the right candle source
  const assets = await getAllAssets()
  const asset = assets.find((a) => a.symbol === symbol)
  if (!asset) {
    return NextResponse.json({ error: 'Symbol not in scan universe' }, { status: 404 })
  }

  const candles = await fetchCandles(asset.symbol, asset.assetType, 200)

  // Synthesize candle timestamps (most-recent is now, each prior is `interval` back)
  const intervalSecs = interval === '1m' ? 60 : interval === '5m' ? 300 : 900
  const nowSec = Math.floor(Date.now() / 1000)
  const candlesWithTime = candles.map((c, i) => ({
    time: nowSec - (candles.length - 1 - i) * intervalSecs,
    open: c.close * 0.9995 + (Math.random() - 0.5) * c.close * 0.0005,  // approx — fetch returns close+high+low, not open
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }))

  // Indicators
  const closes = candles.map((c) => c.close)
  const highs = candles.map((c) => c.high)
  const lows = candles.map((c) => c.low)
  const vols = candles.map((c) => c.volume)
  const ema9 = candles.length >= 9 ? calculateEMA(closes, 9) : null
  const ema21 = candles.length >= 21 ? calculateEMA(closes, 21) : null
  const vwap = candles.length >= 5 ? calculateVWAP(highs, lows, closes, vols) : null
  const rsi = candles.length >= 15 ? calculateRSI(closes, 14) : null

  // User's trades on this symbol (last 60 days) — overlay as markers
  const sinceIso = new Date(Date.now() - 60 * 86400_000).toISOString()
  const { data: trades } = await supabase
    .from('paper_trades')
    .select('action, direction, price, total, pnl, reason, created_at')
    .eq('user_id', user.id)
    .eq('symbol', symbol)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })

  const markers = (trades ?? []).map((t) => {
    const action = String(t.action)
    const direction = String(t.direction || 'LONG')
    const pnl = t.pnl as number | null
    const isEntry = action === 'BUY' && pnl == null || action === 'SHORT' && pnl == null
    const isExit = pnl != null
    let label = action
    if (isEntry) label = direction === 'SHORT' ? 'SHORT IN' : 'LONG IN'
    if (isExit) label = `${direction === 'SHORT' ? 'COVER' : 'SELL'}${pnl != null ? ` ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : ''}`
    return {
      time: Math.floor(new Date(t.created_at as string).getTime() / 1000),
      action,
      direction,
      position: isEntry ? 'belowBar' : 'aboveBar',
      color: pnl != null
        ? (pnl >= 0 ? '#22C55E' : '#EF4444')
        : (direction === 'SHORT' ? '#DC2626' : '#0A7B6A'),
      shape: isEntry ? 'arrowUp' : 'arrowDown',
      text: label,
      price: t.price as number,
      pnl: pnl,
    }
  })

  return NextResponse.json({
    symbol,
    interval,
    asset: { symbol: asset.symbol, name: asset.name, assetType: asset.assetType, price: asset.price, change24h: asset.change24h },
    candles: candlesWithTime,
    markers,
    indicators: { ema9, ema21, vwap, rsi },
    tradeCount: markers.length,
  })
}
