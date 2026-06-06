/**
 * User context — what Jalayu knows about you, gathered fresh per intent.
 *
 * Every runner gets this as a system-prompt block so research, draft, and
 * code answers are grounded in the actual person, not a generic stranger.
 *
 * Inputs:
 *   - profile (identity, life stage, goal, struggles, voice prefs, domains, boundaries)
 *   - last 7 days of moods (avg + today)
 *   - latest reflection within 3 days
 *   - top 5 pending tasks
 *   - last 5 completed intents
 *   - last 3 profile_notes (from letter replies / ongoing learning)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

interface ProfileNoteRow {
  asked_at?: string
  prompt?: string
  answer?: string
  source?: string
}

export interface UserContextSnapshot {
  // Identity
  name: string
  nickname: string | null
  pronouns: string | null
  goal: string | null
  struggles: string[]
  peakHours: string | null
  journeyDay: number | null
  streak: number

  // Onboarding v2 fields (027) — shape the shadow's voice and reach
  lifeStage: string | null
  helpDomains: string[]
  voicePrefs: string[]
  boundaries: string | null

  // Recent state (last 7 days)
  moodAvg: number | null
  moodCount: number
  todayMood: number | null

  // Latest reflection (only if within 3 days)
  recentReflection: { date: string; text: string } | null

  // What they're trying to get done
  pendingTasks: { title: string; due: string | null; priority: string | null }[]

  // What they've asked the shadow recently (last 5)
  recentIntents: { text: string; kind: string; whenIso: string }[]

  // Last 3 profile notes (from letter replies / ongoing learning)
  profileNotes: { askedAt: string; prompt: string; answer: string }[]
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoISO(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
}

/**
 * Pull everything we know about `userId` into a compact snapshot.
 * Best-effort: any query failing degrades to that field being empty,
 * never throws. The runner can always proceed without context.
 */
