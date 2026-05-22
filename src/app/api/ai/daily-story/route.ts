/**
 * Daily Story — AI writes a narrative of the user's day using all their data.
 *
 *   GET  /api/ai/daily-story?date=YYYY-MM-DD  → generates + saves
 *
 * The story is written in warm, specific prose (NOT bullet points). It pulls
 * from: notes created/edited today, tasks completed/added, mood, calendar,
 * trades, and chat themes. The output saves as a note inside an auto-created
 * "📖 Daily Story" folder so the user accumulates a real journal over time.
 *
 * Idempotent for a given date: if a story already exists, it's returned
 * (re-generation requires ?regen=1).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const STORY_FOLDER_NAME = '📖 Daily Story'

function isoDateOnly(d: Date): string {
  return d.toISOString().split('T')[0]
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const url = new URL(req.url)
    const dateParam = url.searchParams.get('date') || isoDateOnly(new Date())
    const regen = url.searchParams.get('regen') === '1'

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ error: 'Invalid date — use YYYY-MM-DD' }, { status: 400 })
    }

    // ── Ensure the Daily Story folder exists ────────────────────────────────
    let { data: folder } = await supabase
      .from('notes')
      .select('id, content')
      .eq('user_id', user.id)
      .eq('is_folder', true)
      .eq('content', STORY_FOLDER_NAME)
      .maybeSingle()
    if (!folder) {
      const { data: created } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          content: STORY_FOLDER_NAME,
          is_folder: true,
          type: 'note',
        })
        .select('id, content')
        .single()
      folder = created
    }
    if (!folder) {
      return NextResponse.json({ error: 'Could not create story folder' }, { status: 500 })
    }

    // ── Existing story for this date? ───────────────────────────────────────
    const dateLabel = new Date(`${dateParam}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
    const noteTitle = `${dateLabel}`

    const { data: existing } = await supabase
      .from('notes')
      .select('id, content, body_md, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('parent_id', folder.id)
      .eq('content', noteTitle)
      .maybeSingle()

    if (existing && !regen) {
      return NextResponse.json({
        story: existing.body_md ?? '',
        note: existing,
        cached: true,
        folder_id: folder.id,
      })
    }

    // ── Pull the day's data ─────────────────────────────────────────────────
    const dayStart = new Date(`${dateParam}T00:00:00`)
    const dayEnd = new Date(`${dateParam}T23:59:59.999`)
    const dayStartIso = dayStart.toISOString()
    const dayEndIso = dayEnd.toISOString()

    const [
      profileRes,
      notesCreatedRes,
      notesEditedRes,
      tasksCompletedRes,
      tasksAddedRes,
      moodRes,
      tradesRes,
      reflectionsRes,
      chatRes,
    ] = await Promise.all([
      supabase.from('profiles').select('nickname, full_name, biggest_goal, peak_hours, struggles').eq('id', user.id).single(),
      supabase.from('notes').select('content, body_md, is_folder, type, tags').eq('user_id', user.id)
        .gte('created_at', dayStartIso).lte('created_at', dayEndIso)
        .order('created_at', { ascending: true }).limit(30),
      supabase.from('notes').select('content, body_md, is_folder, type, updated_at, created_at').eq('user_id', user.id)
        .gte('updated_at', dayStartIso).lte('updated_at', dayEndIso)
        .lt('created_at', dayStartIso)  // edited today, but created earlier
        .order('updated_at', { ascending: true }).limit(15),
      supabase.from('tasks').select('title, priority, completed_at').eq('user_id', user.id).eq('completed', true)
        .gte('completed_at', dayStartIso).lte('completed_at', dayEndIso).limit(30),
      supabase.from('tasks').select('title, priority, due_date').eq('user_id', user.id).eq('completed', false)
        .gte('created_at', dayStartIso).lte('created_at', dayEndIso).limit(15),
      supabase.from('moods').select('score, note').eq('user_id', user.id).eq('date', dateParam).maybeSingle(),
      supabase.from('paper_trades').select('symbol, action, pnl, reason, direction').eq('user_id', user.id)
        .gte('created_at', dayStartIso).lte('created_at', dayEndIso)
        .neq('pnl', null).order('created_at', { ascending: true }).limit(30),
      supabase.from('reflections').select('one_word, win_of_day, tomorrow_note').eq('user_id', user.id).eq('date', dateParam).maybeSingle(),
      supabase.from('chat_messages').select('role, content, created_at').eq('user_id', user.id)
        .gte('created_at', dayStartIso).lte('created_at', dayEndIso)
        .order('created_at', { ascending: true }).limit(30),
    ])

    const profile = profileRes.data
    const notesCreated = (notesCreatedRes.data ?? []).filter((n) => !n.is_folder)
    const notesEdited = (notesEditedRes.data ?? []).filter((n) => !n.is_folder)
    const tasksDone = tasksCompletedRes.data ?? []
    const tasksAdded = tasksAddedRes.data ?? []
    const mood = moodRes.data
    const trades = tradesRes.data ?? []
    const reflection = reflectionsRes.data
    const userMessages = (chatRes.data ?? []).filter((m) => m.role === 'user')

    const noActivity =
      notesCreated.length === 0 &&
      notesEdited.length === 0 &&
      tasksDone.length === 0 &&
      tasksAdded.length === 0 &&
      !mood &&
      trades.length === 0 &&
      !reflection &&
      userMessages.length === 0

    if (noActivity) {
      const placeholder = `A quiet day — nothing logged on ${dateLabel}.`
      return NextResponse.json({ story: placeholder, cached: false, folder_id: folder.id, empty: true })
    }

    // Trading P&L for the day
    const dayPnl = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0)
    const wins = trades.filter((t) => Number(t.pnl) > 0).length
    const losses = trades.filter((t) => Number(t.pnl) < 0).length

    // ── Build the data block ────────────────────────────────────────────────
    const name = profile?.nickname || profile?.full_name || 'they'
    const goal = profile?.biggest_goal || null
    const peak = profile?.peak_hours || null

    const block = `DATE: ${dateLabel}
USER: ${name}${goal ? ` — biggest goal: ${goal}` : ''}${peak ? ` — peak hours: ${peak}` : ''}

MOOD TODAY: ${mood ? `${mood.score}/5${mood.note ? ` — "${mood.note}"` : ''}` : 'not logged'}

NOTES CREATED TODAY (${notesCreated.length}):
${notesCreated.map((n) => {
  const title = (n.content as string).split('\n')[0].slice(0, 100)
  const body = ((n.body_md as string | null) || '').slice(0, 600).replace(/\n+/g, ' ')
  return `  • "${title}"${body ? `\n      ${body}${body.length >= 600 ? '…' : ''}` : ''}`
}).join('\n') || '  (none)'}

NOTES EDITED TODAY (${notesEdited.length}):
${notesEdited.map((n) => {
  const title = (n.content as string).split('\n')[0].slice(0, 100)
  return `  • "${title}"`
}).join('\n') || '  (none)'}

TASKS COMPLETED (${tasksDone.length}):
${tasksDone.map((t) => `  ✓ ${t.title}${t.priority ? ` [${t.priority}]` : ''}`).join('\n') || '  (none)'}

TASKS ADDED (${tasksAdded.length}):
${tasksAdded.map((t) => `  + ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}`).join('\n') || '  (none)'}

TRADING ACTIVITY:
${trades.length === 0 ? '  (none today)' :
  `  ${trades.length} trades · ${wins} wins / ${losses} losses · net ${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(2)}\n` +
  trades.slice(0, 6).map((t) => `  • ${t.action} ${t.symbol} ${t.direction || ''} — ${(Number(t.pnl) >= 0 ? '+' : '') + '$' + Number(t.pnl).toFixed(2)} — ${(t.reason || '').slice(0, 60)}`).join('\n')
}

REFLECTION (from end-of-day prompt):
${reflection ? `  Word: ${reflection.one_word || '—'}\n  Win: ${reflection.win_of_day || '—'}\n  Tomorrow: ${reflection.tomorrow_note || '—'}` : '  (not logged)'}

CHAT THEMES (what they asked Jalayu about):
${userMessages.length === 0 ? '  (no chat today)' :
  userMessages.slice(-10).map((m) => `  • "${(m.content as string).slice(0, 140)}"`).join('\n')
}`

    // ── Generate the story ──────────────────────────────────────────────────
    const system = `You are writing a short personal narrative of someone's day, using their actual data. Like a thoughtful friend who's been paying attention and recaps the day with them at bedtime.

VOICE & STYLE:
- Warm, observant, specific. Use the second person ("you").
- 3-5 short paragraphs. NOT bullet points. NOT a summary. A STORY.
- Reference actual things from the data — specific note titles, task names, symbols traded, mood numbers. The more specific, the better.
- Show, don't list. "You opened the FreshDabba pitch around 11 and your mood ticked up" beats "Mood: 4. Notes: FreshDabba."
- Light arc when possible: morning → afternoon → evening, or low → high → settled.
- If it was a quiet day, say that honestly — don't pad.
- End with a small, grounded observation about tomorrow OR a noticed pattern. NOT a pep talk.

ABSOLUTE RULES:
- NEVER invent details that aren't in the data. If you don't know what they did between events, leave the gap.
- NEVER use phrases like "you crushed it", "great job", "amazing work", "you should feel proud". Be a witness, not a coach.
- NEVER moralize. No "remember to rest" type endings.
- Don't repeat numbers more than once. If mood was 4/5, say it once.
- Don't list every task. Pick the ones that matter and weave them in.
- 400 words max. Less is fine if the day was light.

TONE EXAMPLES:
✓ "The morning was scattered — three quick captures in the FreshDabba folder, all about pricing. Then you went quiet until lunch."
✗ "You had a productive morning! You created 3 notes about pricing for FreshDabba."

✓ "Your mood was 3/5 — about average for a Wednesday — and the trading session ended slightly red (-$0.40 on two short positions that didn't work out)."
✗ "Mood: 3/5. Trading: -$0.40. Two losing shorts."

OUTPUT: Just the story in markdown. No title (the note has a date title already). No preamble. Just write.`

    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: block }],
    })

    const story = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim()

    if (!story) {
      return NextResponse.json({ error: 'Story generation came back empty' }, { status: 500 })
    }

    // ── Save / upsert the note ─────────────────────────────────────────────
    if (existing) {
      const { data: updated, error } = await supabase
        .from('notes')
        .update({
          body_md: story,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', user.id)
        .select()
        .single()
      if (error) {
        return NextResponse.json({ error: 'Could not save story' }, { status: 500 })
      }
      return NextResponse.json({ story, note: updated, cached: false, folder_id: folder.id })
    }

    const { data: newNote, error } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        content: noteTitle,
        body_md: story,
        type: 'note',
        parent_id: folder.id,
        meta: { hideFromHome: true },  // don't clutter home — these live in the Story folder
      })
      .select()
      .single()
    if (error) {
      return NextResponse.json({ error: 'Could not save story' }, { status: 500 })
    }

    return NextResponse.json({ story, note: newNote, cached: false, folder_id: folder.id })
  } catch (err) {
    console.error('[daily-story] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
