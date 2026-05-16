/**
 * Market data — CoinGecko (crypto, no key, no geo-blocking) + Yahoo Finance (stocks, market hours)
 */

export interface AssetData {
  symbol: string      // e.g. BTC or AAPL
  coinId?: string     // CoinGecko id, e.g. "bitcoin"
  name: string
  price: number
  change24h: number   // % change last 24h
  change7d: number    // % change last 7d
  assetType: 'crypto' | 'stock'
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

// ── Pump-and-dump watch stocks (historically volatile) ────────────────────────
const PUMP_WATCH_STOCKS: { symbol: string; name: string }[] = [
  { symbol: 'GME',  name: 'GameStop'        },
  { symbol: 'AMC',  name: 'AMC Entertainment' },
  { symbol: 'SPCE', name: 'Virgin Galactic'  },
  { symbol: 'BBAI', name: 'BigBear.ai'       },
  { symbol: 'MULN', name: 'Mullen Auto'      },
  { symbol: 'FFIE', name: 'Faraday Future'   },
  { symbol: 'BBBY', name: 'Bed Bath Beyond'  },
  { symbol: 'CLOV', name: 'Clover Health'    },
  { symbol: 'SNDL', name: 'Sundial Growers'  },
  { symbol: 'MVIS', name: 'MicroVision'      },
]

export function isUsMarketOpen(): boolean {
  const now = new Date()
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false
  const total = now.getUTCHours() * 60 + now.getUTCMinutes()
  return total >= 13 * 60 + 30 && total < 20 * 60
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

// ── Main export ───────────────────────────────────────────────────────────────
export async function getAllAssets(): Promise<AssetData[]> {
  const results: AssetData[] = []

  // Crypto is 24/7 — always fetch
  const crypto = await fetchCryptoPrices()
  results.push(...crypto)

  const marketOpen = isUsMarketOpen()

  if (marketOpen) {
    // Fetch pump-watch stocks during market hours
    const pumpSettled = await Promise.allSettled(
      PUMP_WATCH_STOCKS.map(({ symbol, name }) => fetchStockPrice(symbol, name))
    )
    for (const r of pumpSettled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value)
    }

    // Fetch top gainers (pump candidates from screener)
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

  console.log(`[market-data] fetched ${results.length} assets (${crypto.length} crypto, market=${marketOpen})`)
  return results
}

// ── Legacy helper kept for compatibility ──────────────────────────────────────
export async function getOHLC(_symbol: string, _range: string): Promise<{ closes: number[]; price: number; name: string }> {
  return { closes: [], price: 0, name: _symbol }
}
