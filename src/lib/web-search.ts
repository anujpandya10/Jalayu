export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

/** Run web search for coverage research (Tavily if configured, else DuckDuckGo instant answers). */
export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY
  if (tavilyKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          search_depth: 'advanced',
          max_results: maxResults,
          include_answer: true,
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as {
          results?: { title?: string; url?: string; content?: string }[]
          answer?: string
        }
        const out: WebSearchResult[] = []
        if (data.answer?.trim()) {
          out.push({
            title: 'Search summary',
            url: '',
            snippet: data.answer.trim(),
          })
        }
        for (const r of data.results ?? []) {
          if (r.title && (r.content || r.url)) {
            out.push({
              title: r.title,
              url: r.url ?? '',
              snippet: (r.content ?? '').slice(0, 500),
            })
          }
        }
        if (out.length) return out.slice(0, maxResults)
      }
    } catch (e) {
      console.error('[web-search] Tavily error:', e)
    }
  }

  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`,
      { next: { revalidate: 0 } },
    )
    if (res.ok) {
      const data = (await res.json()) as {
        Abstract?: string
        AbstractText?: string
        AbstractURL?: string
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string } | { Topics?: { Text?: string; FirstURL?: string }[] }>
      }
      const out: WebSearchResult[] = []
      if (data.AbstractText) {
        out.push({
          title: data.Abstract ?? 'Overview',
          url: data.AbstractURL ?? '',
          snippet: data.AbstractText,
        })
      }
      const flat: { Text?: string; FirstURL?: string }[] = []
      for (const item of data.RelatedTopics ?? []) {
        if ('Topics' in item && item.Topics) flat.push(...item.Topics)
        else flat.push(item as { Text?: string; FirstURL?: string })
      }
      for (const t of flat.slice(0, maxResults - out.length)) {
        if (t.Text) {
          out.push({
            title: t.Text.split(' - ')[0] ?? t.Text,
            url: t.FirstURL ?? '',
            snippet: t.Text,
          })
        }
      }
      if (out.length) return out.slice(0, maxResults)
    }
  } catch (e) {
    console.error('[web-search] DuckDuckGo error:', e)
  }

  return []
}

export function shouldResearchOnline(question: string): boolean {
  const q = question.toLowerCase()
  const triggers = [
    'find',
    'near me',
    'nearby',
    'in-network',
    'in network',
    'out of network',
    'provider',
    'doctor',
    'physician',
    'specialist',
    'hospital',
    'urgent care',
    'pharmacy',
    'formulary',
    'covered',
    'coverage for',
    'does my plan',
    'is .* covered',
    'medication',
    'prescription',
    'drug',
    'lookup',
    'search',
    'website',
    'phone number',
    'prior auth',
    'referral',
  ]
  return triggers.some((t) => q.includes(t))
}

export function buildSearchQueries(
  question: string,
  ctx: { carrier?: string | null; plan?: string | null; planType?: string | null; locationHint?: string | null; meds?: string[] },
): string[] {
  const q = question.trim()
  const parts: string[] = []
  const carrier = ctx.carrier?.trim()
  const plan = ctx.plan?.trim()
  const loc = ctx.locationHint?.trim()
  const base = [carrier, plan].filter(Boolean).join(' ')

  parts.push(loc ? `${q} ${base} ${loc}` : `${q} ${base}`.trim())

  const ql = q.toLowerCase()
  if (ql.includes('doctor') || ql.includes('provider') || ql.includes('hospital') || ql.includes('near')) {
    parts.push(`${base} find in-network doctor ${loc ?? ''}`.trim())
    if (carrier) parts.push(`${carrier} provider directory`)
  }
  if (ql.includes('medication') || ql.includes('prescription') || ql.includes('drug') || ctx.meds?.length) {
    const med = ctx.meds?.[0] ?? ''
    parts.push(`${med || q} formulary ${base}`.trim())
  }

  return [...new Set(parts.filter(Boolean))].slice(0, 3)
}
