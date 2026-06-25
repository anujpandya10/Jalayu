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
  { id: 'matic-network', symbol: 'MATIC', name: 'Polygon'  },
  { id: 'shiba-inu',     symbol: 'SHIB', name: 'Shiba Inu' },
  { id: 'tron',          symbol: 'TRX',  name: 'TRON'      },
  { id: 'sui',           symbol: 'SUI',  name: 'Sui'       },
  { id: 'pepe',          symbol: 'PEPE', name: 'Pepe'      },
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

// ── Binance — fallback crypto source (no key, generous rate limits) ───────────
// Maps our symbols to Binance USDT pairs
const BINANCE_SYMBOL_MAP: Record<string, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', BNB: 'BNBUSDT',
  XRP: 'XRPUSDT', ADA: 'ADAUSDT', DOGE: 'DOGEUSDT', AVAX: 'AVAXUSDT',
  DOT: 'DOTUSDT', LINK: 'LINKUSDT', LTC: 'LTCUSDT', UNI: 'UNIUSDT',
  XLM: 'XLMUSDT', ATOM: 'ATOMUSDT', NEAR: 'NEARUSDT', MATIC: 'MATICUSDT',
  SHIB: 'SHIBUSDT', TRX: 'TRXUSDT', SUI: 'SUIUSDT', PEPE: 'PEPEUSDT',
}

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      cache: 'no-store',
    })
    return res.ok ? res : null
  } catch { return null } finally { clearTimeout(timer) }
}

async function fetchCryptoPricesBinance(): Promise<AssetData[]> {
  try {
    const binancePairs = CRYPTO_LIST.map((c) => BINANCE_SYMBOL_MAP[c.symbol]).filter(Boolean)
    const symbolsParam = JSON.stringify(binancePairs)
    const path = `/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`
    // Binance.us is US-accessible from Vercel; binance.com is often geo-blocked from US servers
    const res = await fetchWithTimeout(`https://api.binance.us${path}`, 5000)
             ?? await fetchWithTimeout(`https://api.binance.com${path}`, 5000)
    if (!res) {
      console.error('[market-data] Binance fallback: both endpoints failed')
      return []
    }
    const tickers = await res.json() as Array<{
      symbol: string; lastPrice: string; priceChangePercent: string
    }>
    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]))
    return CRYPTO_LIST.flatMap(({ symbol, name }) => {
      const binanceSym = BINANCE_SYMBOL_MAP[symbol]
      const t = binanceSym ? tickerMap.get(binanceSym) : undefined
      if (!t) return []
      const price = parseFloat(t.lastPrice)
      if (!price) return []
      return [{
        symbol, name,
        price,
        change24h: parseFloat(t.priceChangePercent),
        change7d: 0,
        assetType: 'crypto' as const,
        isPumpCandidate: false,
      }]
    })
  } catch (err) {
    console.error('[market-data] Binance fallback failed:', err)
    return []
  }
}

// ── CoinGecko — secondary crypto source (Binance is primary) ─────────────────
async function fetchCryptoPricesCoingecko(): Promise<AssetData[]> {
  const ids = CRYPTO_LIST.map((c) => c.id).join(',')
  const url =
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_7d_change=true`

  try {
    const res = await fetchWithTimeout(url, 6000)  // hard 6s timeout — CoinGecko can hang
    if (!res) {
      console.warn('[market-data] CoinGecko timeout/failed')
      return []
    }
    const json = await res.json() as Record<string, {
      usd?: number; usd_24h_change?: number; usd_7d_change?: number
    }>
    const results = CRYPTO_LIST.flatMap(({ id, symbol, name }) => {
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
    return results
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

// ── Yahoo Finance predefined screeners (gainers/losers/most-active/small-cap) ──
// Screener results include warrants (...W/WS/WW), preferred shares (hyphenated,
// e.g. AHT-PF), units (...U), and sub-$1 penny tickers — Yahoo's chart/quote API
// frequently has no usable data for these, so a position opened in one gets stuck
// forever (getQuote throws every tick, the management loop silently skips it).
// Plain common stock only, with a price floor so the "biggest mover" rank isn't
// dominated by illiquid noise.
// Hyphen/period = preferred or special share class (e.g. AHT-PF). A 5-letter
// symbol ending in Nasdaq's special-status suffix (W=warrant, U=units, R=rights)
// on top of a 4-letter base is the warrant/unit, not the common stock (e.g.
// WGSWW = WGS + WW warrant suffix). Plain common-stock tickers (1-4 letters,
// or 5 without one of these trailing codes) pass through.
const JUNK_SYMBOL_RE = /[-.]|^[A-Z]{4}(?:W|WS|U|R)$/
const MIN_SCREENER_PRICE = 1

function isTradeableStockSymbol(symbol: string, price: number): boolean {
  if (!symbol || JUNK_SYMBOL_RE.test(symbol)) return false
  return price >= MIN_SCREENER_PRICE
}

async function fetchScreener(scrId: string, count: number): Promise<AssetData[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=${count}&fields=symbol,regularMarketPrice,regularMarketChangePercent,regularMarketVolume,marketCap`
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
      .filter((q) => isTradeableStockSymbol(q.symbol ?? '', q.regularMarketPrice ?? 0))
      .map((q) => ({
        symbol: q.symbol ?? '',
        name: q.shortName ?? q.symbol ?? '',
        price: q.regularMarketPrice ?? 0,
        change24h: q.regularMarketChangePercent ?? 0,
        change7d: 0,
        assetType: 'stock' as const,
        isPumpCandidate: (q.regularMarketChangePercent ?? 0) > 15,
      }))
  } catch { return [] }
}

