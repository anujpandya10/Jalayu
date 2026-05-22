/**
 * Note attachment upload.
 *
 * Accepts multipart/form-data with a single `file` field. Uploads to
 *   Supabase Storage at: <user_id>/<note_id>/<uuid>-<filename>
 * Appends metadata to the note's `attachments` JSONB array.
 *
 * Security:
 *  • Storage path is prefixed with auth.uid() — Storage RLS enforces ownership
 *  • API verifies the note belongs to the user before uploading
 *  • File size limit (25MB), MIME-type whitelist
 *  • Filename is normalized + UUID-prefixed (no directory traversal possible)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { randomUUID } from 'crypto'

const MAX_FILE_BYTES = 25 * 1024 * 1024  // 25MB
const MAX_ATTACHMENTS_PER_NOTE = 50

// Whitelist of allowed MIME types. Office docs and common media.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/heic',
  'text/plain', 'text/markdown', 'text/csv',
  'application/json',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/quicktime', 'video/webm',
])

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

function safeFilename(raw: string): string {
  // Strip directory parts, keep last component, replace dangerous chars
  const base = raw.split(/[/\\]/).pop() || 'file'
  return base.slice(0, 180).replace(/[^\w.\-() ]/g, '_')
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: noteId } = await params
    if (!noteId || !isUuid(noteId)) {
      return NextResponse.json({ error: 'Invalid note id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    // Verify the note exists and belongs to the user
    const { data: note, error: noteErr } = await supabase
      .from('notes')
      .select('id, attachments, is_folder')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (noteErr || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }
    if (note.is_folder) {
      return NextResponse.json({ error: 'Cannot attach files to a folder' }, { status: 400 })
    }

    const currentAttachments = (note.attachments as Attachment[] | null) ?? []
    if (currentAttachments.length >= MAX_ATTACHMENTS_PER_NOTE) {
      return NextResponse.json(
        { error: `Max ${MAX_ATTACHMENTS_PER_NOTE} attachments per note` },
        { status: 400 },
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024}MB)` },
        { status: 413 },
      )
    }

    const mime = file.type || 'application/octet-stream'
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { error: `File type not allowed: ${mime}` },
        { status: 400 },
      )
    }

    const cleanName = safeFilename(file.name)
    // Path = <user_id>/<note_id>/<uuid>-<filename>. The UUID prefix prevents
    // collisions when the user uploads files with the same name twice.
    const storagePath = `${user.id}/${noteId}/${randomUUID()}-${cleanName}`

    const buffer = await file.arrayBuffer()

    const { error: uploadErr } = await supabase.storage
      .from('note-attachments')
      .upload(storagePath, buffer, {
        contentType: mime,
        upsert: false,
      })

    if (uploadErr) {
      console.error('[notes upload] storage', uploadErr)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const newAttachment: Attachment = {
      path: storagePath,
      name: cleanName,
      size: file.size,
      mime,
      uploaded_at: new Date().toISOString(),
    }

    const nextAttachments = [...currentAttachments, newAttachment]

    const { error: updateErr } = await supabase
      .from('notes')
      .update({ attachments: nextAttachments, updated_at: new Date().toISOString() })
      .eq('id', noteId)
      .eq('user_id', user.id)

    if (updateErr) {
      // Roll back the storage upload so we don't have orphans
      await supabase.storage.from('note-attachments').remove([storagePath])
      console.error('[notes upload] DB update', updateErr)
      return NextResponse.json({ error: 'Could not save attachment' }, { status: 500 })
    }

    return NextResponse.json({ attachment: newAttachment, attachments: nextAttachments })
  } catch (err) {
    console.error('[notes upload] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
