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
      // Fetch all incomplete tasks — not just today's — so we can pick the most important one
      supabase
        .from('tasks')
        .select('title, priority, due_date, completed')
        .eq('user_id', user.id)
        .eq('completed', false)
        .order('due_date', { ascending: true })
        .limit(12),
      supabase
        .from('moods')
        .select('score')
        .eq('user_id', user.id)
        .gte('created_at', `${yesterday}T00:00:00`)
        .lte('created_at', `${yesterday}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(1),
    ])

    const profile = profileRes.data
    if (!profile) {
      return new Response(
        JSON.stringify({
          note: 'Good morning. Today is a fresh start.',
          focus: 'Add your first task and tell me what matters most.',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    const name = profile.nickname || profile.full_name || 'there'
    const allTasks = tasksRes.data || []
    const yesterdayMood = yesterdayMoodRes.data?.[0]?.score ?? null
    const dayNumber =
      Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Build a task list for the AI — flag overdue and priority
    const taskLines = allTasks.map((t) => {
      const overdue = t.due_date && t.due_date < today ? ` [OVERDUE: due ${t.due_date}]` : t.due_date === today ? ' [due today]' : ''
      const pri = t.priority === 'high' ? ' [high priority]' : t.priority === 'low' ? ' [low priority]' : ''
      return `- ${t.title}${pri}${overdue}`
    })

    const taskBlock =
      taskLines.length > 0
        ? taskLines.join('\n')
        : '(no tasks yet)'

    const moodLine = yesterdayMood
      ? `Yesterday's mood was ${yesterdayMood}/5${yesterdayMood <= 2 ? ' — a harder day' : yesterdayMood >= 4 ? ' — a good day' : ''}.`
      : 'No mood logged yesterday.'

    const langLine = langInstruction(profile.preferred_language)

    const prompt = `You are Jalayu. Return a JSON object with exactly two fields.

${langLine}

PERSON:
- Name: ${name}
- Day ${dayNumber} of their Jalayu journey
- Biggest goal: "${profile.biggest_goal || 'not shared yet'}"
- Struggles: ${profile.struggles?.join(', ') || 'none specified'}
- Peak productive hours: ${profile.peak_hours || 'unknown'}
- ${moodLine}

THEIR PENDING TASKS:
${taskBlock}

RETURN THIS JSON (no markdown, no explanation, just the raw object):
{
  "note": "A warm, specific 1–2 sentence morning note. Reference something real from their data — not a generic greeting. Tone: like a close friend who's been paying attention, not a coach. No 'great job', 'you've got this', or similar. Max 45 words.",
  "focus": "ONE specific recommendation for today. Pick the most important task — prioritize overdue tasks, high-priority tasks, and tasks tied to their goal. Format: '[Exact task name or goal area]. [One reason why now — specific, not generic].' Max 30 words. Be direct."
}

If they have no tasks: note reflects their fresh start; focus = 'Tell me what you want to work on today.'
Do not invent tasks they haven't listed. Only reference real data.`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    // Parse JSON safely
    let note = ''
    let focus = ''
    try {
      // Strip any markdown code fences if the model added them
      const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      const parsed = JSON.parse(cleaned)
      note = (parsed.note || '').trim()
      focus = (parsed.focus || '').trim()
    } catch {
      // Fallback: treat the whole thing as the note
      note = raw.slice(0, 200)
      focus = allTasks.length > 0 ? allTasks[0].title : 'Tell me what you want to focus on today.'
    }

    return new Response(
      JSON.stringify({ note, focus, userId: user.id, date: today }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('Morning note error:', err)
    return new Response(
      JSON.stringify({
        note: 'Morning. A new day to work toward what matters.',
        focus: 'Tell me what you want to focus on today.',
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }
}
