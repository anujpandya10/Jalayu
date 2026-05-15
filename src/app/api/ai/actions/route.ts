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
    name: 'add_calendar_event',
    description: 'Add an event to the calendar. Use when user says "I have an event", "I have a meeting", "put it on my calendar", "schedule", "I have an appointment", "block time for", "add to my calendar". Also use when user describes something happening at a specific date+time that is NOT just a task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Event title. If the user didn\'t give a title, infer one from context (e.g. "Event" or "Meeting")' },
        date: { type: 'string', description: 'YYYY-MM-DD date of the event. Resolve relative dates like "next Wednesday" against today\'s date accurately.' },
        start_time: { type: 'string', description: 'Start time in HH:MM 24h format, e.g. "16:00" for 4 PM. Required if user gives a time.' },
        end_time: { type: 'string', description: 'End time in HH:MM 24h format if given, e.g. "19:00" for 7 PM.' },
        event_type: { type: 'string', enum: ['event', 'meeting', 'birthday'], description: 'Type of event — default "event".' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'add_reminder',
    description: 'Set a reminder alert. Use when user says "remind me", "don\'t let me forget", "alert me" — but NOT for calendar events with a specific date/time (use add_calendar_event for those).',
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
  {
    name: 'add_insurance_profile',
    description: 'Save insurance/health coverage details when the user provides them — carrier, plan type, member ID, copays, deductible, etc. Trigger whenever the user is giving their insurance info, even if partial. Use conversation context to determine whose insurance it is (self, spouse, child name).',
    input_schema: {
      type: 'object' as const,
      properties: {
        profile_label: { type: 'string', description: "Label shown in dashboard. e.g. 'Mine', 'Spouse', 'Emma (daughter)'. Default 'Mine'." },
        relationship: { type: 'string', enum: ['self', 'spouse', 'child', 'parent', 'other'], description: 'Whose coverage this is. Default self.' },
        insurance_carrier: { type: 'string', description: 'Insurance company name, e.g. Blue Cross Blue Shield, Aetna, United, Cigna, Humana, Kaiser' },
        plan_name: { type: 'string', description: 'Specific plan name if given, e.g. Blue Choice PPO' },
        plan_type: { type: 'string', description: 'Plan type: PPO, HMO, HDHP, EPO, Medicare, Medicaid, etc.' },
        member_id: { type: 'string', description: 'Member ID or subscriber ID number' },
        group_number: { type: 'string', description: 'Group number or group ID' },
        deductible_dollars: { type: 'number', description: 'Annual deductible amount in dollars (not cents). E.g. 1500 for $1,500' },
        deductible_met_dollars: { type: 'number', description: 'How much of the deductible has been met so far this year, in dollars' },
        out_of_pocket_max_dollars: { type: 'number', description: 'Annual out-of-pocket maximum in dollars' },
        copay_primary_dollars: { type: 'number', description: 'Primary care visit copay in dollars' },
        copay_specialist_dollars: { type: 'number', description: 'Specialist visit copay in dollars' },
        copay_er_dollars: { type: 'number', description: 'Emergency room copay in dollars' },
        insurance_phone: { type: 'string', description: 'Insurance carrier phone number (member services)' },
        insurance_website: { type: 'string', description: 'Insurance carrier website URL' },
      },
      required: ['insurance_carrier'],
    },
  },
  {
    name: 'update_insurance_profile',
    description: 'Update specific fields on an existing insurance profile when the user says they want to change or correct their insurance info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        profile_label: { type: 'string', description: 'Which profile to update — match by label (e.g. Mine, Spouse). If unclear, update the first one.' },
        insurance_carrier: { type: 'string' },
        plan_name: { type: 'string' },
        plan_type: { type: 'string' },
        member_id: { type: 'string' },
        group_number: { type: 'string' },
        deductible_dollars: { type: 'number' },
        deductible_met_dollars: { type: 'number' },
        out_of_pocket_max_dollars: { type: 'number' },
        copay_primary_dollars: { type: 'number' },
        copay_specialist_dollars: { type: 'number' },
        copay_er_dollars: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'add_medication',
    description: 'Save a medication when user tells you what they take. Use when user says "I take", "my medication is", "I\'m on", "I\'m prescribed".',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Medication name' },
        dosage_mg: { type: 'number', description: 'Dosage in mg if mentioned' },
        frequency: { type: 'string', description: 'How often, e.g. "once daily", "twice a day", "as needed"' },
        prescriber: { type: 'string', description: 'Doctor who prescribed it, if mentioned' },
        purpose: { type: 'string', description: 'What it\'s for, if mentioned' },
      },
      required: ['name'],
    },
  },
]

