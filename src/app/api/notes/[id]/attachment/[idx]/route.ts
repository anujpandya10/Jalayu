/**
 * Note attachment operations by index.
 *   GET    → returns a short-lived signed URL for viewing the file
 *   DELETE → removes the attachment from Storage + from the note's array
 *
 * Index is the array position in attachments[]. Bounds-checked.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const SIGNED_URL_EXPIRES_SECS = 60 * 60  // 1 hour

interface Attachment {
  path: string
  name: string
  size: number
  mime: string
  uploaded_at: string
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

async function loadAttachment(
  noteId: string,
  idx: number,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ note: { id: string; attachments: Attachment[] } | null; attachment: Attachment | null; error: string | null }> {
  if (!isUuid(noteId)) return { note: null, attachment: null, error: 'Invalid note id' }
  if (!Number.isInteger(idx) || idx < 0) return { note: null, attachment: null, error: 'Invalid attachment index' }

  const { data: note } = await supabase
    .from('notes')
    .select('id, attachments')
    .eq('id', noteId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!note) return { note: null, attachment: null, error: 'Note not found' }

  const attachments = (note.attachments as Attachment[] | null) ?? []
  if (idx >= attachments.length) return { note: null, attachment: null, error: 'Attachment not found' }

  return { note: { id: note.id, attachments }, attachment: attachments[idx], error: null }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  try {
    const { id: noteId, idx: idxParam } = await params
    const idx = parseInt(idxParam, 10)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { attachment, error } = await loadAttachment(noteId, idx, user.id, supabase)
    if (error || !attachment) {
      return NextResponse.json({ error: error ?? 'Not found' }, { status: 404 })
    }

    const { data, error: signErr } = await supabase.storage
      .from('note-attachments')
      .createSignedUrl(attachment.path, SIGNED_URL_EXPIRES_SECS)

    if (signErr || !data?.signedUrl) {
      console.error('[notes attachment GET] sign', signErr)
      return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 })
    }

    return NextResponse.json({
      url: data.signedUrl,
      expires_in: SIGNED_URL_EXPIRES_SECS,
      attachment,
    })
  } catch (err) {
    console.error('[notes attachment GET] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  try {
    const { id: noteId, idx: idxParam } = await params
    const idx = parseInt(idxParam, 10)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { note, attachment, error } = await loadAttachment(noteId, idx, user.id, supabase)
    if (error || !note || !attachment) {
      return NextResponse.json({ error: error ?? 'Not found' }, { status: 404 })
    }

    // Remove from storage first; if it fails, we still proceed (orphan is
    // fine — we just can't see it. Better than the alternative: DB says it's
    // gone but the file lingers as accessible-via-signed-URL).
    const { error: storageErr } = await supabase.storage
      .from('note-attachments')
      .remove([attachment.path])
    if (storageErr) {
      console.warn('[notes attachment DELETE] storage', storageErr)
    }

    const nextAttachments = note.attachments.filter((_, i) => i !== idx)

    const { error: updateErr } = await supabase
      .from('notes')
      .update({ attachments: nextAttachments, updated_at: new Date().toISOString() })
      .eq('id', noteId)
      .eq('user_id', user.id)

    if (updateErr) {
      console.error('[notes attachment DELETE] DB', updateErr)
      return NextResponse.json({ error: 'Could not delete attachment' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, attachments: nextAttachments })
  } catch (err) {
    console.error('[notes attachment DELETE] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
