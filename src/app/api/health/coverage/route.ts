import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase-server'
import type { HealthProfile, Medication } from '@/lib/types'
import {
  buildCoverageSystemPrompt,
  locationHintFromProfiles,
  primaryPlanContext,
} from '@/lib/health-coverage-context'
import {
  buildSearchQueries,
  searchWeb,
  shouldResearchOnline,
  type WebSearchResult,
} from '@/lib/web-search'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface CoverageBody {
  question: string
}

function formatWebResearch(allResults: WebSearchResult[]): string {
  if (!allResults.length) return ''
  const seen = new Set<string>()
  const lines: string[] = []
  for (const r of allResults) {
    const key = r.url || r.snippet.slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(`- ${r.title}${r.url ? ` (${r.url})` : ''}\n  ${r.snippet}`)
  }
  return lines.join('\n')
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: CoverageBody = await request.json()
    if (!body.question?.trim()) {
      return Response.json({ error: 'question is required' }, { status: 400 })
    }

    const question = body.question.trim()

    const [profilesRes, medsRes, historyRes] = await Promise.all([
      supabase
        .from('health_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(10),
      supabase
        .from('medications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true),
      supabase
        .from('health_coverage_messages')
        .select('role, content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12),
    ])

    const profiles = (profilesRes.data ?? []) as HealthProfile[]
    const activeMeds = (medsRes.data ?? []) as Medication[]
    const historyRows = [...(historyRes.data ?? [])].reverse()

    const planCtx = primaryPlanContext(profiles)
    const loc = locationHintFromProfiles(profiles)
    const medNames = activeMeds.map((m) => m.name)

    let webResearch = ''
    let sources: WebSearchResult[] = []

    if (shouldResearchOnline(question)) {
      const queries = buildSearchQueries(question, {
        ...planCtx,
        locationHint: loc,
        meds: medNames,
      })
      const batches = await Promise.all(queries.map((q) => searchWeb(q, 4)))
      sources = batches.flat()
      webResearch = formatWebResearch(sources)
    }

    const systemPrompt = buildCoverageSystemPrompt(profiles, activeMeds, webResearch)

    const claudeMessages: { role: 'user' | 'assistant'; content: string }[] = historyRows
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    claudeMessages.push({ role: 'user', content: question })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: systemPrompt,
      messages: claudeMessages,
    })

    const answer = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    const sourcesPayload =
      sources.length > 0
        ? sources.slice(0, 8).map((s) => ({ title: s.title, url: s.url, snippet: s.snippet.slice(0, 300) }))
        : null

    const inserts = [
      { user_id: user.id, role: 'user' as const, content: question, sources: null },
      { user_id: user.id, role: 'assistant' as const, content: answer, sources: sourcesPayload },
    ]

    const { data: saved, error: saveErr } = await supabase
      .from('health_coverage_messages')
      .insert(inserts)
      .select('id, role, content, sources, created_at')

    if (saveErr) {
      console.error('[coverage] save messages:', saveErr.message)
    }

    const assistantRow = saved?.find((r) => r.role === 'assistant')

    return Response.json({
      answer,
      sources: sourcesPayload,
      messageId: assistantRow?.id,
      researched: sources.length > 0,
    })
  } catch (err) {
    console.error('Coverage POST error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
