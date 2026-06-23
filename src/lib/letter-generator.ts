/**
 * Letter generator — two variants, one shared backbone.
 *
 *   generateDailyLetter(supabase, userId)
 *     Looks back at today (moods, completed tasks, today's intents) and
 *     writes a 2–3 paragraph evening letter. Optionally ends with a
 *     deepening question once every ~7 days. Updates last_deepening_at
 *     when a question lands so the cadence stays honest.
 *
 *   generateWelcomeLetter(supabase, userId)
 *     The first letter a new user ever receives — written right after
 *     onboarding from their answers, before they have any moods, tasks,
 *     or intents. Proves Jalayu was listening.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserContext, formatUserContextForPrompt, type UserContextSnapshot } from '@/lib/user-context'

import { getUserAnthropic } from '@/lib/user-ai'

const MODEL = 'claude-sonnet-4-20250514'

const DAILY_SYSTEM_PROMPT = `You are Jalayu writing this person a short end-of-day letter. Not a productivity report. A letter. The kind a thoughtful friend who's been quietly watching your day would write — observant, specific, never preachy.

Rules:
- 2–3 short paragraphs. Total under 140 words.
- Reference SPECIFIC things from their day: a task they finished, an intent they fired at you, today's mood, a fragment of their reflection. If today was quiet, name that — don't invent texture.
- Don't recap the day in list form. Let observations breathe.
- Don't congratulate them ("Great job!"). Don't coach them ("Try focusing on…"). You're not their coach. You're walking beside them.
- If today's mood was rough, acknowledge it without trying to fix it. If it was good, name what helped.
- Close with one sentence that points forward gently — not a to-do, just a noticing about what tomorrow could be. Or a sentence that gives them permission to stop.
- Tone calibration: think the way Mary Oliver writes essays, not the way LinkedIn posts read.
- Output plain markdown. No headings. No bullet lists. No "Dear ___" salutation. Start straight into the observation.`

const WELCOME_SYSTEM_PROMPT = `You are Jalayu writing this person the very first letter they'll ever receive from you. They just finished onboarding — they told you their name, where they are in life, what's on their mind, what gets in the way, how they want you to talk to them, and possibly what's off-limits.

Rules:
- 2–3 short paragraphs. Total under 140 words.
- Show you HEARD them. Reference at least two specific things they shared — not as a list, but woven in. If they mentioned a specific situation, name it back. If they picked a specific voice (e.g. "no coaching"), match it from the first line.
- Don't introduce yourself again — they just met you. Don't say "I'm Jalayu" or "Welcome to the app."
- Don't make promises about features. This is a letter, not a product pitch.
- Don't congratulate them ("Great job completing onboarding!"). Walk beside them.
- Close with one sentence that gives them a soft landing — permission to take their time, no pressure on the first ask.
- Tone calibration: a friend writing the first letter after a quiet conversation. Think Rilke, not LinkedIn.
- Output plain markdown. No headings, no bullet lists, no "Dear ___" salutation. Start straight into the observation.`

interface DayMood { score: number; created_at: string }
interface DayTask { title: string; completed_at: string; priority: string | null }
interface DayIntent { text: string; kind: string; result_summary: string | null; completed_at: string | null }

function localTodayBounds(): { startIso: string; endIso: string; dateKey: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const dateKey = `${y}-${m}-${d}`
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = new Date(now);   end.setHours(23, 59, 59, 999)
  return { startIso: start.toISOString(), endIso: end.toISOString(), dateKey }
}

export interface LetterResult {
  textMd: string
  model: string
  letterDate: string
  deepeningQuestion: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Deepening question — only included once every ~7 days
// ─────────────────────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

interface ProfileMeta {
  boundaries: string | null
  voice_prefs: string[] | null
  help_domains: string[] | null
  life_stage: string | null
  last_deepening_at: string | null
}

function isEligibleForDeepening(meta: ProfileMeta): boolean {
  if (!meta.last_deepening_at) return true
  const last = new Date(meta.last_deepening_at).getTime()
  return Number.isFinite(last) && Date.now() - last > SEVEN_DAYS_MS
}

/**
 * Pick the next deepening question by walking a priority list of thin or
 * stale profile areas. Returns null if nothing's missing — we'd rather
 * skip a week than ask a pointless question.
 */
