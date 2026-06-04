/**
 * Daily letter generator — Jalayu writes you a short note at the end
 * of the day, looking back at what happened.
 *
 * Inputs (all gathered from Supabase):
 *   - user context (name, goal, struggles, peak hours, etc.)
 *   - today's mood (if logged)
 *   - today's completed tasks
 *   - today's intents (research + drafts the shadow ran for them)
 *
 * Output: 2–3 paragraph markdown letter, lora-serif on the home card.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserContext, formatUserContextForPrompt } from '@/lib/user-context'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MODEL = 'claude-sonnet-4-20250514'

const SYSTEM_PROMPT = `You are Jalayu writing this person a short end-of-day letter. Not a productivity report. A letter. The kind a thoughtful friend who's been quietly watching your day would write — observant, specific, never preachy.

Rules:
- 2–3 short paragraphs. Total under 140 words.
- Reference SPECIFIC things from their day: a task they finished, an intent they fired at you, today's mood, a fragment of their reflection. If today was quiet, name that — don't invent texture.
- Don't recap the day in list form. Let observations breathe.
- Don't congratulate them ("Great job!"). Don't coach them ("Try focusing on…"). You're not their coach. You're walking beside them.
- If today's mood was rough, acknowledge it without trying to fix it. If it was good, name what helped.
- Close with one sentence that points forward gently — not a to-do, just a noticing about what tomorrow could be. Or a sentence that gives them permission to stop.
- Tone calibration: think the way Mary Oliver writes essays, not the way LinkedIn posts read.
- Output plain markdown. No headings. No bullet lists. No "Dear ___" salutation. Start straight into the observation.`

interface DayMood { score: number; created_at: string }
interface DayTask { title: string; completed_at: string; priority: string | null }
interface DayIntent { text: string; kind: string; result_summary: string | null; completed_at: string | null }

function localTodayBounds(): { startIso: string; endIso: string; dateKey: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const dateKey = `${y}-${m}-${d}`
  // Use UTC-bounded windows that comfortably include the user's local day.
  // For a more accurate per-user window we'd need their tz; treat the
  // current process-local day as good-enough until tz lands.
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = new Date(now);   end.setHours(23, 59, 59, 999)
  return { startIso: start.toISOString(), endIso: end.toISOString(), dateKey }
}

export interface LetterResult {
  textMd: string
  model: string
  letterDate: string
}

/**
 * Generate today's letter for `userId`. Caller is responsible for
 * persisting and dedup'ing — this function just produces text.
 */
export async function generateDailyLetter(
  supabase: SupabaseClient,
  userId: string,
): Promise<LetterResult> {
  const { startIso, endIso, dateKey } = localTodayBounds()

  const [moodsRes, tasksRes, intentsRes, userCtx] = await Promise.all([
    supabase
      .from('moods')
      .select('score, created_at')
      .eq('user_id', userId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('title, completed_at, priority')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('completed_at', startIso)
      .lte('completed_at', endIso),
    supabase
      .from('intents')
      .select('text, kind, result_summary, completed_at')
      .eq('user_id', userId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false }),
    getUserContext(supabase, userId).catch(() => null),
  ])

  const moods = (moodsRes.data ?? []) as DayMood[]
  const tasks = (tasksRes.data ?? []) as DayTask[]
  const intents = (intentsRes.data ?? []) as DayIntent[]

  // Compose a tight "today block" — the letter writer's raw material
  const lines: string[] = []
  lines.push(`[TODAY — ${dateKey}]`)
  if (moods.length > 0) {
    const latest = moods[0]
    lines.push(`Mood logs today: ${moods.length}. Most recent: ${latest.score}/5.`)
  } else {
    lines.push(`Mood: not logged today.`)
  }
  if (tasks.length > 0) {
    lines.push(`Tasks completed today: ${tasks.length}`)
    for (const t of tasks.slice(0, 6)) {
      const pri = t.priority === 'high' ? ' (high)' : ''
      lines.push(`  - ${t.title}${pri}`)
    }
  } else {
    lines.push(`No tasks marked done today.`)
  }
  if (intents.length > 0) {
    lines.push(`Intents fired at you today: ${intents.length}`)
    for (const i of intents.slice(0, 6)) {
      const summary = i.result_summary ? ` → ${i.result_summary.slice(0, 140)}` : ''
      lines.push(`  - [${i.kind}] "${i.text.slice(0, 140)}"${summary}`)
    }
  } else {
    lines.push(`They didn't ask you for anything today.`)
  }

  const todayBlock = lines.join('\n')
  const userBlock = userCtx ? formatUserContextForPrompt(userCtx) : ''

  const userMessage = `Write tonight's letter.

${todayBlock}`

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: `${SYSTEM_PROMPT}${userBlock}`,
    messages: [{ role: 'user', content: userMessage }],
  })

  let textMd = ''
  for (const block of resp.content) {
    if (block.type === 'text') textMd += block.text
  }
  textMd = textMd.trim()
  if (!textMd) throw new Error('Letter generator returned no text')

  return { textMd, model: MODEL, letterDate: dateKey }
}
