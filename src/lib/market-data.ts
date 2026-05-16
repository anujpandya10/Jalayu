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

// ── Stocks ────────────────────────────────────────────────────────────────────
const STOCK_LIST: { symbol: string; name: string }[] = [
  { symbol: 'AAPL',  name: 'Apple'     },
  { symbol: 'NVDA',  name: 'Nvidia'    },
  { symbol: 'TSLA',  name: 'Tesla'     },
  { symbol: 'MSFT',  name: 'Microsoft' },
  { symbol: 'AMZN',  name: 'Amazon'    },
  { symbol: 'META',  name: 'Meta'      },
  { symbol: 'SPY',   name: 'S&P 500'   },
  { symbol: 'QQQ',   name: 'Nasdaq'    },
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
      }]
    })
  } catch (err) {
    console.error('[market-data] CoinGecko fetch failed:', err)
    return []
  }
}

// ── Yahoo Finance for a single stock ─────────────────────────────────────────
async function fetchStockPrice(symbol: string, fallbackName: string): Promise<AssetData | null> {
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
    return {
      symbol, name: meta.shortName || fallbackName,
      price,
      change24h: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      change7d: 0,
      assetType: 'stock',
    }
  } catch { return null }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function getAllAssets(): Promise<AssetData[]> {
  const results: AssetData[] = []

  // Crypto is 24/7 — always fetch
  const crypto = await fetchCryptoPrices()
  results.push(...crypto)

  // Stocks only during US market hours
  if (isUsMarketOpen()) {
    const settled = await Promise.allSettled(
      STOCK_LIST.map(({ symbol, name }) => fetchStockPrice(symbol, name))
    )
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value)
    }
  }

  console.log(`[market-data] fetched ${results.length} assets (${crypto.length} crypto)`)
  return results
}

// ── Legacy helper kept for compatibility ──────────────────────────────────────
export async function getOHLC(_symbol: string, _range: string): Promise<{ closes: number[]; price: number; name: string }> {
  return { closes: [], price: 0, name: _symbol }
}