async function fetchTopGainers(): Promise<AssetData[]> {
  return fetchScreener('day_gainers', 40)
}

/**
 * Casts a much wider net than the fixed watchlist: gainers, losers, the
 * busiest tickers of the day, and small/penny-cap movers, in parallel —
 * so a mover outside the curated list (a SPCX-type name) still shows up.
 * Stock-only, market-hours-only, deduplicated. Used by the Auto Trader.
 */
export async function fetchExpandedStockUniverse(): Promise<AssetData[]> {
  const screenerIds = ['day_gainers', 'day_losers', 'most_actives', 'small_cap_gainers', 'undervalued_growth_stocks']
  const settled = await Promise.allSettled(screenerIds.map((id) => fetchScreener(id, 100)))
  const seen = new Set<string>()
  const out: AssetData[] = []
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue
    for (const a of r.value) {
      if (!seen.has(a.symbol)) { seen.add(a.symbol); out.push(a) }
    }
  }
  return out
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

// ── Crypto price fetch: Binance.us PRIMARY → Binance.com → CoinGecko ─────────
// Binance.us is accessible from Vercel US with high rate limits.
// CoinGecko free tier is heavily rate-limited — use last resort only.
async function fetchCryptoPrices(): Promise<AssetData[]> {
  const primary = await fetchCryptoPricesBinance()
  if (primary.length >= 5) return primary
  console.warn('[market-data] Binance failed — trying CoinGecko')
  return fetchCryptoPricesCoingecko()
}

/** Live price for one symbol — used for open positions not in the scan universe */
export async function fetchLivePrice(
  symbol: string,
  assetType?: 'crypto' | 'stock' | 'forex' | string | null,
): Promise<number | null> {
  const sym = symbol.toUpperCase()

  if (assetType === 'crypto' || BINANCE_SYMBOL_MAP[sym]) {
    const pair = BINANCE_SYMBOL_MAP[sym]
    if (pair) {
      const url = `/api/v3/ticker/price?symbol=${pair}`
      const res = await fetchWithTimeout(`https://api.binance.us${url}`, 4000)
        ?? await fetchWithTimeout(`https://api.binance.com${url}`, 4000)
      if (res) {
        const j = await res.json() as { price?: string }
        const p = parseFloat(j.price ?? '0')
        if (p > 0) return p
      }
    }
    const cg = await fetchCryptoPrices()
    const hit = cg.find((a) => a.symbol === sym)
    if (hit) return hit.price
  }

  if (assetType === 'forex') {
    const fx = await fetchForexRates()
    const hit = fx.find((a) => a.symbol === sym)
    if (hit) return hit.price
  }

  const stock = await fetchStockPrice(sym, sym)
  if (stock?.price) return stock.price

  return null
}

/** Fill missing symbols so open positions get real marks and exits can run */
export async function enrichPriceMapForPositions(
  priceMap: Map<string, number>,
  positions: { symbol: string; asset_type?: string | null }[],
): Promise<Map<string, number>> {
  const out = new Map(priceMap)
  const tasks = positions
    .filter((p) => {
      const cur = out.get(p.symbol)
      return cur == null || cur <= 0
    })
    .map(async (p) => {
      const live = await fetchLivePrice(
        p.symbol,
        (p.asset_type as 'crypto' | 'stock' | 'forex') ?? null,
      )
      if (live != null && live > 0) out.set(p.symbol, live)
    })
  await Promise.all(tasks)
  return out
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function getAllAssets(): Promise<AssetData[]> {
  const results: AssetData[] = []

  // Crypto is 24/7 — always fetch (Binance.us primary, CoinGecko fallback)
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
