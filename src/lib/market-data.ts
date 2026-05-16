/**
 * Market data — CoinGecko (crypto, no key, no geo-blocking) + Yahoo Finance (stocks, market hours)
 *              + Frankfurter API (forex, free, no key, real exchange rates)
 */

export interface AssetData {
  symbol: string      // e.g. BTC or AAPL or EURUSD
  coinId?: string     // CoinGecko id, e.g. "bitcoin"
  name: string
  price: number
  change24h: number   // % change last 24h
  change7d: number    // % change last 7d
  assetType: 'crypto' | 'stock' | 'forex'
  isPumpCandidate?: boolean  // true if big gainer / historically volatile pump stock
}

// Legacy Candle type kept so existing imports don't break
export interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number
}

// ── CoinGecko ids → display symbols ──────────────────────────────────────────
const CRYPTO_LIST: { id: string; symbol: string; name: string }[] = [
  { id: 'bitcoin',       symbol: 'BTC',  name: 'Bitcoin'   },
  { id: 'ethereum',      symbol: 'ETH',  name: 'Ethereum'  },
  { id: 'solana',        symbol: 'SOL',  name: 'Solana'    },
  { id: 'binancecoin',   symbol: 'BNB',  name: 'BNB'       },
  { id: 'ripple',        symbol: 'XRP',  name: 'XRP'       },
  { id: 'cardano',       symbol: 'ADA',  name: 'Cardano'   },
  { id: 'dogecoin',      symbol: 'DOGE', name: 'Dogecoin'  },
  { id: 'avalanche-2',   symbol: 'AVAX', name: 'Avalanche' },
  { id: 'polkadot',      symbol: 'DOT',  name: 'Polkadot'  },
  { id: 'chainlink',     symbol: 'LINK', name: 'Chainlink' },
  { id: 'litecoin',      symbol: 'LTC',  name: 'Litecoin'  },
  { id: 'uniswap',       symbol: 'UNI',  name: 'Uniswap'   },
  { id: 'stellar',       symbol: 'XLM',  name: 'Stellar'   },
  { id: 'cosmos',        symbol: 'ATOM', name: 'Cosmos'    },
  { id: 'near',          symbol: 'NEAR', name: 'NEAR'      },
]