export async function getUserContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserContextSnapshot> {
  const today = todayISO()
  const sevenDaysAgo = daysAgoISO(7)
  const threeDaysAgo = daysAgoISO(3)

  const [profileRes, moodsRes, reflectionRes, tasksRes, intentsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        // Identity + legacy + onboarding v2 fields
        'full_name, nickname, pronouns, biggest_goal, struggles, peak_hours, streak_count, created_at, life_stage, help_domains, voice_prefs, boundaries, profile_notes',
      )
      .eq('id', userId)
      .single(),
    supabase
      .from('moods')
      .select('score, created_at')
      .eq('user_id', userId)
      .gte('created_at', `${sevenDaysAgo}T00:00:00`)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('reflections')
      // Use the real schema columns — earlier code referenced
      // non-existent fields and silently returned nothing.
      .select('date, one_word, tomorrow_note, win_of_day, grateful_for, mood_score, energy_score')
      .eq('user_id', userId)
      .gte('date', threeDaysAgo)
      .order('date', { ascending: false })
      .limit(1),
    supabase
      .from('tasks')
      .select('title, due_date, priority')
      .eq('user_id', userId)
      .eq('completed', false)
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from('intents')
      .select('text, kind, completed_at, created_at')
      .eq('user_id', userId)
      .eq('status', 'done')
      .order('completed_at', { ascending: false })
      .limit(5),
  ])

  const profile = profileRes.data
  const moods = moodsRes.data ?? []
  const reflection = reflectionRes.data?.[0] ?? null
  const tasks = tasksRes.data ?? []
  const intents = intentsRes.data ?? []

  // Identity
  const name = profile?.full_name?.split(' ')[0] || profile?.nickname || 'this person'
  const nickname = profile?.nickname ?? null
  const pronouns = profile?.pronouns ?? null
  const goal = profile?.biggest_goal ?? null
  const struggles = Array.isArray(profile?.struggles) ? profile.struggles : []
  const peakHours = profile?.peak_hours ?? null
  const streak = profile?.streak_count ?? 0
  const journeyDay = profile?.created_at
    ? Math.max(1, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000) + 1)
    : null

  // Onboarding v2
  const lifeStage = profile?.life_stage ?? null
  const helpDomains = Array.isArray(profile?.help_domains) ? profile.help_domains : []
  const voicePrefs = Array.isArray(profile?.voice_prefs) ? profile.voice_prefs : []
  const boundaries = profile?.boundaries ?? null

  // Mood roll-up
  let moodAvg: number | null = null
  let todayMood: number | null = null
  if (moods.length > 0) {
    moodAvg = Math.round((moods.reduce((s, m) => s + Number(m.score), 0) / moods.length) * 10) / 10
    const todays = moods.find((m) => m.created_at.startsWith(today))
    todayMood = todays ? Number(todays.score) : null
  }

  // Reflection — concatenate the non-empty real-schema fields into one short paragraph
  let recentReflection: UserContextSnapshot['recentReflection'] = null
  if (reflection) {
    const bits: string[] = []
    if (typeof reflection.one_word === 'string' && reflection.one_word.trim().length > 0) {
      bits.push(`Mood word: "${reflection.one_word.trim()}"`)
    }
    if (typeof reflection.win_of_day === 'string' && reflection.win_of_day.trim().length > 0) {
      bits.push(`Win: ${reflection.win_of_day.trim()}`)
    }
    if (typeof reflection.grateful_for === 'string' && reflection.grateful_for.trim().length > 0) {
      bits.push(`Grateful for: ${reflection.grateful_for.trim()}`)
    }
    if (typeof reflection.tomorrow_note === 'string' && reflection.tomorrow_note.trim().length > 0) {
      bits.push(`Note for tomorrow: ${reflection.tomorrow_note.trim()}`)
    }
    if (typeof reflection.mood_score === 'number' || typeof reflection.energy_score === 'number') {
      const scoreBits: string[] = []
      if (typeof reflection.mood_score === 'number') scoreBits.push(`mood ${reflection.mood_score}/5`)
      if (typeof reflection.energy_score === 'number') scoreBits.push(`energy ${reflection.energy_score}/5`)
      bits.push(scoreBits.join(', '))
    }
    if (bits.length > 0) {
      recentReflection = { date: reflection.date, text: bits.join(' · ').slice(0, 400) }
    }
  }

  // Pending tasks — surface high-priority + overdue first
  const pendingTasks = tasks.map((t) => ({
    title: t.title,
    due: t.due_date ?? null,
    priority: t.priority ?? null,
  }))

  // Recent intents
  const recentIntents = intents.map((i) => ({
    text: i.text,
    kind: i.kind,
    whenIso: i.completed_at ?? i.created_at,
  }))

  // Profile notes — newest first; cap to 3 for prompt budget
  const profileNotesRaw = Array.isArray(profile?.profile_notes)
    ? (profile.profile_notes as ProfileNoteRow[])
    : []
  const profileNotes = profileNotesRaw
    .slice(0, 3)
    .map((n) => ({
      askedAt: typeof n.asked_at === 'string' ? n.asked_at : '',
      prompt: typeof n.prompt === 'string' ? n.prompt : '',
      answer: typeof n.answer === 'string' ? n.answer : '',
    }))
    .filter((n) => n.prompt.length > 0 && n.answer.length > 0)

  return {
    name,
    nickname,
    pronouns,
    goal,
    struggles,
    peakHours,
    journeyDay,
    streak,
    lifeStage,
    helpDomains,
    voicePrefs,
    boundaries,
    moodAvg,
    moodCount: moods.length,
    todayMood,
    recentReflection,
    pendingTasks,
    recentIntents,
    profileNotes,
  }
}

/**
 * Render the snapshot as a system-prompt block. Capped to roughly
 * ~500 tokens of plain text. Returns empty string if there's no
 * meaningful identity yet (brand-new user with nothing filled in).
 */
