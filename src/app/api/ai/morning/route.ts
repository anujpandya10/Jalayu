import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase-server'
import { langInstruction } from '@/lib/language'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [profileRes, tasksRes, yesterdayMoodRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('tasks').select('title, completed').eq('user_id', user.id).eq('due_date', today),
      supabase.from('moods').select('score').eq('user_id', user.id)
        .gte('created_at', `${yesterday}T00:00:00`)
        .lte('created_at', `${yesterday}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(1),
    ])

    const profile = profileRes.data
    if (!profile) {
      return new Response(JSON.stringify({ note: "Good morning. Today is a fresh start." }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const name = profile.nickname || profile.full_name || 'there'
    const tasks = tasksRes.data || []
    const pendingTasks = tasks.filter((t) => !t.completed).length
    const yesterdayMood = yesterdayMoodRes.data?.[0]?.score ?? null
    const dayNumber = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)) + 1

    const moodLine = yesterdayMood
      ? `Yesterday's mood was ${yesterdayMood}/5.`
      : 'No mood logged yesterday.'

    const tasksLine = pendingTasks > 0
      ? `${pendingTasks} task${pendingTasks > 1 ? 's' : ''} waiting for today.`
      : 'No tasks set for today yet.'

    const langLine = langInstruction(profile.preferred_language)
    const prompt = `You are Jalayu. Write a short morning note (2–3 sentences, max 65 words) for ${name}.
${langLine}

Context:
- Day ${dayNumber} of their journey
- Their goal: "${profile.biggest_goal || 'not shared yet'}"
- Struggles they named: ${profile.struggles?.join(', ') || 'none specified'}
- Peak productive hours: ${profile.peak_hours || 'unknown'}
- ${moodLine}
- ${tasksLine}

Rules:
- Reference something SPECIFIC from their data — not a generic greeting
- Acknowledge where they actually are, not where they should be
- End with a thought that makes the question "What does today need to be about?" land naturally
- Tone: warm and present, like a thoughtful person who's been paying attention
- Never say "great job", "you've got this", or anything coaching-speak
- No markdown, no formatting. Plain prose only.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    })

    const note = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    return new Response(JSON.stringify({ note, userId: user.id, date: today }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Morning note error:', err)
    // Graceful fallback — never crash the home screen
    return new Response(JSON.stringify({ note: "Morning. A new day to work toward what matters." }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