export type ExecutedAction = {
  type: 'task_added' | 'mood_logged' | 'reminder_added' | 'memory_saved' | 'task_completed' | 'decision_tracked' | 'insurance_saved' | 'insurance_updated' | 'medication_saved' | 'event_added'
  data: Record<string, unknown>
  message: string
}

// Convert dollar amount to cents safely
function toCents(dollars: number | undefined | null): number | null {
  if (dollars == null) return null
  return Math.round(dollars * 100)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { message, recentMessages } = body as {
      message: string
      recentMessages?: { role: string; content: string }[]
    }
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

    // Build messages array with context: last few turns + current message
    const contextMessages: Anthropic.MessageParam[] = []
    if (recentMessages && recentMessages.length > 0) {
      // Include up to 6 recent turns for multi-turn context (e.g. "it's my wife's")
      const turns = recentMessages.slice(-6)
      for (const m of turns) {
        if (m.role === 'user' || m.role === 'assistant') {
          contextMessages.push({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 600) })
        }
      }
    }
    // Always end with current user message
    if (contextMessages.length === 0 || contextMessages[contextMessages.length - 1].role !== 'user' || contextMessages[contextMessages.length - 1].content !== message) {
      contextMessages.push({ role: 'user', content: message })
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      tools: TOOLS,
      tool_choice: { type: 'auto' },
      system: `You are an intent parser for Jalayu. Extract ONLY clear, explicit actions from the user's message and conversation context. Today is ${today}, current time is ${timeStr}.

IMPORTANT for insurance:
- Trigger add_insurance_profile whenever the user provides insurance data (carrier, plan type, member ID, deductible, copays, etc.) — even partial info.
- Use the conversation context to determine whose insurance it is if not stated in the current message.
- Convert all dollar amounts to numbers (e.g. "$1,500" → 1500, "thirty dollars" → 30).
- If user says "update my deductible" or "correct my copay", use update_insurance_profile.

IMPORTANT for medications:
- Trigger add_medication when user mentions taking a medication in any form.

IMPORTANT for calendar events:
- Use add_calendar_event (NOT add_reminder) whenever the user mentions having an event, meeting, appointment, or anything happening at a specific date and time.
- Examples that should trigger add_calendar_event: "I have an event next Wed 4-7", "schedule a meeting Friday at 2", "put dinner on my calendar Saturday", "I have a doctor's appointment Thursday at 3pm"
- Resolve relative dates accurately: today is ${today}. "Next Wednesday" means the Wednesday of next week.
- Convert times to 24h: "4 PM" = "16:00", "7 PM" = "19:00", "9 AM" = "09:00"

For other actions (tasks, mood, reminders, memory), only act on explicit requests.
If the message is purely conversational with no action intent, do NOT call any tools.`,
      messages: contextMessages,
    })

    const executed: ExecutedAction[] = []

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      if (block.name === 'add_calendar_event') {
        const input = block.input as {
          title: string
          date: string
          start_time?: string
          end_time?: string
          event_type?: string
        }
        // Build a description that includes the time range if both ends given
        let description: string | null = null
        if (input.start_time && input.end_time) {
          // Convert HH:MM to 12h for display
          const fmt = (t: string) => {
            const [h, m] = t.split(':').map(Number)
            const ampm = h >= 12 ? 'PM' : 'AM'
            const h12 = h % 12 || 12
            return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
          }
          description = `${fmt(input.start_time)} – ${fmt(input.end_time)}`
        }

        const { data, error } = await supabase
          .from('tasks')
          .insert({
            user_id: user.id,
            title: input.title,
            due_date: input.date,
            due_time: input.start_time || null,
            description,
            event_type: input.event_type || 'event',
            priority: 'medium',
            completed: false,
          })
          .select()
          .single()

        if (!error && data) {
          const timeLabel = input.start_time
            ? ` at ${input.start_time}${input.end_time ? `–${input.end_time}` : ''}`
            : ''
          executed.push({
            type: 'event_added',
            data: data as Record<string, unknown>,
            message: `Added to calendar: "${input.title}" on ${input.date}${timeLabel}`,
          })
        }
      }

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

      if (block.name === 'add_insurance_profile') {
        const input = block.input as {
          profile_label?: string
          relationship?: string
          insurance_carrier: string
          plan_name?: string
          plan_type?: string
          member_id?: string
          group_number?: string
          deductible_dollars?: number
          deductible_met_dollars?: number
          out_of_pocket_max_dollars?: number
          copay_primary_dollars?: number
          copay_specialist_dollars?: number
          copay_er_dollars?: number
          insurance_phone?: string
          insurance_website?: string
        }
        const row = {
          user_id: user.id,
          profile_label: input.profile_label || 'Mine',
          relationship: input.relationship || 'self',
          insurance_carrier: input.insurance_carrier,
          plan_name: input.plan_name || null,
          plan_type: input.plan_type || null,
          member_id: input.member_id || null,
          group_number: input.group_number || null,
          deductible_cents: toCents(input.deductible_dollars),
          deductible_met_cents: toCents(input.deductible_met_dollars),
          out_of_pocket_max_cents: toCents(input.out_of_pocket_max_dollars),
          copay_primary_cents: toCents(input.copay_primary_dollars),
          copay_specialist_cents: toCents(input.copay_specialist_dollars),
          copay_er_cents: toCents(input.copay_er_dollars),
          insurance_phone: input.insurance_phone || null,
          insurance_website: input.insurance_website || null,
          updated_at: now.toISOString(),
        }
        const { data, error } = await supabase
          .from('health_profiles')
          .insert(row)
          .select()
          .single()
        if (!error && data) {
          const label = input.profile_label || 'Mine'
          const carrier = input.insurance_carrier
          const planType = input.plan_type ? ` ${input.plan_type}` : ''
          executed.push({
            type: 'insurance_saved',
            data: data as Record<string, unknown>,
            message: `Saved ${label} insurance: ${carrier}${planType}`,
          })
        }
      }

      if (block.name === 'update_insurance_profile') {
        const input = block.input as {
          profile_label?: string
          insurance_carrier?: string
          plan_name?: string
          plan_type?: string
          member_id?: string
          group_number?: string
          deductible_dollars?: number
          deductible_met_dollars?: number
          out_of_pocket_max_dollars?: number
          copay_primary_dollars?: number
          copay_specialist_dollars?: number
          copay_er_dollars?: number
        }
        // Find the profile to update
        const label = input.profile_label || 'Mine'
        const { data: profiles } = await supabase
          .from('health_profiles')
          .select('id, profile_label')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })

        let profileId: string | null = null
        if (profiles && profiles.length > 0) {
          const matched = profiles.find((p: { id: string; profile_label: string | null }) =>
            p.profile_label?.toLowerCase() === label.toLowerCase()
          )
          profileId = matched?.id || profiles[0]?.id || null
        }

        if (profileId) {
          const updates: Record<string, unknown> = { updated_at: now.toISOString() }
          if (input.insurance_carrier) updates.insurance_carrier = input.insurance_carrier
          if (input.plan_name) updates.plan_name = input.plan_name
          if (input.plan_type) updates.plan_type = input.plan_type
          if (input.member_id) updates.member_id = input.member_id
          if (input.group_number) updates.group_number = input.group_number
          if (input.deductible_dollars != null) updates.deductible_cents = toCents(input.deductible_dollars)
          if (input.deductible_met_dollars != null) updates.deductible_met_cents = toCents(input.deductible_met_dollars)
          if (input.out_of_pocket_max_dollars != null) updates.out_of_pocket_max_cents = toCents(input.out_of_pocket_max_dollars)
          if (input.copay_primary_dollars != null) updates.copay_primary_cents = toCents(input.copay_primary_dollars)
          if (input.copay_specialist_dollars != null) updates.copay_specialist_cents = toCents(input.copay_specialist_dollars)
          if (input.copay_er_dollars != null) updates.copay_er_cents = toCents(input.copay_er_dollars)

          const { data, error } = await supabase
            .from('health_profiles')
            .update(updates)
            .eq('id', profileId)
            .select()
            .single()
          if (!error && data) {
            executed.push({
              type: 'insurance_updated',
              data: data as Record<string, unknown>,
              message: `Insurance updated`,
            })
          }
        }
      }

      if (block.name === 'add_medication') {
        const input = block.input as {
          name: string
          dosage_mg?: number
          frequency?: string
          prescriber?: string
          purpose?: string
        }
        const { data, error } = await supabase
          .from('medications')
          .insert({
            user_id: user.id,
            name: input.name,
            dosage_mg: input.dosage_mg || null,
            frequency: input.frequency || null,
            prescriber: input.prescriber || null,
            purpose: input.purpose || null,
            is_active: true,
          })
          .select()
          .single()
        if (!error && data) {
          executed.push({
            type: 'medication_saved',
            data: data as Record<string, unknown>,
            message: `Saved medication: ${input.name}${input.dosage_mg ? ` ${input.dosage_mg}mg` : ''}`,
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
