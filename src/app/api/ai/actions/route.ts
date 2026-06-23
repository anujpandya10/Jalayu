import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { buildMedicationReminderFields } from '@/lib/medication-reminder'

import { getUserAnthropic } from '@/lib/user-ai'

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_task',
    description: 'Add a simple task or to-do with NO specific date/time. Use ONLY when the user says "add task", "I need to", "I have to", "I should", "remind me to do", "put on my list", "don\'t forget to" — AND they do NOT mention a specific date, time, event, meeting, or appointment. NEVER use this alongside add_calendar_event for the same item.',
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
    description: 'Log current mood 1-5. Use whenever user expresses how they feel — even casually. "I feel great", "having a rough day", "kind of anxious", "feeling good", "so tired", "overwhelmed" etc. Score: amazing/great=5, good=4, okay/fine/alright=3, low/off/tired/stressed=2, terrible/rough/awful=1.',
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
    description: 'Add an event, meeting, or appointment to the calendar. Use liberally — any time the user describes something happening on a specific date and/or time. Natural phrasings: "I have X on [date]", "add X to my calendar", "schedule X for [date/time]", "put X on my schedule", "X is on [date] from [time] to [time]", "can you add X", "[place/event] [date] [time]". Prefer this over add_reminder when a date+time is given.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Event title — use the location, event name, or activity from the user\'s message. E.g. "ION Event", "Doctor Appointment", "Team Meeting". Infer if not explicitly stated.' },
        date: { type: 'string', description: 'YYYY-MM-DD. Resolve relative dates accurately against today. "Next Wednesday" = Wednesday of next week.' },
        start_time: { type: 'string', description: 'Start time HH:MM 24h. "4pm"→"16:00", "9am"→"09:00", "noon"→"12:00". Provide if user mentions a start time.' },
        end_time: { type: 'string', description: 'End time HH:MM 24h. "7pm"→"19:00". Provide if user gives a range like "4 to 7" or "4-7pm".' },
        event_type: { type: 'string', enum: ['event', 'meeting', 'birthday'], description: 'Default "event". Use "meeting" for work/professional meetings, "birthday" for birthdays.' },
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
    name: 'compose_from_folder',
    description: 'Compose a polished output (pitch, summary, document, slide outline) from all notes in a workspace folder. Use when the user says: "create a pitch from my [folder] notes", "make slides from [folder]", "summarize my [folder] folder", "build a presentation about [project]", "compose a pitch about [topic]", "give me a pitch deck for [project]", "turn my [folder] into a doc". You MUST extract the folder name they referenced. The composed output is saved as a NEW NOTE inside that same folder. After composing, confirm: "Created [output_type] in your [folder] folder — open it to view and edit."',
    input_schema: {
      type: 'object' as const,
      properties: {
        folder_name: { type: 'string', description: 'The folder name the user referenced. We do a case-insensitive partial match against their folder names.' },
        output_type: {
          type: 'string',
          enum: ['pitch', 'summary', 'slide_outline', 'doc'],
          description: 'pitch = 5-minute investor/audience pitch with outline + speaker notes. summary = concise overview. slide_outline = bullet-point slide structure. doc = polished narrative document.',
        },
        topic_hint: { type: 'string', description: 'Optional extra context, e.g., "focus on the product side" or "5-minute version".' },
      },
      required: ['folder_name', 'output_type'],
    },
  },
  {
    name: 'save_memory',
    description: 'Save a note to the user\'s Notes section. ALWAYS use this when the user says ANY of: "add this to my notes", "save this note", "make a note", "note this down", "remember this", "save this", "capture this", "add to memory", "jot this down", "write this down", "save to notes". Save the content close to verbatim — do NOT paraphrase what the user said unless they ask you to. The note is automatically timestamped with the current date and time when saved. After saving, briefly confirm: "Saved to your notes."',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The note content — keep it close to what the user said verbatim. Do not paraphrase unless asked.' },
        type: { type: 'string', enum: ['note', 'learning', 'mind', 'people'], description: 'Category — default "note" for general notes' },
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
        daily_reminder_time: { type: 'string', description: 'Optional HH:MM 24h for daily calendar reminder, e.g. "08:00"' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_health_appointment',
    description: 'Schedule a doctor, dentist, specialist, therapy, or medical visit. Use for "doctor appointment", "see my PCP", "dentist on Tuesday at 3", "cardiology follow-up". Prefer over add_calendar_event for medical visits.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Appointment title, e.g. "Doctor visit", "Dentist cleaning"' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM 24h start time if given' },
        provider_name: { type: 'string', description: 'Doctor or clinic name' },
        location: { type: 'string', description: 'Address or clinic location' },
        reason: { type: 'string', description: 'Reason for visit if mentioned' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'update_primary_care',
    description: 'Save or update the user\'s primary care physician (PCP) contact info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Doctor or practice name' },
        phone: { type: 'string', description: 'Phone number' },
        address: { type: 'string', description: 'Full address' },
      },
      required: [],
    },
  },
  {
    name: 'add_medication_reminder',
    description: 'Set a daily medication reminder that appears on the calendar. Use when user wants to be reminded to take a specific medication at a time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        medication_name: { type: 'string', description: 'Medication name' },
        time: { type: 'string', description: 'HH:MM 24h daily reminder time' },
      },
      required: ['medication_name', 'time'],
    },
  },
]