export function formatUserContextForPrompt(ctx: UserContextSnapshot): string {
  // Skip the whole block only if we genuinely know nothing meaningful
  const hasAnything =
    ctx.goal ||
    ctx.lifeStage ||
    ctx.voicePrefs.length > 0 ||
    ctx.helpDomains.length > 0 ||
    ctx.boundaries ||
    ctx.recentReflection ||
    ctx.pendingTasks.length > 0 ||
    ctx.recentIntents.length > 0 ||
    ctx.profileNotes.length > 0
  if (!hasAnything) return ''

  const lines: string[] = []
  lines.push(`[ABOUT THIS PERSON]`)

  // Identity line
  const identityBits: string[] = []
  let nameBit = `Name: ${ctx.name}`
  if (ctx.nickname && ctx.nickname !== ctx.name) nameBit += ` ("${ctx.nickname}")`
  if (ctx.pronouns) nameBit += ` · ${ctx.pronouns}`
  identityBits.push(nameBit)
  if (ctx.journeyDay) identityBits.push(`Day ${ctx.journeyDay} with Jalayu`)
  if (ctx.streak > 0) identityBits.push(`${ctx.streak}-day streak`)
  lines.push(identityBits.join(' · '))

  if (ctx.lifeStage) lines.push(`Season of life: ${ctx.lifeStage}`)
  if (ctx.goal) lines.push(`What's on their mind: ${ctx.goal}`)
  if (ctx.struggles.length > 0) lines.push(`What gets in the way: ${ctx.struggles.join(' / ')}`)
  if (ctx.peakHours) lines.push(`Peak hours: ${ctx.peakHours}`)

  if (ctx.helpDomains.length > 0) {
    lines.push(`They typically come to you for: ${ctx.helpDomains.join(', ')}.`)
  }

  // Vibe of the week
  if (ctx.moodAvg !== null && ctx.moodCount > 0) {
    const vibe = ctx.moodAvg <= 2.5 ? 'rough stretch' : ctx.moodAvg >= 4 ? 'good stretch' : 'middling stretch'
    const todayLine = ctx.todayMood ? ` Today: ${ctx.todayMood}/5.` : ' Today: not logged yet.'
    lines.push(`Last 7 days mood: ${ctx.moodAvg.toFixed(1)}/5 across ${ctx.moodCount} log${ctx.moodCount === 1 ? '' : 's'} (${vibe}).${todayLine}`)
  }

  if (ctx.recentReflection) {
    lines.push(`Recent reflection (${ctx.recentReflection.date}): "${ctx.recentReflection.text}"`)
  }

  if (ctx.pendingTasks.length > 0) {
    lines.push(`Pending tasks they're carrying:`)
    for (const t of ctx.pendingTasks) {
      const tags: string[] = []
      if (t.priority === 'high') tags.push('high priority')
      if (t.due) tags.push(`due ${t.due}`)
      const tagStr = tags.length > 0 ? ` (${tags.join(', ')})` : ''
      lines.push(`  - ${t.title}${tagStr}`)
    }
  }

  if (ctx.recentIntents.length > 0) {
    lines.push(`Recent intents they fired at you:`)
    for (const i of ctx.recentIntents) {
      const when = i.whenIso.slice(0, 10)
      lines.push(`  - [${when} · ${i.kind}] "${i.text.slice(0, 140)}"`)
    }
  }

  if (ctx.profileNotes.length > 0) {
    lines.push(`Past notes from them (most recent first):`)
    for (const n of ctx.profileNotes) {
      const when = n.askedAt.slice(0, 10)
      lines.push(`  - [${when}] You asked: "${n.prompt.slice(0, 140)}"`)
      lines.push(`    They replied: "${n.answer.slice(0, 200)}"`)
    }
  }

  // VOICE — high-impact instruction line. Render this LAST so it sits
  // next to the closing guidance and shapes the tone of the reply.
  if (ctx.voicePrefs.length > 0) {
    lines.push('')
    lines.push(`Voice — speak to them this way: ${ctx.voicePrefs.join('; ')}.`)
  }

  if (ctx.boundaries && ctx.boundaries.trim().length > 0) {
    lines.push(`Never bring up or steer around: ${ctx.boundaries.trim()}.`)
  }

  lines.push('')
  lines.push(
    `Use all of the above to be specific, not generic. Reference their real life when it helps. Don't lecture them about their goals — just be naturally aware of them. Don't recap this list back at them. If today's mood was rough, don't pretend; just match the room.`,
  )

  return '\n\n' + lines.join('\n') + '\n'
}
