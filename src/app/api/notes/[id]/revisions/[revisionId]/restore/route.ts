/**
 * POST /api/notes/[id]/revisions/[revisionId]/restore
 *
 * Restores the selected revision into the note. Snapshots the CURRENT
 * state first (with updated_by='restore') so the restore itself can be
 * undone via the same history list.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { snapshotNote } from '@/lib/note-revisions'

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
) {
  try {
    const { id: noteId, revisionId } = await params
    if (!isUuid(noteId) || !isUuid(revisionId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    // Load the revision (with user_id scope as defense in depth)
    const { data: revision, error: loadErr } = await supabase
      .from('note_revisions')
      .select('id, note_id, content, body_md, attachments')
      .eq('id', revisionId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (loadErr) {
      console.error('[restore] load revision', loadErr)
      return NextResponse.json({ error: 'Could not load revision' }, { status: 500 })
    }
    if (!revision) {
      return NextResponse.json({ error: 'Revision not found' }, { status: 404 })
    }
    if (revision.note_id !== noteId) {
      return NextResponse.json({ error: 'Revision does not belong to this note' }, { status: 400 })
    }

    // Snapshot current state so the restore is reversible
    await snapshotNote(supabase, {
      noteId,
      userId: user.id,
      updatedBy: 'restore',
    })

    // Apply the revision's content back to the note
    const { data: restored, error } = await supabase
      .from('notes')
      .update({
        content: revision.content,
        body_md: revision.body_md,
        attachments: revision.attachments,
        updated_at: new Date().toISOString(),
      })
      .eq('id', noteId)
      .eq('user_id', user.id)
      .select('id, content, body_md, type, tags, meta, parent_id, is_folder, attachments, created_at, updated_at, is_voice')
      .single()

    if (error || !restored) {
      console.error('[restore] update note', error)
      return NextResponse.json({ error: 'Could not restore' }, { status: 500 })
    }

    return NextResponse.json({ note: restored })
  } catch (err) {
    console.error('[restore] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
