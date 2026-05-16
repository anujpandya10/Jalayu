import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

const FALLBACK_NEWS: NewsItem[] = [
  { title: 'Markets open mixed as investors weigh economic data', link: '#', pubDate: new Date().toISOString(), source: 'Market Watch' },
  { title: 'Tech stocks lead gains in morning trading session', link: '#', pubDate: new Date().toISOString(), source: 'Reuters' },
  { title: 'Fed officials signal patience on interest rate decisions', link: '#', pubDate: new Date().toISOString(), source: 'Bloomberg' },
  { title: 'S&P 500 hovers near all-time highs ahead of earnings', link: '#', pubDate: new Date().toISOString(), source: 'CNBC' },
  { title: 'Energy sector outperforms as oil prices rise', link: '#', pubDate: new Date().toISOString(), source: 'WSJ' },
]

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([^<]*)<\/${tag}>`))
  return (m?.[1] ?? m?.[2] ?? '').trim()
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const url = 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL,TSLA,MSFT,NVDA,SPY&region=US&lang=en-US'
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    })

    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`)

    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []

    const news: NewsItem[] = items.slice(0, 10).map((item) => {
      const title = extractTag(item, 'title')
      const link = extractTag(item, 'link') || extractTag(item, 'guid')
      const pubDate = extractTag(item, 'pubDate')
      const source = extractTag(item, 'source') || 'Yahoo Finance'
      return { title, link, pubDate, source }
    })

    return NextResponse.json(news.length > 0 ? news : FALLBACK_NEWS)
  } catch {
    return NextResponse.json(FALLBACK_NEWS)
  }
}
