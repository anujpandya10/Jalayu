/**
 *   GET /api/academy/candles?symbol=AAPL&interval=1m
 *
 * Real OHLC + timestamps for the cockpit chart. Fetches Yahoo Finance
 * directly (the shared fetchCandles() helper drops `open` and timestamps,
 * which a candlestick chart needs), for any stock ticker.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const ALLOWED_INTERVALS = new Set(['1m', '5m', '15m', '1d'])
const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Accept: 'application/json',
}

interface ChartBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const symbol = (req.nextUrl.searchParams.get('symbol') || '').toUpperCase().trim()
  if (!/^[A-Z.]{1,10}$/.test(symbol)) {
    return NextResponse.json({ error: 'Enter a valid ticker symbol' }, { status: 400 })
  }
  const interval = req.nextUrl.searchParams.get('interval') || '1m'
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: 'Invalid interval' }, { status: 400 })
  }
  const range = interval === '1m' ? '1d' : interval === '1d' ? '6mo' : '5d'

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
    const res = await fetch(url, { headers: YF_HEADERS, cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo returned ${res.status} for ${symbol}` }, { status: 502 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any
    const result = json?.chart?.result?.[0]
    if (!result) {
      return NextResponse.json({ error: `No chart data for ${symbol}` }, { status: 404 })
    }

    const timestamps: number[] = result.timestamp ?? []
    const q = result.indicators?.quote?.[0] ?? {}
    const opens: (number | null)[] = q.open ?? []
    const highs: (number | null)[] = q.high ?? []
    const lows: (number | null)[] = q.low ?? []
    const closes: (number | null)[] = q.close ?? []
    const volumes: (number | null)[] = q.volume ?? []

    const candles: ChartBar[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const o = opens[i], h = highs[i], l = lows[i], c = closes[i]
      if (o == null || h == null || l == null || c == null) continue
      candles.push({
        time: timestamps[i],
        open: o, high: h, low: l, close: c,
        volume: volumes[i] ?? 0,
      })
    }

    const meta = result.meta ?? {}
    const price: number = meta.regularMarketPrice ?? candles[candles.length - 1]?.close ?? 0
    const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? price
    const changePct = prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : 0

    return NextResponse.json({
      symbol,
      interval,
      asset: {
        symbol,
        name: meta.longName ?? meta.shortName ?? symbol,
        price,
        change24h: changePct,
      },
      candles: candles.slice(-300),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch candles'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