// ── Liquid large-cap stocks + ETFs — steady signals during US session ─────────
const LARGE_CAP_STOCKS: { symbol: string; name: string }[] = [
  { symbol: 'AAPL',  name: 'Apple Inc.' },
  { symbol: 'MSFT',  name: 'Microsoft' },
  { symbol: 'NVDA',  name: 'NVIDIA' },
  { symbol: 'TSLA',  name: 'Tesla' },
  { symbol: 'AMZN',  name: 'Amazon' },
  { symbol: 'META',  name: 'Meta Platforms' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMD',   name: 'AMD' },
  { symbol: 'SPY',   name: 'S&P 500 ETF' },
  { symbol: 'QQQ',   name: 'Nasdaq 100 ETF' },
]

// ── Pump-and-dump watch stocks (historically volatile) ────────────────────────
const PUMP_WATCH_STOCKS: { symbol: string; name: string }[] = [
  { symbol: 'GME',  name: 'GameStop' },
  { symbol: 'AMC',  name: 'AMC Entertainment' },
  { symbol: 'SPCE', name: 'Virgin Galactic' },
  { symbol: 'BBAI', name: 'BigBear.ai' },
  { symbol: 'MULN', name: 'Mullen Auto' },
  { symbol: 'FFIE', name: 'Faraday Future' },
  { symbol: 'CLOV', name: 'Clover Health' },
  { symbol: 'SNDL', name: 'Sundial Growers' },
  { symbol: 'MVIS', name: 'MicroVision' },
  { symbol: 'KOSS', name: 'Koss Corporation' },
  { symbol: 'NAKD', name: 'Naked Brand' },
  { symbol: 'EXPR', name: 'Express Inc' },
  { symbol: 'BBBY', name: 'Bed Bath Beyond' },
  { symbol: 'NKLA', name: 'Nikola Corp' },
  { symbol: 'RIDE', name: 'Lordstown Motors' },
]

// ── Forex pairs — always active 24/7 (except weekends when spreads widen) ─────
const FOREX_PAIRS: { symbol: string; name: string; base: string }[] = [
  { symbol: 'EURUSD', name: 'Euro / USD',           base: 'EUR' },
  { symbol: 'GBPUSD', name: 'British Pound / USD',  base: 'GBP' },
  { symbol: 'AUDUSD', name: 'Australian Dollar',    base: 'AUD' },
  { symbol: 'CADUSD', name: 'Canadian Dollar',      base: 'CAD' },
  { symbol: 'JPYUSD', name: 'Japanese Yen / USD',   base: 'JPY' },
  { symbol: 'CHFUSD', name: 'Swiss Franc / USD',    base: 'CHF' },
  { symbol: 'NZDUSD', name: 'NZD / USD',            base: 'NZD' },
  { symbol: 'MXNUSD', name: 'Mexican Peso / USD',   base: 'MXN' },
  { symbol: 'INRUSD', name: 'Indian Rupee / USD',   base: 'INR' },
  { symbol: 'BRLUSD', name: 'Brazilian Real / USD', base: 'BRL' },
]

export function isUsMarketOpen(): boolean {
  const now = new Date()
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false
  const total = now.getUTCHours() * 60 + now.getUTCMinutes()
  return total >= 13 * 60 + 30 && total < 20 * 60
}

export function isPremarket(): boolean {
  const now = new Date()
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false
  const total = now.getUTCHours() * 60 + now.getUTCMinutes()
  return total >= 8 * 60 && total < 13 * 60 + 30
}

// ── CoinGecko — one API call returns ALL crypto prices + changes ──────────────
async function fetchCryptoPrices(): Promise<AssetData[]> {
  const ids = CRYPTO_LIST.map((c) => c.id).join(',')
  const url =
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_7d_change=true`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('[market-data] CoinGecko HTTP', res.status)
      return []
    }
    const json = await res.json() as Record<string, {
      usd?: number; usd_24h_change?: number; usd_7d_change?: number
    }>
    return CRYPTO_LIST.flatMap(({ id, symbol, name }) => {
      const d = json[id]
      if (!d?.usd) return []
      return [{
        symbol, coinId: id, name,
        price: d.usd,
        change24h: d.usd_24h_change ?? 0,
        change7d: d.usd_7d_change ?? 0,
        assetType: 'crypto' as const,
        isPumpCandidate: false,
      }]
    })
  } catch (err) {
    console.error('[market-data] CoinGecko fetch failed:', err)
    return []
  }
}

// ── Yahoo Finance for a single stock ─────────────────────────────────────────
export async function fetchStockPrice(symbol: string, fallbackName: string): Promise<AssetData | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' }
    )
    if (!res.ok) return null
    const json = await res.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; shortName?: string } }> }
    }
    const meta = json?.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) return null
    const price = meta.regularMarketPrice
    const prev = meta.previousClose ?? price
    const change24h = prev > 0 ? ((price - prev) / prev) * 100 : 0
    return {
      symbol, name: meta.shortName || fallbackName,
      price,
      change24h,
      change7d: 0,
      assetType: 'stock',
      isPumpCandidate: change24h > 10,
    }
  } catch { return null }
}

// ── Yahoo Finance day gainers screener (pump candidates) ──────────────────────
async function fetchTopGainers(): Promise<AssetData[]> {
  try {
    const url = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=25&fields=symbol,regularMarketPrice,regularMarketChangePercent,regularMarketVolume,marketCap'
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const json = await res.json() as {
      finance?: { result?: Array<{ quotes?: Array<{
        symbol?: string
        shortName?: string
        regularMarketPrice?: number
        regularMarketChangePercent?: number
      }> }> }
    }
    const quotes = json?.finance?.result?.[0]?.quotes ?? []
    return quotes
      .filter((q) => q.regularMarketPrice != null && q.regularMarketChangePercent != null)
      .map((q) => ({
        symbol: q.symbol ?? '',
        name: q.shortName ?? q.symbol ?? '',
        price: q.regularMarketPrice ?? 0,
        change24h: q.regularMarketChangePercent ?? 0,
        change7d: 0,
        assetType: 'stock' as const,
        isPumpCandidate: (q.regularMarketChangePercent ?? 0) > 15,
      }))
      .filter((a) => a.symbol !== '')
  } catch { return [] }
}

// ── Frankfurter API — real forex exchange rates, free, no key ─────────────────
function getYesterdayStr(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  // Skip weekends for Frankfurter (no data on weekends)
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 2) // Sunday → Friday
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1) // Saturday → Friday
  return d.toISOString().split('T')[0]
}

async function fetchForexRates(): Promise<AssetData[]> {
  try {
    const bases = FOREX_PAIRS.map(p => p.base).join(',')

    // Get today's and yesterday's rates for % change
    const [todayRes, yesterdayRes] = await Promise.all([
      fetch(`https://api.frankfurter.app/latest?from=USD&to=${bases}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store',
      }),
      fetch(`https://api.frankfurter.app/${getYesterdayStr()}?from=USD&to=${bases}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store',
      }),
    ])

    if (!todayRes.ok) return []
    const today = await todayRes.json() as { rates: Record<string, number> }
    const yesterday = yesterdayRes.ok ? await yesterdayRes.json() as { rates: Record<string, number> } : null

    const mapped: (AssetData | null)[] = FOREX_PAIRS.map(({ symbol, name, base }) => {
      // Frankfurter gives how many of "base" currency = 1 USD
      // So rate for EUR = how many EUR per USD (e.g. 0.92)
      // Price in USD = 1 / rate (how much 1 EUR costs in USD)
      const todayRate = today.rates[base]
      if (!todayRate) return null

      const priceInUSD = 1 / todayRate  // e.g. 1 EUR = $1.085
      const yesterdayRate = yesterday?.rates[base]
      const change24h = yesterdayRate
        ? ((todayRate - yesterdayRate) / yesterdayRate) * -100  // negative because we inverted
        : 0

      return {
        symbol, name,
        price: parseFloat(priceInUSD.toFixed(5)),
        change24h: parseFloat(change24h.toFixed(4)),
        change7d: 0,
        assetType: 'forex' as const,
        isPumpCandidate: false,
      }
    })
    return mapped.filter((x): x is AssetData => x !== null)
  } catch (err) {
    console.error('[market-data] Forex fetch failed:', err)
    return []
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function getAllAssets(): Promise<AssetData[]> {
  const results: AssetData[] = []

  // Crypto is 24/7 — always fetch
  const crypto = await fetchCryptoPrices()
  results.push(...crypto)

  // Forex is global/24h — always fetch
  const forex = await fetchForexRates()
  results.push(...forex)

  const marketOpen = isUsMarketOpen()
  const premarket = isPremarket()

  if (marketOpen || premarket) {
    // Fetch large-cap + pump-watch stocks in parallel
    const stocksToFetch = [...LARGE_CAP_STOCKS, ...PUMP_WATCH_STOCKS]
    const stockSettled = await Promise.allSettled(
      stocksToFetch.map(({ symbol, name }) => fetchStockPrice(symbol, name))
    )
    for (const r of stockSettled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value)
    }

    if (marketOpen) {
      // Fetch top gainers (pump candidates from screener) — only during market hours
      const gainers = await fetchTopGainers()
      // Deduplicate against already-fetched symbols
      const existingSymbols = new Set(results.map((a) => a.symbol))
      for (const g of gainers) {
        if (!existingSymbols.has(g.symbol)) {
          results.push(g)
          existingSymbols.add(g.symbol)
        }
      }
    }
  }

  const forexCount = results.filter((a) => a.assetType === 'forex').length
  const stockCount = results.filter((a) => a.assetType === 'stock').length
  console.log(`[market-data] fetched ${results.length} assets (${crypto.length} crypto, ${stockCount} stocks, ${forexCount} forex, market=${marketOpen}, premarket=${premarket})`)
  return results
}

// ── Legacy helper kept for compatibility ──────────────────────────────────────
export async function getOHLC(_symbol: string, _range: string): Promise<{ closes: number[]; price: number; name: string }> {
  return { closes: [], price: 0, name: _symbol }
}
