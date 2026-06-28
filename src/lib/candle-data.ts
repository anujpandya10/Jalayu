/**
 * 1-minute OHLCV candle fetcher.
 *
 * Sources:
 *  • Binance public REST  — crypto (no key, no geo-blocking on Vercel)
 *  • Yahoo Finance chart  — stocks  (1m interval, 1d range)
 *  • Frankfurter daily    — forex   (1-day bars; no intraday, use daily for ATR/trend)
 *
 * All functions return CandleInput[] (oldest → newest) compatible with indicators.ts.
 * On any error they return [] — callers must handle empty arrays gracefully.
 */

import type { CandleInput } from '@/lib/indicators'

// ─────────────────────────────────────────────────────────────────────────────
// CRYPTO — Binance public klines (no API key required)
// ─────────────────────────────────────────────────────────────────────────────

// Map CoinGecko symbol → Binance trading pair
const BINANCE_SYMBOL_MAP: Record<string, string> = {
  BTC : 'BTCUSDT',
  ETH : 'ETHUSDT',
  SOL : 'SOLUSDT',
  BNB : 'BNBUSDT',
  XRP : 'XRPUSDT',
  ADA : 'ADAUSDT',
  DOGE: 'DOGEUSDT',
  AVAX: 'AVAXUSDT',
  DOT : 'DOTUSDT',
  LINK: 'LINKUSDT',
  LTC : 'LTCUSDT',
  UNI : 'UNIUSDT',
  XLM : 'XLMUSDT',
  ATOM: 'ATOMUSDT',
  NEAR: 'NEARUSDT',
}

/** Fetch with a hard timeout so slow/blocked hosts fail fast */
async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<Response | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    return res.ok ? res : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch 1-minute Binance klines for a crypto symbol.
 * Tries Binance US first (accessible from Vercel US), then falls back to global.
 * @param symbol  Display symbol e.g. 'BTC' or full pair 'BTCUSDT'
 * @param limit   Max candles (default 50)
 */
