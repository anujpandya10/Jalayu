// Unified market data: Binance (crypto, no key) + Yahoo Finance (stocks)

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface AssetQuote {
  symbol: string
  name: string
  price: number
  assetType: 'crypto' | 'stock'
  candles: Candle[] // last 50 hourly (crypto) or daily (stock)
}

// CRYPTO — Binance public API, no key, 1-hour candles
const CRYPTO_SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', name: 'Ethereum' },
  { symbol: 'SOLUSDT', name: 'Solana' },
  { symbol: 'BNBUSDT', name: 'BNB' },
  { symbol: 'XRPUSDT', name: 'XRP' },
  { symbol: 'ADAUSDT', name: 'Cardano' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin' },
  { symbol: 'AVAXUSDT', name: 'Avalanche' },
]

// STOCKS — Yahoo Finance, daily candles (market hours only)
const STOCK_SYMBOLS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'NVDA', name: 'Nvidia' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
  { symbol: 'AMZN', name: 'Amazon' },
]

async function fetchBinanceCandles(binanceSymbol: string): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=50`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []
  const data = await res.json() as unknown[][]
  return data.map((k) => ({
    time: Number(k[0]),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
  }))
}

interface YahooResult {
  meta?: { regularMarketPrice?: number; shortName?: string }
  timestamp?: number[]
  indicators?: {
    quote?: Array<{
      open?: number[]
      high?: number[]
      low?: number[]
      close?: number[]
      volume?: number[]
    }>
  }
}

interface YahooChart {
  chart?: {
    result?: YahooResult[]
  }
}

async function fetchYahooCandles(yahooSymbol: string): Promise<{ candles: Candle[]; price: number; name: string }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=3mo`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return { candles: [], price: 0, name: yahooSymbol }
  const json = await res.json() as YahooChart
  const result = json?.chart?.result?.[0]
  if (!result) return { candles: [], price: 0, name: yahooSymbol }
  const price = result.meta?.regularMarketPrice ?? 0
  const name = result.meta?.shortName ?? yahooSymbol
  const times = result.timestamp ?? []
  const q = result.indicators?.quote?.[0]
  const candles: Candle[] = times.map((t, i) => ({
    time: t * 1000,
    open: q?.open?.[i] ?? 0,
    high: q?.high?.[i] ?? 0,
    low: q?.low?.[i] ?? 0,
    close: q?.close?.[i] ?? 0,
    volume: q?.volume?.[i] ?? 0,
  })).filter((c) => c.close > 0)
  return { candles, price, name }
}

export function isUsMarketOpen(): boolean {
  const now = new Date()
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false
  const total = now.getUTCHours() * 60 + now.getUTCMinutes()
  return total >= 13 * 60 + 30 && total < 20 * 60
}

export async function getAllAssets(): Promise<AssetQuote[]> {
  const results: AssetQuote[] = []

  // Always fetch crypto
  const cryptoFetches = CRYPTO_SYMBOLS.map(async ({ symbol, name }) => {
    try {
      const candles = await fetchBinanceCandles(symbol)
      if (candles.length < 20) return
      const price = candles[candles.length - 1].close
      results.push({ symbol, name, price, assetType: 'crypto', candles })
    } catch { /* skip */ }
  })

  const fetches: Promise<void>[] = [...cryptoFetches]

  // Fetch stocks only during market hours
  if (isUsMarketOpen()) {
    const stockFetches = STOCK_SYMBOLS.map(async ({ symbol, name }) => {
      try {
        const { candles, price, name: fetchedName } = await fetchYahooCandles(symbol)
        if (candles.length < 20 || price === 0) return
        results.push({ symbol, name: fetchedName || name, price, assetType: 'stock', candles })
      } catch { /* skip */ }
    })
    fetches.push(...stockFetches)
  }

  await Promise.allSettled(fetches)
  return results
}
