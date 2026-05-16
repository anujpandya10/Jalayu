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

export async function getQuote(symbol: string): Promise<YahooQuote> {
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

  return { symbol, name, price, change, changePct, sparkline: closes }
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