export async function fetchBinanceCandles(
  symbol: string,
  limit = 50,
  interval: '1m' | '5m' | '15m' | '1h' = '1m',
): Promise<CandleInput[]> {
  const pair = BINANCE_SYMBOL_MAP[symbol.toUpperCase()] ??
               (symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`)

  const path = `/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`

  // Try Binance US first (Vercel US servers can reach this), then global
  const res = await fetchWithTimeout(`https://api.binance.us${path}`, 5000)
          ?? await fetchWithTimeout(`https://api.binance.com${path}`, 5000)

  if (!res) return []

  try {
    // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
    const raw = await res.json() as Array<[
      number, string, string, string, string, string, ...unknown[]
    ]>

    return raw.map(([, open, high, low, close, volume]) => ({
      open  : parseFloat(open),
      high  : parseFloat(high),
      low   : parseFloat(low),
      close : parseFloat(close),
      volume: parseFloat(volume),
    }))
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STOCKS — Yahoo Finance chart API (1m interval, 1d range)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch 1-minute bars for a US stock symbol via Yahoo Finance.
 */
// Short-lived in-memory cache so a burst of scans (and overlapping cron ticks
// on a warm instance) don't refetch the same symbol — cuts Yahoo load and the
// 429 rate-limiting that comes with it. Only successful, non-empty results are
// cached, so a rate-limited miss is retried on the next tick.
const yahooCandleCache = new Map<string, { at: number; data: CandleInput[] }>()
const YAHOO_CANDLE_TTL_MS = 45_000

export async function fetchYahooCandles(
  symbol: string,
  interval: '1m' | '5m' | '15m' = '1m',
): Promise<CandleInput[]> {
  const cacheKey = `${symbol}:${interval}`
  const hit = yahooCandleCache.get(cacheKey)
  if (hit && Date.now() - hit.at < YAHOO_CANDLE_TTL_MS) return hit.data

  const range = interval === '1m' ? '1d' : '5d'
  const url   = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    })
    if (!res.ok) return []

    const json = await res.json() as {
      chart?: {
        result?: Array<{
          indicators?: {
            quote?: Array<{
              open  ?: (number | null)[]
              high  ?: (number | null)[]
              low   ?: (number | null)[]
              close ?: (number | null)[]
              volume?: (number | null)[]
            }>
          }
        }>
      }
    }

    const q = json?.chart?.result?.[0]?.indicators?.quote?.[0]
    if (!q?.close) return []

    const opens   = q.open   ?? []
    const closes  = q.close  ?? []
    const highs   = q.high   ?? []
    const lows    = q.low    ?? []
    const volumes = q.volume ?? []

    const candles: CandleInput[] = []
    for (let i = 0; i < closes.length; i++) {
      const c = closes[i];  const h = highs[i]
      const l = lows[i];    const v = volumes[i]
      if (c == null || h == null || l == null) continue
      // open is what makes a candle a candle (body = open→close) — carry it so price-action
      // pattern reading (engulfing, pin bars) has real bodies, not just a close-only line.
      candles.push({ open: opens[i] ?? c, high: h, low: l, close: c, volume: v ?? 0 })
    }

    const result = candles.slice(-50)  // keep last 50 bars
    if (result.length > 0) yahooCandleCache.set(cacheKey, { at: Date.now(), data: result })
    return result
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FOREX — daily bars from Frankfurter (no intraday available on free tier)
// Returns last 20 daily closes as CandleInput — good enough for RSI/ATR trend
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchForexDailyCandles(
  baseCurrency: string,  // e.g. 'EUR'
  days = 25,
): Promise<CandleInput[]> {
  const endDate   = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0]
  const url = `https://api.frankfurter.app/${startDate}..${endDate}?from=USD&to=${baseCurrency}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []

    const json = await res.json() as { rates?: Record<string, Record<string, number>> }
    if (!json.rates) return []

    // Convert to price-in-USD and produce synthetic OHLCV
    // (daily data has no intraday H/L — use close ± 0.1% as proxy)
    const sorted = Object.entries(json.rates).sort(([a], [b]) => a.localeCompare(b))
    const candles: CandleInput[] = sorted.flatMap(([, rateMap]) => {
      const rate = rateMap[baseCurrency]
      if (!rate) return []
      const priceUSD = 1 / rate
      return [{
        open  : priceUSD,    // daily forex has no real open — close proxy keeps bodies tiny (correct: no intraday signal)
        high  : priceUSD * 1.001,
        low   : priceUSD * 0.999,
        close : priceUSD,
        volume: 1_000_000,   // synthetic volume (forex is OTC, no real volume)
      }]
    })

    return candles
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART FETCHER — picks the right source by asset type
// ─────────────────────────────────────────────────────────────────────────────

const FOREX_BASE_MAP: Record<string, string> = {
  EURUSD: 'EUR', GBPUSD: 'GBP', AUDUSD: 'AUD', CADUSD: 'CAD',
  JPYUSD: 'JPY', CHFUSD: 'CHF', NZDUSD: 'NZD', MXNUSD: 'MXN',
  INRUSD: 'INR', BRLUSD: 'BRL',
}

/**
 * Unified candle fetcher — auto-selects source by asset type.
 * Returns [] on failure — callers MUST handle empty.
 */
export async function fetchCandles(
  symbol   : string,
  assetType: 'crypto' | 'stock' | 'forex',
  limit    = 50,
  interval : '1m' | '5m' | '15m' = '1m',
): Promise<CandleInput[]> {
  if (assetType === 'crypto') {
    return fetchBinanceCandles(symbol, limit, interval)
  }

  if (assetType === 'stock') {
    return fetchYahooCandles(symbol, interval)
  }

  if (assetType === 'forex') {
    // Forex only has daily data on our free tier — interval ignored
    const base = FOREX_BASE_MAP[symbol.toUpperCase()] ?? symbol.replace('USD', '')
    return fetchForexDailyCandles(base, 25)
  }

  return []
}
