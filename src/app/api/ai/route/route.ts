/**
 * Universal capture + search + query router.
 *
 * Three modes:
 *   capture → classify a captured thought + save to the right destination
 *   search  → search across notes, tasks, vault names, calendar
 *   query   → answer a contextual question ("what now?", "what's next?")
 *
 * Mode is either explicit (body.mode) or auto-detected from the text.
 *
 * Security: all queries scoped to auth.uid() via Supabase RLS + explicit
 *   .eq('user_id', user.id) on every query.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface ScreenContext {
  view?: string
  folderId?: string | null
  folderName?: string | null
  noteId?: string | null
  noteName?: string | null
}

interface RouteBody {
  text: string
  mode?: 'capture' | 'search' | 'query' | 'auto'
  context?: ScreenContext
}

// ── Auto mode detection ────────────────────────────────────────────────────
function autoMode(text: string): 'capture' | 'search' | 'query' {
  const t = text.trim().toLowerCase()
  // Query: what/why/how/when questions, "what now" type intent
  if (
    /^(what|why|how|when|where|who)\b/.test(t) ||
    /^(should|can|could|would)\b/.test(t) ||
    /^(tell me|explain|summari[sz]e)\b/.test(t) ||
    /\bwhat now\b|\bwhat should i\b|\bwhat'?s next\b/.test(t) ||
    t.endsWith('?')
  ) return 'query'
  // Search: explicit search verbs or "find"
  if (/^(find|search|look up|show me|where is|find me)\b/.test(t)) return 'search'
  // Default: capture
  return 'capture'
}

// ────────────────────────────────────────────────────────────────────────────
// CAPTURE MODE — classify text into a destination + structured payload
// ────────────────────────────────────────────────────────────────────────────

interface CaptureClassification {
  destination: 'task' | 'note' | 'calendar' | 'reminder' | 'mood' | 'vault_hint' | 'trading_note'
  confidence: number
  title?: string
  body?: string
  date?: string          // YYYY-MM-DD
  time?: string          // HH:MM 24h
  mood_score?: number    // 1-5
  is_sensitive?: boolean // flagged as password/secret looking
  reason: string
}

async function classifyCapture(text: string, screen?: ScreenContext): Promise<CaptureClassification> {
  const today = new Date().toISOString().split('T')[0]
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const system = `You classify a person's quickly-captured thought into the right destination in their personal dashboard.

Today: ${today} (timezone: ${tz})
${screen?.folderName ? `User is currently viewing folder: "${screen.folderName}"` : ''}
${screen?.view ? `User is currently in view: ${screen.view}` : ''}

DESTINATIONS:
- task: a thing to do, with no specific time. "Pay rent", "buy groceries", "follow up with Anna"
- note: an idea, observation, fact, piece of info. "Bob's daughter started med school", "idea: a subscription that..."
- calendar: an event with a specific date and/or time. "Meeting Tuesday 3pm", "flight Friday 8am", "lunch with Mom on Saturday"
- reminder: a task with a SPECIFIC trigger time. "Remind me at 8am to take meds", "ping me in 2 hours"
- mood: a self-reported feeling/state. "feeling great today", "down today", "anxious before launch". Map to 1-5: 1=rough, 2=low, 3=okay, 4=good, 5=great.
- vault_hint: looks like a password, API key, account number, or PIN. DON'T actually save plaintext — set is_sensitive=true.
- trading_note: explicit trading observation. "BTC stop at 76k", "shorted SOL today"

OUTPUT — JSON only, no prose:
{
  "destination": "task" | "note" | "calendar" | "reminder" | "mood" | "vault_hint" | "trading_note",
  "confidence": 0.0-1.0,
  "title": "<short title or one-line summary>",
  "body": "<longer body if applicable, else empty>",
  "date": "<YYYY-MM-DD if calendar/reminder, else null>",
  "time": "<HH:MM 24h if calendar/reminder has explicit time, else null>",
  "mood_score": <1-5 if destination=mood, else null>,
  "is_sensitive": <true if vault_hint, else false>,
  "reason": "<one short sentence explaining the classification>"
}

RULES:
- If date is "tomorrow", "next Monday", "Saturday", etc — compute the actual YYYY-MM-DD relative to today.
- Be confident (>0.85) only when you're sure. Default to confidence 0.6-0.75 for ambiguous cases.
- Preserve user's wording in title/body — don't paraphrase.
- If the user is in a project folder ("${screen?.folderName ?? '—'}") and the thought is project-related (idea, observation, todo about that project), the destination is "note" and body should mention the folder context.`

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    system,
    messages: [{ role: 'user', content: text }],
  })

  const textOut = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim()

  // Extract JSON (model sometimes wraps in ```json blocks)
  const jsonMatch = textOut.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in classification response')
  const parsed = JSON.parse(jsonMatch[0]) as CaptureClassification
  return parsed
}

// ────────────────────────────────────────────────────────────────────────────
// CAPTURE MODE — execute classification by writing to the appropriate table
// ────────────────────────────────────────────────────────────────────────────

async function executeCapture(
  c: CaptureClassification,
  userId: string,
  rawText: string,
  screen: ScreenContext | undefined,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ ok: boolean; record?: Record<string, unknown>; destLabel: string; error?: string }> {
  const now = new Date().toISOString()
  const title = c.title?.trim() || rawText.slice(0, 200)

  switch (c.destination) {
    case 'task': {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title,
          priority: 'medium',
          completed: false,
        })
        .select()
        .single()
      return error
        ? { ok: false, destLabel: 'Tasks', error: error.message }
        : { ok: true, record: data, destLabel: 'Tasks' }
    }

    case 'note': {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: userId,
          content: title,
          body_md: c.body && c.body.trim() && c.body !== title ? c.body : null,
          type: 'note',
          parent_id: screen?.folderId ?? null,
        })
        .select()
        .single()
      const where = screen?.folderName ? `Notes → ${screen.folderName}` : 'Notes'
      return error
        ? { ok: false, destLabel: where, error: error.message }
        : { ok: true, record: data, destLabel: where }
    }

    case 'reminder': {
      // Build remind_at from date + time, default to in-1-hour if missing
      let remindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      if (c.date) {
        const t = c.time ?? '09:00'
        const dt = new Date(`${c.date}T${t}:00`)
        if (!isNaN(dt.getTime())) remindAt = dt.toISOString()
      }
      const { data, error } = await supabase
        .from('reminders')
        .insert({
          user_id: userId,
          title,
          remind_at: remindAt,
          is_active: true,
          type: 'manual',
        })
        .select()
        .single()
      return error
        ? { ok: false, destLabel: 'Reminders', error: error.message }
        : { ok: true, record: data, destLabel: 'Reminders' }
    }

    case 'calendar': {
      // We have a tasks table that supports due_date. Calendar events are
      // surfaced via the unified calendar view from tasks + reminders.
      // For simplicity, calendar items become tasks with due_date set.
      const dueDate = c.date ?? null
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title,
          due_date: dueDate,
          priority: 'medium',
          completed: false,
        })
        .select()
        .single()
      return error
        ? { ok: false, destLabel: 'Calendar', error: error.message }
        : { ok: true, record: data, destLabel: 'Calendar' }
    }

    case 'mood': {
      const score = Math.max(1, Math.min(5, Math.round(c.mood_score ?? 3)))
      const todayStr = now.split('T')[0]
      // Upsert today's mood
      const { data: existing } = await supabase
        .from('moods')
        .select('id')
        .eq('user_id', userId)
        .eq('date', todayStr)
        .maybeSingle()
      let record
      if (existing?.id) {
        const { data, error } = await supabase
          .from('moods')
          .update({ score, note: c.body || rawText })
          .eq('id', existing.id)
          .select()
          .single()
        if (error) return { ok: false, destLabel: 'Mood', error: error.message }
        record = data
      } else {
        const { data, error } = await supabase
          .from('moods')
          .insert({ user_id: userId, score, date: todayStr, note: c.body || rawText })
          .select()
          .single()
        if (error) return { ok: false, destLabel: 'Mood', error: error.message }
        record = data
      }
      return { ok: true, record, destLabel: 'Mood' }
    }

    case 'vault_hint': {
      // SECURITY: do NOT persist plaintext sensitive content to the notes
      // table. Return a signal to the client that says "this needs vault
      // encryption" — the client opens the vault unlock dialog, user enters
      // PIN, the secret gets encrypted client-side and saved to vault_entries
      // (where the server only ever sees ciphertext). The plaintext value
      // never touches our database.
      //
      // Caller (CommandPalette) reads the returned sensitive_value + name
      // from the JSON response in memory and immediately offers the vault
      // unlock dialog. If the user cancels, nothing is saved.
      return {
        ok: true,
        destLabel: 'Vault (needs PIN to encrypt)',
        // No DB record — the value is returned in the API response payload
        // (see POST handler) for the client to handle.
      }
    }

    case 'trading_note': {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: userId,
          content: title,
          body_md: c.body && c.body !== title ? c.body : null,
          type: 'note',
          tags: ['trading'],
        })
        .select()
        .single()
      return error
        ? { ok: false, destLabel: 'Trading notes', error: error.message }
        : { ok: true, record: data, destLabel: 'Trading notes' }
    }

    default:
      return { ok: false, destLabel: 'Unknown', error: 'Unknown destination' }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SEARCH MODE — search across notes, tasks, calendar items, vault names
// ────────────────────────────────────────────────────────────────────────────

interface SearchHit {
  type: 'note' | 'task' | 'vault'
  id: string
  title: string
  snippet?: string
  meta?: string
}

async function runSearch(query: string, userId: string, supabase: Awaited<ReturnType<typeof createClient>>): Promise<SearchHit[]> {
  const needle = query.trim()
  if (!needle) return []
  const like = `%${needle}%`

  const [notes, tasks, vault] = await Promise.all([
    supabase
      .from('notes')
      .select('id, content, body_md, is_folder, parent_id, created_at')
      .eq('user_id', userId)
      .or(`content.ilike.${like},body_md.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('tasks')
      .select('id, title, due_date, completed, created_at')
      .eq('user_id', userId)
      .ilike('title', like)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('vault_entries')
      .select('id, name, kind, updated_at')
      .eq('user_id', userId)
      .ilike('name', like)
      .order('updated_at', { ascending: false })
      .limit(10),
  ])

  const hits: SearchHit[] = []

  for (const n of notes.data ?? []) {
    const title = ((n.content as string) || '').split('\n')[0].slice(0, 100)
    const body = (n.body_md as string | null) ?? ''
    const idx = body.toLowerCase().indexOf(needle.toLowerCase())
    const snippet = idx >= 0
      ? body.slice(Math.max(0, idx - 40), idx + needle.length + 80)
      : body.slice(0, 120)
    hits.push({
      type: 'note',
      id: n.id as string,
      title,
      snippet: snippet.replace(/\n+/g, ' ').trim(),
      meta: n.is_folder ? 'Folder' : 'Note',
    })
  }
  for (const t of tasks.data ?? []) {
    hits.push({
      type: 'task',
      id: t.id as string,
      title: t.title as string,
      meta: t.completed ? 'Done' : (t.due_date ? `Due ${t.due_date}` : 'Open task'),
    })
  }
  for (const v of vault.data ?? []) {
    hits.push({
      type: 'vault',
      id: v.id as string,
      title: v.name as string,
      meta: `Vault · ${v.kind}`,
    })
  }

  return hits
}

// ────────────────────────────────────────────────────────────────────────────
// QUERY MODE — answer a contextual question (what now, summarize today, etc.)
// ────────────────────────────────────────────────────────────────────────────

async function runQuery(
  question: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  screen?: ScreenContext,
): Promise<{ answer: string; action: { type: string; ok: boolean; message: string; note?: Record<string, unknown> } | null }> {
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const [profileRes, tasksRes, moodsRes, calRes, foldersRes] = await Promise.all([
    supabase.from('profiles').select('nickname, full_name, biggest_goal, peak_hours').eq('id', userId).single(),
    supabase.from('tasks').select('title, due_date, priority, completed').eq('user_id', userId).eq('completed', false).order('due_date', { ascending: true }).limit(15),
    supabase.from('moods').select('score, date, note').eq('user_id', userId).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(7),
    supabase.from('tasks').select('title, due_date').eq('user_id', userId).eq('completed', false).gte('due_date', today).order('due_date', { ascending: true }).limit(5),
    // All folders so we can match references like "my FreshDabba folder"
    supabase.from('notes').select('id, content').eq('user_id', userId).eq('is_folder', true),
  ])

  const profile = profileRes.data
  const openTasks = tasksRes.data ?? []
  const moods = moodsRes.data ?? []
  const nextItems = calRes.data ?? []
  const folders = foldersRes.data ?? []

  // ── Fuzzy-match any folder name mentioned in the question ────────────────
  // If found OR if the user is currently inside a folder, load that folder's
  // notes so the AI can answer questions like "is this pitch good?"
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const questionNorm = normalize(question)

  let referencedFolder: { id: string; content: string } | null = null
  // First: explicit folder name match in the question
  for (const f of folders) {
    const fNorm = normalize(f.content as string)
    if (fNorm.length >= 3 && questionNorm.includes(fNorm)) {
      referencedFolder = { id: f.id as string, content: f.content as string }
      break
    }
  }
  // Fall back to the folder the user is currently viewing in the workspace
  if (!referencedFolder && screen?.folderId && screen?.folderName) {
    referencedFolder = { id: screen.folderId, content: screen.folderName }
  }

  let folderBlock = ''
  // Track note IDs so the update_note tool can target a specific one by index
  let folderNotesIndex: { id: string; title: string }[] = []
  if (referencedFolder) {
    const { data: folderNotes } = await supabase
      .from('notes')
      .select('id, content, body_md, attachments')
      .eq('user_id', userId)
      .eq('parent_id', referencedFolder.id)
      .eq('is_folder', false)
      .order('created_at', { ascending: false })
      .limit(20)
    if (folderNotes && folderNotes.length > 0) {
      folderNotesIndex = folderNotes.map((n) => ({
        id: n.id as string,
        title: (n.content as string).split('\n')[0].slice(0, 100),
      }))
      const corpus = folderNotes.map((n, i) => {
        const title = (n.content as string).split('\n')[0].slice(0, 100)
        const body = ((n.body_md as string | null) || '').slice(0, 2500)
        const atts = (n.attachments as Array<{ name: string }> | null) ?? []
        const attLine = atts.length > 0 ? ` [attachments: ${atts.map((a) => a.name).join(', ')}]` : ''
        return `--- NOTE ${i + 1} (id=${n.id}): ${title}${attLine} ---\n${body || '(no body)'}`
      }).join('\n\n')
      folderBlock = `\n\nFOLDER IN CONTEXT — "${referencedFolder.content}" (${folderNotes.length} notes):\n${corpus}`
    } else {
      folderBlock = `\n\nFOLDER IN CONTEXT — "${referencedFolder.content}" is empty.`
    }
  }

  // If user is viewing a specific note, also load it
  let noteBlock = ''
  if (screen?.noteId) {
    const { data: noteRow } = await supabase
      .from('notes')
      .select('content, body_md')
      .eq('id', screen.noteId)
      .eq('user_id', userId)
      .maybeSingle()
    if (noteRow) {
      const body = ((noteRow.body_md as string | null) || (noteRow.content as string) || '').slice(0, 3000)
      noteBlock = `\n\nNOTE CURRENTLY OPEN — "${screen.noteName ?? 'untitled'}":\n${body}`
    }
  }

  const now = new Date()
  const hour = now.getHours()
  const partOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'late night'
  const avgMood = moods.length
    ? (moods.reduce((s, m) => s + (m.score as number), 0) / moods.length).toFixed(1)
    : 'no data'

  const name = profile?.nickname || profile?.full_name || 'this person'
  const goal = profile?.biggest_goal || 'not stated'
  const peak = profile?.peak_hours || 'unknown'

  const allFolderNames = folders.map((f) => `"${f.content}"`).join(', ') || '(no folders)'

  const system = `You are answering ${name}'s question concisely and HELPFULLY. Use the data below. Max 5 short paragraphs. No hedging. NEVER say "I don't have access to your folders" — the folder contents are right here if relevant.

NOW: ${now.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' })} (${partOfDay})
GOAL: ${goal}
PEAK HOURS: ${peak}
AVG MOOD (7d): ${avgMood}/5

OPEN TASKS (top ${openTasks.length}):
${openTasks.map((t) => `• ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''} [${t.priority}]`).join('\n') || '(none)'}

NEXT ON CALENDAR:
${nextItems.map((t) => `• ${t.due_date}: ${t.title}`).join('\n') || '(nothing scheduled)'}

ALL FOLDERS THEY HAVE: ${allFolderNames}
${folderBlock}
${noteBlock}

GUIDANCE BY QUESTION TYPE:
- "what now" / "what should I do" / "what's next": pick ONE specific thing from tasks/calendar based on time-of-day. Give the FIRST CONCRETE STEP (15 min slice).
- Questions about a specific folder/project (e.g., "is my FreshDabba pitch good?", "what's in my X folder?"): the folder's notes are loaded above. Read them, then give specific, grounded feedback referencing actual content. If asked to improve something, write the improved version directly.
- General questions: answer using the data above + your knowledge.

UPDATE/EDIT REQUESTS — call the update_note tool:
If the user says "update my pitch", "make those changes", "apply the suggestions", "save the revised version", "rewrite it and save", "replace my note with..." — and a folder is in context with notes loaded — you MUST call the update_note tool with:
  • folder_name: the folder this belongs to (must match an existing folder)
  • note_id: the id of the note to update (you'll see "(id=...)" in the NOTE headers above — copy that exact id)
  • revised_body_md: the COMPLETE new markdown body. Don't just describe changes — write the full new version.
  • brief_summary: one sentence summary of what changed (for the toast)

After calling the tool, your text reply should be a 1-2 line confirmation, not a re-paste of the content. The tool result already saves the note.

If the user asks for suggestions WITHOUT asking to save them (e.g., "what could be better?"), give suggestions in text — DON'T call the tool.`

  // Tools the AI can call while answering. Currently only update_note —
  // we deliberately keep this small so the AI doesn't get confused.
  const tools: Anthropic.Tool[] = folderNotesIndex.length > 0 ? [
    {
      name: 'update_note',
      description: 'Replace the body content of an existing note in a workspace folder. Use ONLY when the user explicitly asks to update/save/apply/rewrite a note. Never call this proactively.',
      input_schema: {
        type: 'object' as const,
        properties: {
          folder_name: { type: 'string', description: 'Name of the folder the note is in' },
          note_id: { type: 'string', description: 'UUID of the note to update — find it in the NOTE headers in the system prompt ("id=...")' },
          revised_body_md: { type: 'string', description: 'The complete new markdown body to save' },
          brief_summary: { type: 'string', description: 'One-sentence summary of the change (for the user toast)' },
        },
        required: ['folder_name', 'note_id', 'revised_body_md'],
      },
    },
  ] : []

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system,
    tools: tools.length > 0 ? tools : undefined,
    messages: [{ role: 'user', content: question }],
  })

  // Process response: text + any tool calls
  let textOut = ''
  let actionResult: { type: string; ok: boolean; message: string; note?: Record<string, unknown> } | null = null

  for (const block of resp.content) {
    if (block.type === 'text') {
      textOut += block.text
    } else if (block.type === 'tool_use' && block.name === 'update_note') {
      const input = block.input as {
        folder_name?: string
        note_id?: string
        revised_body_md?: string
        brief_summary?: string
      }
      // Validate the note belongs to the user (defense-in-depth — RLS does this too)
      // AND that it's in the referenced folder
      if (!input.note_id || !input.revised_body_md) {
        actionResult = { type: 'update_note', ok: false, message: 'AI called update tool without note id or content' }
        continue
      }
      const validIds = new Set(folderNotesIndex.map((n) => n.id))
      if (!validIds.has(input.note_id)) {
        actionResult = {
          type: 'update_note',
          ok: false,
          message: `Could not find that note in the folder. AI tried id="${input.note_id.slice(0, 8)}…"`,
        }
        continue
      }
      const { data: updated, error } = await supabase
        .from('notes')
        .update({
          body_md: input.revised_body_md,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.note_id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error || !updated) {
        actionResult = { type: 'update_note', ok: false, message: error?.message || 'Update failed' }
      } else {
        const title = (updated.content as string).split('\n')[0].slice(0, 60)
        actionResult = {
          type: 'update_note',
          ok: true,
          note: updated as Record<string, unknown>,
          message: input.brief_summary || `Updated "${title}"`,
        }
      }
    }
  }

  return { answer: textOut.trim(), action: actionResult }
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const body = (await request.json()) as RouteBody
    const text = body.text?.trim()
    if (!text || text.length > 5000) {
      return NextResponse.json({ error: 'Text required (max 5000 chars)' }, { status: 400 })
    }

    const mode: 'capture' | 'search' | 'query' =
      body.mode && body.mode !== 'auto' ? body.mode : autoMode(text)

    if (mode === 'search') {
      const results = await runSearch(text, user.id, supabase)
      return NextResponse.json({ mode, results })
    }

    if (mode === 'query') {
      const result = await runQuery(text, user.id, supabase, body.context)
      return NextResponse.json({
        mode,
        answer: result.answer,
        action: result.action,
      })
    }

    // CAPTURE mode — always execute the best guess. "note" is a safe
    // fallback for ambiguous thoughts; user can move items later if needed.
    const classification = await classifyCapture(text, body.context)

    // Special path: vault_hint never auto-saves. Return the raw value so
    // the client can prompt for PIN and encrypt it client-side.
    if (classification.destination === 'vault_hint') {
      // Build a sensible default name + value for the vault dialog. The
      // classifier's title is usually the LABEL ("WiFi password"), and the
      // body OR the original text is the VALUE.
      const name = (classification.title || 'Secret').replace(/^🔒\s*/, '').slice(0, 200)
      // Best effort: if body has content, that's the value. Otherwise fall
      // back to the raw captured text minus the obvious label words.
      const value =
        (classification.body && classification.body.trim() && classification.body !== classification.title)
          ? classification.body.trim()
          : text.trim()
      const kind: 'password' | 'note' | 'secret' =
        /password|pin|code|key/i.test(name) ? 'password' : 'secret'

      return NextResponse.json({
        mode: 'capture',
        destination: 'vault_hint',
        needsVaultEncryption: true,
        vaultPayload: { name, value, kind },
        classification,
      })
    }

    const result = await executeCapture(classification, user.id, text, body.context, supabase)

    return NextResponse.json({
      mode: 'capture',
      executed: result.ok,
      destination: classification.destination,
      destLabel: result.destLabel,
      classification,
      record: result.record,
      error: result.error,
    })
  } catch (err) {
    console.error('[api/ai/route] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
