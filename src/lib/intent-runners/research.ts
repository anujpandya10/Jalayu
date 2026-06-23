/**
 * Research intent runner — Jalayu's first shadow agent.
 *
 * Takes a user intent text, runs it through Claude with the built-in
 * web_search tool, returns a markdown brief + citation list.
 *
 * Called from the queued intent worker. Has no Supabase coupling so it
 * can be reused later by other surfaces (chat, daily letter, etc.).
 */
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MODEL = 'claude-sonnet-4-20250514'
const MAX_SEARCHES = 5

const SYSTEM_PROMPT = `You are Jalayu's research shadow. Someone has fired you an intent from their phone while they're going about their day. They expect to come back to a clear, useful answer — not a wall of text, not a hedge-fest, not a polite preamble.

Rules:
- Search the web only as needed to give a confident, current answer.
- Write in markdown. Lead with the answer in 1-3 sentences. Then expand with structure (bullets, sub-headings) only if it genuinely helps.
- Cite sources inline as you go — the API attaches citations automatically when you ground claims in search results.
- Never start with "Great question" / "I'd be happy to" / similar filler.
- If the intent is ambiguous, do your best with the most likely reading and note what you assumed at the end ("Assumed: …"). Don't ask back-and-forth questions — the person isn't here.
- End with a single "Bottom line:" sentence the person can read alone if they only have 3 seconds.
- Cap the whole response at ~500 words. Brevity is the product.`

export interface ResearchResult {
  resultMd: string
  resultSummary: string
  citations: { title: string; url: string }[]
  model: string
}

interface WebSearchResultBlock {
  type: 'web_search_tool_result'
  content: Array<{ type: 'web_search_result'; title?: string; url?: string }> | unknown
}

interface CitationItem {
  type?: string
  title?: string
  url?: string
}

export async function runResearchIntent(
  intentText: string,
  memoryContext: string = '',
  userContext: string = '',
  client: Anthropic = anthropic,
): Promise<ResearchResult> {
  // Order matters: who → what they asked before → how to answer.
  const system = `${SYSTEM_PROMPT}${userContext}${memoryContext}`
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: MAX_SEARCHES,
      },
    ] as unknown as Anthropic.Messages.Tool[],
    messages: [{ role: 'user', content: intentText }],
  })

  // Collect markdown text from all text blocks (Claude may emit multiple)
  let md = ''
  const citations: { title: string; url: string }[] = []
  const seenUrls = new Set<string>()

  for (const block of resp.content) {
    if (block.type === 'text') {
      md += block.text

      // Pull inline citations (added by the API when grounded in search results)
      const inline = (block as unknown as { citations?: CitationItem[] }).citations
      if (Array.isArray(inline)) {
        for (const c of inline) {
          if (c.url && !seenUrls.has(c.url)) {
            seenUrls.add(c.url)
            citations.push({ title: c.title || c.url, url: c.url })
          }
        }
      }
    } else if (block.type === 'web_search_tool_result') {
      // Also gather URLs that were searched, as a fallback citation set
      const results = (block as unknown as WebSearchResultBlock).content
      if (Array.isArray(results)) {
        for (const r of results) {
          if (r.type === 'web_search_result' && r.url && !seenUrls.has(r.url)) {
            seenUrls.add(r.url)
            citations.push({ title: r.title || r.url, url: r.url })
          }
        }
      }
    }
  }

  md = md.trim()
  if (!md) {
    throw new Error('Research produced no text output')
  }

  // Extract "Bottom line" if present, else first sentence — for the ledger row
  const bottomLineMatch = md.match(/(?:^|\n)\s*\*?\*?Bottom line:\*?\*?\s*(.+?)(?:\n|$)/i)
  let summary = bottomLineMatch?.[1]?.trim() || ''
  if (!summary) {
    const firstSentence = md.replace(/[#*_`>-]/g, '').trim().split(/(?<=[.!?])\s+/)[0]
    summary = firstSentence?.slice(0, 200) || md.slice(0, 200)
  }
  if (summary.length > 200) summary = summary.slice(0, 197) + '…'

  return {
    resultMd: md,
    resultSummary: summary,
    citations,
    model: MODEL,
  }
}
