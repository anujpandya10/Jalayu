/**
 *   POST /api/letter/reply  body: { answer: string }
 *
 * Reply to today's evening letter when it contains a deepening question.
 * Captures the answer as a `profile_note` row prepended to the user's
 * profile_notes array, so future runners can read it as part of
 * user-context.
 *
 * This is NOT an intent — no runner, no embedding, no push.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

function todayDateKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Pull the deepening question out of today's letter. The generator was
 * instructed to put the question on a new final paragraph ending with "?".
 * We take the last sentence ending with "?" as the question.
 */
function extractQuestion(textMd: string): string | null {
  const trimmed = textMd.trim()
  // Walk paragraphs from the end backwards to find one containing a "?"
  const paragraphs = trimmed.split(/\n\s*\n/)
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i].trim().replace(/[*_>#-]/g, '')
    if (!p.includes('?')) continue
    // Take the last sentence in that paragraph that ends with "?"
    const sentences = p.split(/(?<=[.!?])\s+/)
    for (let j = sentences.length - 1; j >= 0; j--) {
      const s = sentences[j].trim()
      if (s.endsWith('?')) return s.length > 280 ? s.slice(0, 277) + '…' : s
    }
  }
  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const answer = typeof body.answer === 'string' ? body.answer.trim() : ''
  if (!answer) return NextResponse.json({ error: 'answer required' }, { status: 400 })
  if (answer.length > 2000) return NextResponse.json({ error: 'answer too long' }, { status: 400 })

  // Fetch today's letter to extract the question that was asked
  const letterRes = await supabase
    .from('daily_letters')
    .select('*')
    .eq('user_id', user.id)
    .eq('letter_date', todayDateKey())
    .maybeSingle()

  if (letterRes.error || !letterRes.data) {
    return NextResponse.json({ error: 'No letter to reply to today' }, { status: 404 })
  }

  const prompt = extractQuestion(letterRes.data.text_md) ?? 'Jalayu asked you something'

  // Read current profile_notes, prepend the new note, write back
  const profileRes = await supabase
    .from('profiles')
    .select('profile_notes')
    .eq('id', user.id)
    .single()

  const existing = Array.isArray(profileRes.data?.profile_notes)
    ? (profileRes.data.profile_notes as unknown[])
    : []

  const newNote = {
    asked_at: new Date().toISOString(),
    prompt,
    answer,
    source: 'letter' as const,
  }

  // Cap at 50 notes total — beyond that, oldest fall off the back
  const next = [newNote, ...existing].slice(0, 50)

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ profile_notes: next, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ note: newNote, letter: letterRes.data })
}
