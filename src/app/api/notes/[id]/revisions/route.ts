/**
 * GET /api/notes/[id]/revisions — list revision history for a note.
 *
 * Returns newest first. Each row includes content + body_md so the UI can
 * render previews without a second roundtrip per revision.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: noteId } = await params
    if (!isUuid(noteId)) {
      return NextResponse.json({ error: 'Invalid note id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    // Verify the note belongs to the user (RLS would also catch this)
    const { data: noteExists } = await supabase
      .from('notes')
      .select('id')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!noteExists) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('note_revisions')
      .select('id, content, body_md, attachments, updated_by, source, created_at')
      .eq('user_id', user.id)
      .eq('note_id', noteId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[notes revisions GET]', error)
      return NextResponse.json({ error: 'Could not load history' }, { status: 500 })
    }

    return NextResponse.json({ revisions: data ?? [] })
  } catch (err) {
    console.error('[notes revisions GET] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
