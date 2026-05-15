import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_task',
    description: 'Add a new task to the list. Use when user says "add task", "I need to", "remind me to do", "put on my list".',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Concise task title' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        due_date: { type: 'string', description: 'YYYY-MM-DD, use today if unspecified' },
      },
      required: ['title', 'due_date'],
    },
  },
  {
    name: 'log_mood',
    description: 'Log current mood 1-5. Use when user expresses feelings. Score guide: amazing/great=5, good=4, okay/fine/alright=3, low/off/meh=2, terrible/rough/struggling=1.',
    input_schema: {
      type: 'object' as const,
      properties: {
        score: { type: 'number', description: '1-5 integer' },
        note: { type: 'string', description: 'Optional short note' },
      },
      required: ['score'],
    },
  },
  {
    name: 'add_reminder',
    description: 'Set a reminder. Use when user says "remind me", "don\'t let me forget", "alert me".',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'What to remind about' },
        remind_at: { type: 'string', description: 'ISO 8601 datetime for when to fire' },
      },
      required: ['title', 'remind_at'],
    },
  },
  {
    name: 'save_memory',
    description: 'Save a note to memory. Use when user says "save this", "remember", "add to memory", "capture this".',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'What to save, close to verbatim' },
        type: { type: 'string', enum: ['note', 'learning', 'mind', 'people'], description: 'Category — default note' },
      },
      required: ['content'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done. Use when user says they finished, completed, or did something.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title_match: { type: 'string', description: 'Keyword from task title to search for' },
      },
      required: ['title_match'],
    },
  },
  {
    name: 'track_decision',
    description: 'Track a significant decision the user has made for future follow-up. Use when user says "I decided", "I\'ve decided to", "my decision is", "going with", "I\'m going to [major life choice]".',
    input_schema: {
      type: 'object' as const,
      properties: {
        decision: { type: 'string', description: 'The decision made, stated clearly' },
        follow_up_days: { type: 'number', description: 'Days until Jalayu should follow up (default: 14)' },
      },
      required: ['decision'],
    },
  },
]

export type ExecutedAction = {
  type: 'task_added' | 'mood_logged' | 'reminder_added' | 'memory_saved' | 'task_completed' | 'decision_tracked'
  data: Record<string, unknown>
  message: string
}

export async function POST(request: Request) {
  try {
    const { message } = (await request.json()) as { message: string }
    if (!message?.trim()) {
      return new Response(JSON.stringify({ executed: [] }), { headers: { 'Content-Type': 'application/json' } })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        },
      },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response(JSON.stringify({ executed: [] }), { headers: { 'Content-Type': 'application/json' } })

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      tools: TOOLS,
      tool_choice: { type: 'auto' },
      system: `You are an intent parser. Extract ONLY clear, explicit actions from the user's message. Today is ${today}, current time is ${timeStr}. If the message is purely conversational with no action intent, do NOT call any tools. Do not infer — only act on explicit requests.`,
      messages: [{ role: 'user', content: message }],
    })

    const executed: ExecutedAction[] = []

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      if (block.name === 'add_task') {
        const input = block.input as { title: string; priority?: string; due_date: string }
        const { data, error } = await supabase
          .from('tasks')
          .insert({ user_id: user.id, title: input.title, priority: input.priority ?? 'medium', due_date: input.due_date ?? today })
          .select()
          .single()
        if (!error && data) executed.push({ type: 'task_added', data: data as Record<string, unknown>, message: `Added task: "${input.title}"` })
      }

      if (block.name === 'log_mood') {
        const input = block.input as { score: number; note?: string }
        const score = Math.min(5, Math.max(1, Math.round(input.score)))
        const h = now.getHours()
        const timeOfDay = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
        // Update today's mood if exists, else insert
        const { data: existing } = await supabase
          .from('moods').select('id').eq('user_id', user.id)
          .gte('created_at', today + 'T00:00:00').order('created_at', { ascending: false }).limit(1).single()
        let moodData: Record<string, unknown> | null = null
        if (existing?.id) {
          const { data } = await supabase.from('moods').update({ score, note: input.note ?? null }).eq('id', existing.id).select().single()
          moodData = data as Record<string, unknown>
        } else {
          const { data } = await supabase.from('moods').insert({ user_id: user.id, score, note: input.note ?? null, time_of_day: timeOfDay, energy_level: score }).select().single()
          moodData = data as Record<string, unknown>
        }
        if (moodData) {
          const LABELS: Record<number, string> = { 1: 'Rough', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' }
          executed.push({ type: 'mood_logged', data: moodData, message: `Mood: ${score}/5 — ${LABELS[score] ?? ''}` })
        }
      }

      if (block.name === 'add_reminder') {
        const input = block.input as { title: string; remind_at: string }
        const { data, error } = await supabase
          .from('reminders')
          .insert({ user_id: user.id, title: input.title, remind_at: input.remind_at, is_active: true, type: 'manual' })
          .select()
          .single()
        if (!error && data) executed.push({ type: 'reminder_added', data: data as Record<string, unknown>, message: `Reminder set: "${input.title}"` })
      }

      if (block.name === 'save_memory') {
        const input = block.input as { content: string; type?: string }
        const { data, error } = await supabase
          .from('notes')
          .insert({ user_id: user.id, content: input.content, type: input.type ?? 'note' })
          .select()
          .single()
        if (!error && data) executed.push({ type: 'memory_saved', data: data as Record<string, unknown>, message: `Saved to memory` })
      }

      if (block.name === 'complete_task') {
        const input = block.input as { title_match: string }
        const { data: tasks } = await supabase
          .from('tasks').select('*').eq('user_id', user.id).eq('completed', false)
          .ilike('title', `%${input.title_match}%`).limit(1)
        if (tasks && tasks.length > 0) {
          const task = tasks[0]
          const { error } = await supabase.from('tasks').update({ completed: true, completed_at: now.toISOString() }).eq('id', task.id)
          if (!error) executed.push({ type: 'task_completed', data: { ...task, completed: true, completed_at: now.toISOString() } as Record<string, unknown>, message: `Done: "${task.title}"` })
        }
      }

      if (block.name === 'track_decision') {
        const input = block.input as { decision: string; follow_up_days?: number }
        const followUpDays = input.follow_up_days ?? 14
        const followUpDate = new Date(now.getTime() + followUpDays * 86400000).toISOString().split('T')[0]
        const { data, error } = await supabase
          .from('notes')
          .insert({
            user_id: user.id,
            content: input.decision,
            type: 'decision',
            meta: { follow_up_at: followUpDate, outcome: null },
          })
          .select()
          .single()
        if (!error && data) {
          executed.push({
            type: 'decision_tracked',
            data: data as Record<string, unknown>,
            message: `Decision tracked — I'll check back in ${followUpDays} days`,
          })
        }
      }
    }

    return new Response(JSON.stringify({ executed }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[actions] error:', err)
    return new Response(JSON.stringify({ executed: [] }), { headers: { 'Content-Type': 'application/json' } })
  }
}
