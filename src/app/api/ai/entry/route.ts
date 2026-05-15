import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const hour = now.getHours()
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

    const [profileRes, tasksRes, todayMoodRes, yesterdayMoodRes, notesRes, threadRes] =
      await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('tasks')
          .select('title, completed, priority')
          .eq('user_id', user.id)
          .eq('due_date', today),
        supabase
          .from('moods')
          .select('score')
          .eq('user_id', user.id)
          .gte('created_at', `${today}T00:00:00`)
          .lte('created_at', `${today}T23:59:59`)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('moods')
          .select('score')
          .eq('user_id', user.id)
          .gte('created_at', `${yesterday}T00:00:00`)
          .lte('created_at', `${yesterday}T23:59:59`)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('notes')
          .select('content, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('chat_messages')
          .select('role, content, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(16),
      ])

    const profile = profileRes.data
    const name = profile?.nickname || profile?.full_name || 'there'
    const tasks = tasksRes.data || []
    const pending = tasks.filter((t) => !t.completed)
    const done = tasks.filter((t) => t.completed)
    const todayMood = todayMoodRes.data?.[0]?.score ?? null
    const yesterdayMood = yesterdayMoodRes.data?.[0]?.score ?? null
    const recentNotes = (notesRes.data || []).map((n) => n.content.slice(0, 150))
    const thread = [...(threadRes.data || [])].reverse()
    const dayNumber = profile?.created_at
      ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000) + 1
      : 1

    // Was the last conversation today or yesterday?
    const lastMsgDate = thread[thread.length - 1]?.created_at?.split('T')[0]
    const hasRecentThread = lastMsgDate === today || lastMsgDate === yesterday

    const threadSummary =
      hasRecentThread && thread.length > 0
        ? thread
            .slice(-10)
            .map(
              (m) =>
                `${m.role === 'user' ? name : 'Jalayu'}: ${m.content.slice(0, 250)}`,
            )
            .join('\n')
        : null

    const timeDirective = {
      morning:
        'It is morning. Brief them on what today needs. What is in front of them, what should they focus on first, what do you know about where they are right now.',
      afternoon:
        'It is afternoon. Check in. Reference what they had planned and where they likely are. This is a mid-day touch — warm, grounding, honest.',
      evening:
        'It is evening. Help them land. What happened today, what matters from it, what carries forward to tomorrow. Set them up to close the day.',
    }[timeOfDay]

    const contextLines = [
      `Day ${dayNumber} of their journey`,
      `Their goal: "${profile?.biggest_goal || 'not shared yet'}"`,
      `What they struggle with: ${profile?.struggles?.join(', ') || 'nothing specified'}`,
      `Peak hours: ${profile?.peak_hours || 'unknown'}`,
      `Today's tasks: ${pending.length} pending, ${done.length} done`,
      pending.length > 0
        ? `Pending: ${pending
            .slice(0, 4)
            .map((t) => t.title)
            .join(', ')}`
        : '',
      todayMood
        ? `Mood checked in today: ${todayMood}/5`
        : yesterdayMood
          ? `Yesterday's mood: ${yesterdayMood}/5 (nothing logged today yet)`
          : 'No mood logged recently',
      recentNotes.length > 0
        ? `Recent notes from memory: "${recentNotes[0]}"${recentNotes[1] ? ` / "${recentNotes[1]}"` : ''}`
        : '',
      threadSummary
        ? `Recent conversation (continue this thread naturally):\n${threadSummary}`
        : 'No prior conversation to reference.',
    ]
      .filter(Boolean)
      .join('\n')

    const prompt = `You are Jalayu. You are ${name}'s personal presence — not a tool, not a chatbot. You are the one they open when they need to feel oriented.

${timeDirective}

What you know:
${contextLines}

Write your opening message. Non-negotiable rules:
- Do NOT start with a greeting word ("Good morning", "Hey", "Hi", "Hello") — you are already in relationship with them. Start like you're mid-conversation with someone you know well.
- Be specific. Reference something real from their data. Generic is failure.
- If there's a recent conversation thread, continue it naturally — don't announce that you remember it, just continue from it.
- 2–4 sentences. Warm. Present. Honest.
- End in a way that opens space — sometimes one question, sometimes just stating what you see and letting them respond.
- No bullet points. No markdown. No line breaks. Pure conversation.
- Never be a life coach. Never say "you've got this." Never diagnose. Be the person who's been quietly paying attention.`

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 220,
      messages: [{ role: 'user', content: prompt }],
    })

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('Entry error:', err)
    return new Response("You're back. Let's see what today needs.", {
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}
