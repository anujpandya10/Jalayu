const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

export interface YahooQuote {
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
  sparkline: number[]
}

export interface YahooOHLC {
  closes: number[]
  price: number
  name: string
}

async function fetchChart(symbol: string, range: string): Promise<unknown> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`
  const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${symbol}`)
  return res.json()
}

// Short-lived in-memory cache so the chart, watchlist, account and monitor
// don't each hammer Yahoo for the same ticker (which triggers 429s). On a
// rate-limit / failure we serve the last good value rather than erroring.
const QUOTE_TTL_MS = 15_000
// The error-fallback path used to serve a cached quote with no age check at all — a
// position-closing decision (flatten/sweep) could fire against a quote that was hours
// stale during a Yahoo outage, with nothing in the trade record showing it wasn't live.
// Past this age, a fallback isn't a "brief hiccup" anymore — better to throw and let the
// caller retry next tick than close a real position on a price that's no longer real.
const QUOTE_FALLBACK_MAX_AGE_MS = 5 * 60_000
const quoteCache = new Map<string, { at: number; quote: YahooQuote }>()

export async function getQuote(symbol: string): Promise<YahooQuote> {
  const key = symbol.toUpperCase()
  const cached = quoteCache.get(key)
  if (cached && Date.now() - cached.at < QUOTE_TTL_MS) return cached.quote

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await fetchChart(symbol, '5d') as any
    const result = data?.chart?.result?.[0]
    if (!result) throw new Error(`No data for ${symbol}`)

    const meta = result.meta
    const price: number = meta.regularMarketPrice ?? 0
    const prevClose: number = meta.chartPreviousClose ?? meta.previousClose ?? price
    const change = price - prevClose
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0
    const name: string = meta.longName ?? meta.shortName ?? symbol

    const closes: number[] = (result.indicators?.quote?.[0]?.close ?? [])
      .filter((c: number | null) => c != null)
      .slice(-5)

    const quote: YahooQuote = { symbol, name, price, change, changePct, sparkline: closes }
    quoteCache.set(key, { at: Date.now(), quote })
    return quote
  } catch (err) {
    // Rate-limited or transient failure → serve the last good quote, but only if it's
    // still reasonably fresh (see QUOTE_FALLBACK_MAX_AGE_MS above).
    if (cached && Date.now() - cached.at < QUOTE_FALLBACK_MAX_AGE_MS) return cached.quote
    throw err
  }
}

export async function getOHLC(symbol: string, range: string): Promise<YahooOHLC> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fetchChart(symbol, range) as any
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error(`No data for ${symbol}`)

  const meta = result.meta
  const price: number = meta.regularMarketPrice ?? 0
  const name: string = meta.longName ?? meta.shortName ?? symbol

  const closes: number[] = (result.indicators?.quote?.[0]?.close ?? [])
    .filter((c: number | null) => c != null)

  return { closes, price, name }
}