function chooseDeepeningQuestion(
  meta: ProfileMeta,
  ctx: UserContextSnapshot | null,
): string | null {
  if ((meta.boundaries ?? '').trim().length === 0) {
    return "Is there anything you'd rather I never bring up?"
  }
  if (!meta.voice_prefs || meta.voice_prefs.length === 0) {
    return 'How are you wanting me to talk to you these days?'
  }
  if (!meta.help_domains || meta.help_domains.length <= 1) {
    return "What kinds of things would you want me to help with that I'm not yet?"
  }
  if (!meta.life_stage || meta.life_stage.trim().length === 0) {
    return 'Where are you in life right now?'
  }

  // Theme detection across recent intents — if 3+ share a common content word,
  // ask about it. We use ctx.recentIntents which is already capped to ~5.
  if (ctx && ctx.recentIntents.length >= 3) {
    const stopwords = new Set([
      'the', 'and', 'for', 'with', 'how', 'what', 'why', 'when', 'this', 'that',
      'about', 'into', 'from', 'just', 'some', 'have', 'are', 'you', 'your',
      'can', 'will', 'would', 'should', 'a', 'an', 'is', 'it', 'to', 'of', 'in',
      'on', 'at', 'by', 'or', 'as', 'be', 'i', 'me', 'my',
    ])
    const counts = new Map<string, number>()
    for (const i of ctx.recentIntents) {
      const tokens = i.text.toLowerCase().match(/[a-z]{4,}/g) ?? []
      for (const t of tokens) {
        if (stopwords.has(t)) continue
        counts.set(t, (counts.get(t) ?? 0) + 1)
      }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    if (sorted.length > 0 && sorted[0][1] >= 3) {
      return `I noticed you've been asking me about "${sorted[0][0]}" a few times. What's that about?`
    }
  }

  return "What's something I should know about you that I don't yet?"
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared LLM call
// ─────────────────────────────────────────────────────────────────────────────

async function callClaude(system: string, userMessage: string, client: Anthropic): Promise<string> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system,
    messages: [{ role: 'user', content: userMessage }],
  })
  let textMd = ''
  for (const block of resp.content) {
    if (block.type === 'text') textMd += block.text
  }
  textMd = textMd.trim()
  if (!textMd) throw new Error('Letter generator returned no text')
  return textMd
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily letter
// ─────────────────────────────────────────────────────────────────────────────

export async function generateDailyLetter(
  supabase: SupabaseClient,
  userId: string,
): Promise<LetterResult> {
  const { startIso, endIso, dateKey } = localTodayBounds()

  const [moodsRes, tasksRes, intentsRes, userCtx, profileRes] = await Promise.all([
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
    supabase
      .from('profiles')
      .select('boundaries, voice_prefs, help_domains, life_stage, last_deepening_at')
      .eq('id', userId)
      .single(),
  ])

  const moods = (moodsRes.data ?? []) as DayMood[]
  const tasks = (tasksRes.data ?? []) as DayTask[]
  const intents = (intentsRes.data ?? []) as DayIntent[]

  // ── Today block ──────────────────────────────────────────────────────────
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

  // ── Deepening question (maybe) ───────────────────────────────────────────
  const meta = (profileRes.data as ProfileMeta | null) ?? null
  let deepeningQuestion: string | null = null
  if (meta && isEligibleForDeepening(meta)) {
    deepeningQuestion = chooseDeepeningQuestion(meta, userCtx)
  }

  const questionInstruction = deepeningQuestion
    ? `\n\n[DEEPENING QUESTION]\nAfter your closing sentence, on a new paragraph, ask this question in your own voice — phrased naturally, not verbatim if you can soften it: "${deepeningQuestion}". Don't answer it yourself. End the letter with the question.`
    : ''

  const userMessage = `Write tonight's letter.\n\n${todayBlock}`

  const textMd = await callClaude(
    `${DAILY_SYSTEM_PROMPT}${userBlock}${questionInstruction}`,
    userMessage,
    await getUserAnthropic(userId),
  )

  // Stamp last_deepening_at if we successfully wove a question in
  if (deepeningQuestion) {
    await supabase
      .from('profiles')
      .update({ last_deepening_at: new Date().toISOString() })
      .eq('id', userId)
  }

  return { textMd, model: MODEL, letterDate: dateKey, deepeningQuestion }
}

// ─────────────────────────────────────────────────────────────────────────────
// Welcome letter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write the very first letter for a user who just finished onboarding.
 * Uses ONLY the profile they just filled in — there's no day data yet.
 */
export async function generateWelcomeLetter(
  supabase: SupabaseClient,
  userId: string,
): Promise<LetterResult> {
  const { dateKey } = localTodayBounds()

  const userCtx = await getUserContext(supabase, userId).catch(() => null)
  const userBlock = userCtx ? formatUserContextForPrompt(userCtx) : ''

  const userMessage =
    `This is the very first letter. They've just finished telling you who they are. Write back from what you heard.`

  const textMd = await callClaude(
    `${WELCOME_SYSTEM_PROMPT}${userBlock}`,
    userMessage,
    await getUserAnthropic(userId),
  )

  return { textMd, model: MODEL, letterDate: dateKey, deepeningQuestion: null }
}
