import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { detectLanguage, langInstruction } from '@/lib/language'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function toneFromProfile(workType: string | null, struggles: string[] | null) {
  const w = workType || ''
  const s = (struggles || []).join(' ').toLowerCase()
  if (s.includes('mood') || s.includes('anxious') || s.includes('overwhelm')) {
    return 'Use a gentler pace, shorter sentences, and validate feelings before suggestions.'
  }
  if (w === 'build' || w === 'create') {
    return 'Be direct and momentum-focused; celebrate shipped work.'
  }
  if (w === 'people' || w === 'learn') {
    return 'Be curious and relational; connect advice to people and learning.'
  }
  return 'Be warm, concise, and specific to their data.'
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { messages, explainWhy } = body as {
      messages: { role: string; content: string }[]
      explainWhy?: boolean
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          },
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const today = new Date().toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [profileRes, moodsRes, tasksRes, notesRes, factsRes, threadRes, healthRes, medsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('moods').select('*').eq('user_id', user.id).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(14),
      supabase.from('tasks').select('*').eq('user_id', user.id).eq('completed', false).gte('due_date', today).limit(10),
      supabase.from('notes').select('content, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('chat_memory_facts').select('fact').eq('user_id', user.id).order('created_at', { ascending: false }).limit(14),
      supabase.from('chat_messages').select('role, content').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('health_profiles').select('insurance_carrier, plan_name, plan_type, conditions, allergies').eq('user_id', user.id).single(),
      supabase.from('medications').select('name, dosage_mg, frequency, purpose').eq('user_id', user.id).eq('is_active', true).limit(20),
    ])

    const profile = profileRes.data
    const moods = moodsRes.data || []
    const incompleteTasks = tasksRes.data || []
    const recentNotes = notesRes.data || []
    const facts = (factsRes.data || []).map((f) => f.fact)
    const thread = (threadRes.data || []).reverse()
    const healthProfile = healthRes.data
    const activeMeds = medsRes.data || []

    // Language detection: check last 5 user messages
    const recentUserMessages = messages.filter((m) => m.role === 'user').slice(-5).map((m) => m.content)
    const detectedLang = detectLanguage(recentUserMessages) || profile?.preferred_language || 'en'
    const langLine = langInstruction(detectedLang)

    const avgMood = moods.length
      ? (moods.reduce((sum, m) => sum + m.score, 0) / moods.length).toFixed(1)
      : null

    const threadBlock =
      thread.length > 0
        ? thread.map((m) => `${m.role}: ${m.content.slice(0, 800)}`).join('\n')
        : '(no prior saved thread)'

    const factsBlock = facts.length ? facts.map((f, i) => `${i + 1}. ${f}`).join('\n') : '(none yet — user can save takeaways)'

    const explainRule = explainWhy
      ? 'When you make a recommendation, add one short sentence starting with "Because " that ties to their data or stated goals.'
      : ''

    const healthBlock = healthProfile || activeMeds.length > 0
      ? `\nHEALTH CONTEXT:\n${healthProfile ? `- Insurance: ${healthProfile.insurance_carrier || 'not set'} (${healthProfile.plan_type || '—'})\n- Conditions: ${healthProfile.conditions?.join(', ') || 'none listed'}\n- Allergies: ${healthProfile.allergies?.join(', ') || 'none listed'}` : '- No health profile set up yet'}${activeMeds.length > 0 ? `\n- Active medications: ${activeMeds.map((m) => `${m.name}${m.dosage_mg ? ` ${m.dosage_mg}mg` : ''}${m.frequency ? ` (${m.frequency})` : ''}`).join(', ')}` : ''}`
      : ''

    const systemPrompt = `You are Jalayu, a deeply personal AI life companion for ${profile?.nickname || profile?.full_name || 'this person'}.

${langLine}
TONE: ${toneFromProfile(profile?.work_type ?? null, profile?.struggles ?? null)}
${explainRule}

WHAT YOU KNOW ABOUT THEM:
- Work type: ${profile?.work_type || 'unknown'}
- Day structure: ${profile?.day_structure || 'unknown'}
- Peak productive hours: ${profile?.peak_hours || 'unknown'}
- Wake time: ${profile?.wake_time || 'unknown'}
- Biggest goal: "${profile?.biggest_goal || 'not shared yet'}"
- Struggles they face: ${profile?.struggles?.join(', ') || 'not specified'}
- Journey day: ${profile?.created_at ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)) + 1 : 1}
- Growth score: ${profile?.growth_score || 0}
- Streak: ${profile?.streak_count || 1} days

SAVED TAKEAWAYS (longer memory):
${factsBlock}

RECENT MOOD DATA (last 7 days, ${moods.length} entries):
${moods.length > 0 ? `Average mood: ${avgMood}/5. Recent scores: ${moods.slice(0, 7).map((m) => m.score).join(', ')}` : 'No mood data yet.'}

INCOMPLETE TASKS (${incompleteTasks.length}):
${incompleteTasks.length > 0 ? incompleteTasks.map((t) => `- ${t.title} (${t.priority} priority)`).join('\n') : 'No pending tasks.'}

RECENT MEMORY ENTRIES (${recentNotes.length}):
${recentNotes.length > 0 ? recentNotes.map((n) => `- "${n.content.slice(0, 100)}"`).join('\n') : 'No memory entries yet.'}

RECENT SAVED CHAT (oldest to newest within window):
${threadBlock}
${healthBlock}

YOUR ROLE:
You are warm, honest, direct, and genuinely care about this person's growth and wellbeing. You are not a generic AI assistant.

RULES:
- Never be generic. Always be specific to what you know about them.
- Reference their actual data when relevant.
- Keep responses concise — 1-3 short paragraphs unless they ask for more.
- Never diagnose or claim medical facts. You are not a therapist.
- If their mood has been low, acknowledge it gently.`

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
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
      },
    })
  } catch (err) {
    console.error('AI chat error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
