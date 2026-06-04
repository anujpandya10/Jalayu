/**
 * User context — what Jalayu knows about you, gathered fresh per intent.
 *
 * Every runner gets this as a system-prompt block so research and draft
 * answers are grounded in the actual person, not a generic stranger.
 *
 * The data is already in Supabase from the dashboard era — this just
 * walks it into the shadow's awareness.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface UserContextSnapshot {
  // Identity
  name: string
  nickname: string | null
  goal: string | null
  struggles: string[]
  peakHours: string | null
  journeyDay: number | null
  streak: number

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
      .select('full_name, nickname, biggest_goal, struggles, peak_hours, streak_count, created_at')
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
      .select('date, energy_note, accomplishment, focus_tomorrow, struggle')
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
  const goal = profile?.biggest_goal ?? null
  const struggles = Array.isArray(profile?.struggles) ? profile.struggles : []
  const peakHours = profile?.peak_hours ?? null
  const streak = profile?.streak_count ?? 0
  const journeyDay = profile?.created_at
    ? Math.max(1, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000) + 1)
    : null

  // Mood roll-up
  let moodAvg: number | null = null
  let todayMood: number | null = null
  if (moods.length > 0) {
    moodAvg = Math.round((moods.reduce((s, m) => s + Number(m.score), 0) / moods.length) * 10) / 10
    const todays = moods.find((m) => m.created_at.startsWith(today))
    todayMood = todays ? Number(todays.score) : null
  }

  // Reflection — concatenate the non-empty fields into one short paragraph
  let recentReflection: UserContextSnapshot['recentReflection'] = null
  if (reflection) {
    const bits = [reflection.energy_note, reflection.accomplishment, reflection.struggle, reflection.focus_tomorrow]
      .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      .map((b) => b.trim())
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

  return {
    name,
    nickname,
    goal,
    struggles,
    peakHours,
    journeyDay,
    streak,
    moodAvg,
    moodCount: moods.length,
    todayMood,
    recentReflection,
    pendingTasks,
    recentIntents,
  }
}

/**
 * Render the snapshot as a system-prompt block. Capped to roughly
 * ~500 tokens of plain text. Returns empty string if there's no
 * meaningful identity yet (brand-new user).
 */
export function formatUserContextForPrompt(ctx: UserContextSnapshot): string {
  // Skip the whole block if we have basically nothing to say
  if (!ctx.goal && !ctx.recentReflection && ctx.pendingTasks.length === 0 && ctx.recentIntents.length === 0) {
    return ''
  }

  const lines: string[] = []
  lines.push(`[ABOUT THIS PERSON]`)

  // Identity line
  const identityBits: string[] = []
  identityBits.push(`Name: ${ctx.name}${ctx.nickname && ctx.nickname !== ctx.name ? ` ("${ctx.nickname}")` : ''}`)
  if (ctx.journeyDay) identityBits.push(`Day ${ctx.journeyDay} with Jalayu`)
  if (ctx.streak > 0) identityBits.push(`${ctx.streak}-day streak`)
  lines.push(identityBits.join(' · '))

  if (ctx.goal) lines.push(`What they're working toward: ${ctx.goal}`)
  if (ctx.struggles.length > 0) lines.push(`Things they struggle with: ${ctx.struggles.join(', ')}`)
  if (ctx.peakHours) lines.push(`Peak hours: ${ctx.peakHours}`)

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

  lines.push('')
  lines.push(
    `Use this to be specific, not generic. Reference their real life when it helps. Don't lecture them about their goals — just be naturally aware of them. Don't recap this list back at them. If today's mood was rough, don't pretend; just match the room.`,
  )

  return '\n\n' + lines.join('\n') + '\n'
}