export type ExecutedAction = {
  type:
    | 'task_added'
    | 'mood_logged'
    | 'reminder_added'
    | 'memory_saved'
    | 'compose_saved'
    | 'compose_failed'
    | 'task_completed'
    | 'decision_tracked'
    | 'insurance_saved'
    | 'insurance_updated'
    | 'primary_care_updated'
    | 'medication_saved'
    | 'appointment_added'
    | 'event_added'
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

    const anthropic = await getUserAnthropic(user.id)
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
      system: `You are the action-detection brain for Jalayu, a personal AI companion. Your ONLY job: read what the user said and call the right tool(s). You never reply with text — only tool calls.

TODAY: ${today} (${now.toLocaleDateString('en-US', { weekday: 'long' })}), current time: ${timeStr}

GOLDEN RULE: Be liberal. If the intent is 65%+ clear, call the tool. A missed action is worse than an extra one. Humans talk naturally — match the intent, not the exact words.

━━━ MUTUAL EXCLUSION RULE (READ FIRST) ━━━
add_task and add_calendar_event are MUTUALLY EXCLUSIVE for any single item.
- Message has a date + time + activity → ONLY call add_calendar_event. NEVER also call add_task.
- Message is a plain to-do with no specific date/time → ONLY call add_task.
- When in doubt, prefer add_calendar_event (it stores the date, add_task doesn't).

━━━ CALENDAR EVENTS → add_calendar_event ━━━
Trigger when user says anything like:
- "add an event / meeting / appointment to my calendar"
- "I have [thing] on [date] at [time]"
- "put [thing] on my calendar / schedule"
- "can you add X to my calendar"
- "schedule X for [date/time]"
- "block time for X on [date]"
- "I'm going to [place/event] on [date]"
- "[event name] is on [date] from [time] to [time]"
- Any date + time + activity combination — even phrased casually
Title: use what the user says (location, event name, etc.). If no clear title, use "Event" or infer from context.

━━━ TASKS → add_task ━━━
Trigger ONLY when there is NO date/time and NO event language:
- "add to my list / to-do", "I need to", "I have to", "I should", "don't forget to"
- "remind me to DO something" (action-oriented, zero time specificity)
- "put X on my task list"
NEVER use this when the user mentions a date, time, event, appointment, or meeting.

━━━ REMINDERS → add_reminder ━━━
Trigger for time-based alerts: "remind me at X", "alert me when", "set a reminder for"
For reminders tied to an event with a date+time, call add_calendar_event instead.

━━━ MOOD → log_mood ━━━
Trigger whenever user expresses how they feel, even casually:
- "I feel / I'm feeling / feeling X"
- "today was X", "having a X day"
- Emotional words: great, good, okay, tired, anxious, stressed, low, rough, sad, happy, excited, overwhelmed, etc.
Score: 5=amazing/great, 4=good, 3=okay/fine/alright, 2=low/off/tired/stressed, 1=terrible/rough/awful

━━━ MEMORY → save_memory ━━━
Trigger for: "save this", "remember that", "note this", "add to memory", "capture this"

━━━ INSURANCE → add_insurance_profile ━━━
Trigger whenever user shares insurance details (even partial): carrier, plan type, member ID, copays, deductible.
Use conversation context for whose insurance it is. Dollar amounts: "$1,500" → 1500.

━━━ MEDICATIONS → add_medication ━━━
Trigger for: "I take", "I'm on", "I'm prescribed", "my medication is", any drug name + dose + frequency.
If user also wants a daily reminder time, include daily_reminder_time OR call add_medication_reminder.

━━━ MEDICAL APPOINTMENTS → add_health_appointment ━━━
Doctor, dentist, specialist, therapy, checkup, lab visit with a date → add_health_appointment (NOT add_calendar_event).
Examples: "doctor appointment Tuesday at 3pm", "dentist next Friday", "see my cardiologist March 5 at 10am".

━━━ PRIMARY CARE → update_primary_care ━━━
When user gives PCP/doctor name, phone, or address for their regular doctor.

━━━ MED REMINDERS → add_medication_reminder ━━━
"Remind me to take [med] at [time] every day" → add_medication_reminder.

━━━ DECISIONS → track_decision ━━━
Trigger for: "I decided", "I've decided", "going with", "I'm going to [major life choice]".

━━━ DATE RESOLUTION — MUST BE ACCURATE ━━━
- "next Wednesday" → the Wednesday of NEXT week (not this week, even if today is before Wednesday)
- "this Saturday" → the coming Saturday
- "tomorrow" → ${new Date(now.getTime() + 86400000).toISOString().split('T')[0]}
- "next week" alone → use Monday of next week as a default
- Always output YYYY-MM-DD

━━━ TIME RESOLUTION ━━━
- "4 to 7", "4-7" → start_time: "16:00", end_time: "19:00"
- "4pm" / "4 PM" → "16:00"
- "7am" → "07:00", "noon" → "12:00", "midnight" → "00:00"
- Always 24h HH:MM format

━━━ COMPOUND REQUESTS ━━━
If the user wants multiple things in one message (e.g. "add this event AND remind me about it"), call BOTH tools.
If intent is purely conversational with zero action content, call no tools.`,
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

      if (block.name === 'compose_from_folder') {
        const input = block.input as {
          folder_name: string
          output_type: 'pitch' | 'summary' | 'slide_outline' | 'doc'
          topic_hint?: string
        }

        // 1. Find the folder by name. We try several matching strategies because
        //    users type folders different ways than they name them:
        //      • "fresh dabba" should match "FreshDabba"
        //      • "Q3 launch" should match "Q3 Product Launch"
        //      • "client meeting" should match "Client Meetings"
        const { data: folders } = await supabase
          .from('notes')
          .select('id, content')
          .eq('user_id', user.id)
          .eq('is_folder', true)

        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
        const tokens = (s: string) =>
          s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

        const needleRaw = input.folder_name.trim()
        const needleNorm = normalize(needleRaw)
        const needleTokens = tokens(needleRaw)

        const list = folders ?? []

        // Strategy A: normalized substring match (handles spaces/case)
        let folder = list.find((f) =>
          normalize(f.content as string).includes(needleNorm)
        )

        // Strategy B: every word in the needle appears in the folder name
        if (!folder && needleTokens.length > 0) {
          folder = list.find((f) => {
            const folderNorm = normalize(f.content as string)
            return needleTokens.every((t) => folderNorm.includes(t))
          })
        }

        // Strategy C: reverse — folder name appears in the user's needle
        // (covers "the FreshDabba pitch deck folder" wanting "FreshDabba")
        if (!folder) {
          folder = list.find((f) => {
            const folderNorm = normalize(f.content as string)
            return folderNorm.length >= 4 && needleNorm.includes(folderNorm)
          })
        }

        if (!folder) {
          const folderNames = list.map((f) => `"${f.content}"`).slice(0, 8).join(', ')
          executed.push({
            type: 'compose_failed',
            data: { folder_name: input.folder_name, available: list.map((f) => f.content) } as Record<string, unknown>,
            message: list.length === 0
              ? `You don't have any folders yet. Open the Notes tab → New folder.`
              : `Couldn't find a folder matching "${input.folder_name}". Your folders: ${folderNames}.`,
          })
        } else {
          // 2. Load all notes in that folder (and one level of subfolders)
          const { data: directNotes } = await supabase
            .from('notes')
            .select('id, content, body_md, attachments, is_folder, created_at')
            .eq('user_id', user.id)
            .eq('parent_id', folder.id)
            .order('created_at', { ascending: true })

          const sourceNotes = (directNotes ?? []).filter((n) => !n.is_folder)

          if (sourceNotes.length === 0) {
            executed.push({
              type: 'compose_failed',
              data: { folder_name: folder.content } as Record<string, unknown>,
              message: `The "${folder.content}" folder is empty. Add some notes first.`,
            })
          } else {
            // 3. Build a corpus of the folder's content for Claude
            const corpus = sourceNotes
              .map((n, i) => {
                const title = (n.content as string).split('\n')[0].slice(0, 100)
                const body = (n.body_md as string | null) ?? (n.content as string)
                const atts = (n.attachments as Array<{ name: string; mime: string }> | null) ?? []
                const attLine = atts.length > 0
                  ? `\n[Attachments: ${atts.map((a) => `${a.name} (${a.mime})`).join(', ')}]`
                  : ''
                return `--- NOTE ${i + 1}: ${title} ---\n${body}${attLine}`
              })
              .join('\n\n')

            // 4. Compose the output via Claude
            const typeInstructions: Record<typeof input.output_type, string> = {
              pitch: `Create a polished 5-minute pitch. Output format in markdown:
## Hook (30 sec) — the opening line that grabs attention
## Problem (1 min) — what's broken and who suffers from it
## Solution (1.5 min) — what we built / are building, with one concrete demo example
## Why now / why us (1 min) — market timing + unfair advantage drawn from these notes
## Traction & ask (1 min) — what we've done, what we need next

After the pitch, add a "## Speaker notes" section with delivery tips: where to pause, what to emphasize, what objections to preempt.`,
              summary: `Create a concise summary of this folder's contents. Output format in markdown:
## TL;DR (2-3 sentences)
## Key themes
## Important details
## Open questions / next steps
Keep it under 400 words.`,
              slide_outline: `Create a slide deck outline in markdown. Each \`## Slide N: <title>\` is one slide. Under each, bullet points (3-5 max) for what goes on that slide. Add \`> speaker note: ...\` for delivery notes. Aim for 8-12 slides total.`,
              doc: `Create a polished narrative document in markdown. Use \`#\` for the title, \`##\` for major sections, \`###\` for subsections. Use lists, bold, blockquotes as appropriate. Write in clear professional prose, not bullets. Length: as long as the content warrants — don't pad.`,
            }

            const composeSystem = `You are creating a polished output from a person's working notes. The notes are raw, sometimes scrappy — your job is to extract what's important, structure it, and write it like a professional.

Rules:
- Stay grounded in what's actually in the notes. Don't invent facts.
- If something is unclear or missing, leave a [TODO: needs clarification] marker rather than making it up.
- Write in the user's voice (first person where they used first person; team voice where they used "we").
- Concrete > abstract. Use specific examples and numbers from the notes whenever possible.
- ${input.topic_hint ? `User hint: "${input.topic_hint}"` : ''}

${typeInstructions[input.output_type]}`

            try {
              const composed = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4000,
                system: composeSystem,
                messages: [
                  {
                    role: 'user',
                    content: `Here are my notes from the "${folder.content}" folder. Compose a ${input.output_type} from them.\n\n${corpus}`,
                  },
                ],
              })

              const composedText = composed.content
                .filter((b) => b.type === 'text')
                .map((b) => (b as { text: string }).text)
                .join('\n')
                .trim()

              if (!composedText) {
                executed.push({
                  type: 'compose_failed',
                  data: { folder_name: folder.content } as Record<string, unknown>,
                  message: `Composition came back empty — try again or refine your folder contents.`,
                })
              } else {
                // 5. Save the result as a new note in the same folder
                const typeLabels: Record<typeof input.output_type, string> = {
                  pitch: 'Pitch',
                  summary: 'Summary',
                  slide_outline: 'Slide outline',
                  doc: 'Document',
                }
                const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                const title = `${typeLabels[input.output_type]} — ${folder.content} (${today})`
                const firstLine = composedText.split('\n').find((l) => l.trim()) ?? title

                const { data: newNote, error: insertErr } = await supabase
                  .from('notes')
                  .insert({
                    user_id: user.id,
                    content: firstLine.replace(/^#+\s*/, '').slice(0, 500) || title,
                    body_md: composedText,
                    type: 'note',
                    parent_id: folder.id,
                    meta: { title },
                  })
                  .select()
                  .single()

                if (insertErr || !newNote) {
                  executed.push({
                    type: 'compose_failed',
                    data: { folder_name: folder.content } as Record<string, unknown>,
                    message: `Composed but could not save the note — try again.`,
                  })
                } else {
                  executed.push({
                    type: 'compose_saved',
                    data: newNote as Record<string, unknown>,
                    message: `Created ${typeLabels[input.output_type].toLowerCase()} in your "${folder.content}" folder — open it to view and edit.`,
                  })
                }
              }
            } catch (composeErr) {
              console.error('[compose_from_folder] AI error', composeErr)
              executed.push({
                type: 'compose_failed',
                data: { folder_name: folder.content } as Record<string, unknown>,
                message: `Composition failed — please try again.`,
              })
            }
          }
        }
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
          daily_reminder_time?: string
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
          if (input.daily_reminder_time) {
            const fields = buildMedicationReminderFields(input.name, input.daily_reminder_time)
            const { data: rem } = await supabase
              .from('reminders')
              .insert({ user_id: user.id, ...fields })
              .select()
              .single()
            if (rem) {
              executed.push({
                type: 'reminder_added',
                data: rem as Record<string, unknown>,
                message: `Daily reminder set for ${input.name}`,
              })
            }
          }
        }
      }

      if (block.name === 'add_medication_reminder') {
        const input = block.input as { medication_name: string; time: string }
        const fields = buildMedicationReminderFields(input.medication_name, input.time)
        const { data, error } = await supabase
          .from('reminders')
          .insert({ user_id: user.id, ...fields })
          .select()
          .single()
        if (!error && data) {
          executed.push({
            type: 'reminder_added',
            data: data as Record<string, unknown>,
            message: `Daily medication reminder: ${input.medication_name} at ${input.time}`,
          })
        }
      }

      if (block.name === 'add_health_appointment') {
        const input = block.input as {
          title: string
          date: string
          time?: string
          provider_name?: string
          location?: string
          reason?: string
        }
        const timePart = input.time || '09:00'
        const appointmentDate = new Date(`${input.date}T${timePart}:00`).toISOString()
        const { data, error } = await supabase
          .from('health_appointments')
          .insert({
            user_id: user.id,
            title: input.title,
            appointment_date: appointmentDate,
            provider_name: input.provider_name || null,
            location: input.location || null,
            reason: input.reason || null,
          })
          .select()
          .single()
        if (!error && data) {
          executed.push({
            type: 'appointment_added',
            data: data as Record<string, unknown>,
            message: `Medical appointment: "${input.title}" on ${input.date}${input.time ? ` at ${input.time}` : ''}`,
          })
        }
      }

      if (block.name === 'update_primary_care') {
        const input = block.input as { name?: string; phone?: string; address?: string }
        const { data: profiles } = await supabase
          .from('health_profiles')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)

        let profileId = profiles?.[0]?.id as string | undefined
        const updates: Record<string, unknown> = { updated_at: now.toISOString() }
        if (input.name) updates.primary_care_name = input.name
        if (input.phone) updates.primary_care_phone = input.phone
        if (input.address) updates.primary_care_address = input.address

        if (profileId) {
          const { data, error } = await supabase
            .from('health_profiles')
            .update(updates)
            .eq('id', profileId)
            .select()
            .single()
          if (!error && data) {
            executed.push({
              type: 'primary_care_updated',
              data: data as Record<string, unknown>,
              message: 'Primary care info updated',
            })
          }
        } else if (input.name || input.phone || input.address) {
          const { data, error } = await supabase
            .from('health_profiles')
            .insert({
              user_id: user.id,
              profile_label: 'Mine',
              relationship: 'self',
              primary_care_name: input.name || null,
              primary_care_phone: input.phone || null,
              primary_care_address: input.address || null,
              updated_at: now.toISOString(),
            })
            .select()
            .single()
          if (!error && data) {
            executed.push({
              type: 'primary_care_updated',
              data: data as Record<string, unknown>,
              message: 'Primary care info saved',
            })
          }
        }
      }
    }

    return new Response(JSON.stringify({ executed }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[actions] error:', err)
    return new Response(JSON.stringify({ executed: [] }), { headers: { 'Content-Type': 'application/json' } })
  }
}
