import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { transcript } = await req.json()
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 20) {
      return NextResponse.json({ error: 'Paste a longer transcript first' }, { status: 400 })
    }

    const prompt = `You read a meeting transcript. Return ONLY valid JSON with this shape (no markdown):
{"summary":"2-4 sentences","actionItems":["short task strings"],"decisions":["optional bullet strings"]}

Transcript:
---
${transcript.slice(0, 48000)}
---`

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    let parsed: { summary?: string; actionItems?: string[]; decisions?: string[] }
    try {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Could not parse AI response' }, { status: 502 })
    }

    const summary = parsed.summary || 'Meeting captured.'
    const actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems.filter(Boolean).slice(0, 20) : []
    const decisions = Array.isArray(parsed.decisions) ? parsed.decisions.filter(Boolean).slice(0, 20) : []

    const { data: note, error: nErr } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        content: summary,
        type: 'meeting',
        transcript: transcript.slice(0, 100000),
        meta: { actionItems, decisions, extractedAt: new Date().toISOString() },
      })
      .select()
      .single()

    if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 })

    return NextResponse.json({
      note: note,
      summary,
      actionItems,
      decisions,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
