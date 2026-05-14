import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase-admin'

function verifyCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return NextResponse.json({ skipped: true, reason: 'No ANTHROPIC_API_KEY' })
  }

  const anthropic = new Anthropic({ apiKey: key })
  const today = new Date().toISOString().split('T')[0]
  const startOfDay = `${today}T00:00:00.000Z`
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, full_name, nickname, peak_hours, biggest_goal, struggles, last_active')
    .gte('last_active', twoDaysAgo)
    .limit(200)

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 })
  }

  let created = 0
  for (const p of profiles || []) {
    const { count } = await admin
      .from('insights')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', p.id)
      .eq('type', 'cron_daily')
      .gte('created_at', startOfDay)

    if ((count ?? 0) > 0) continue

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: moods }, { data: tasks }, { data: refl }] = await Promise.all([
      admin.from('moods').select('score, created_at').eq('user_id', p.id).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(20),
      admin.from('tasks').select('title, completed, due_date').eq('user_id', p.id).gte('created_at', sevenDaysAgo).limit(40),
      admin.from('reflections').select('one_word, win_of_day').eq('user_id', p.id).order('date', { ascending: false }).limit(3),
    ])

    const moodScores = (moods || []).map((m) => m.score)
    const avgMood = moodScores.length ? (moodScores.reduce((a, b) => a + b, 0) / moodScores.length).toFixed(1) : null
    const completed = (tasks || []).filter((t) => t.completed).length

    const prompt = `You are Jalayu. Write ONE short insight (max 3 sentences) for ${p.nickname || p.full_name || 'this person'}.
Data: peak hours ${p.peak_hours || 'unknown'}, goal "${p.biggest_goal || 'unspecified'}", struggles: ${(p.struggles || []).join(', ') || 'unspecified'}.
Last week: ${moodScores.length} mood logs${avgMood ? `, avg ${avgMood}/5` : ''}. Tasks sample: ${(tasks || []).slice(0, 8).map((t) => `${t.title}${t.completed ? ' (done)' : ''}`).join('; ') || 'none'}.
Recent reflections: ${(refl || []).map((r) => [r.one_word, r.win_of_day].filter(Boolean).join(' — ')).join(' | ') || 'none'}.
Be specific and kind. No medical claims.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 220,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const { error: insErr } = await admin.from('insights').insert({
      user_id: p.id,
      type: 'cron_daily',
      title: 'Morning insight',
      content: text,
      is_read: false,
      priority: 'low',
    })
    if (!insErr) created++
  }

  return NextResponse.json({ ok: true, profiles: (profiles || []).length, insightsCreated: created })
}
