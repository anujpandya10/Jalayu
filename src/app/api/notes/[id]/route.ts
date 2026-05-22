/**
 * Notes API — update and delete by id.
 *
 * Security: All queries filter on .eq('user_id', user.id) AND Supabase RLS
 *   enforces the same check at the DB level. Defense in depth.
 *
 * On DELETE: if the note is a folder, all descendants cascade-delete via the
 * FK constraint. Attachments are NOT auto-deleted from Storage — that's
 * handled by a separate cleanup step in the upload route (orphan sweep).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const MAX_CONTENT_LEN = 8000
const MAX_BODY_MD_LEN = 200000
const MAX_TITLE_LEN = 200
const MAX_TAGS = 8
const MAX_TAG_LEN = 40

interface PatchNoteBody {
  content?: string
  body_md?: string | null
  title?: string | null
  tags?: string[] | null
  pinned?: boolean
  parent_id?: string | null   // null clears parent (moves to root); UUID moves to a folder
}

interface NoteMeta {
  title?: string
  pinned?: boolean
}

interface Attachment {
  path: string
}

function sanitizeTags(raw: unknown): string[] | null {
  if (raw === null) return null
  if (!Array.isArray(raw)) return undefined as unknown as string[] | null
  const out: string[] = []
  for (const t of raw) {
    if (typeof t !== 'string') continue
    const clean = t.trim().slice(0, MAX_TAG_LEN)
    if (clean) out.push(clean)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: 'Invalid note id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const body = (await request.json()) as PatchNoteBody

    const { data: existing, error: loadErr } = await supabase
      .from('notes')
      .select('id, content, body_md, type, tags, meta, parent_id, is_folder')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (loadErr) {
      console.error('[notes PATCH] load', loadErr)
      return NextResponse.json({ error: 'Could not load note' }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof body.content === 'string') {
      const content = body.content.trim()
      if (!content) {
        return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 })
      }
      if (content.length > MAX_CONTENT_LEN) {
        return NextResponse.json({ error: `Content too long (max ${MAX_CONTENT_LEN} chars)` }, { status: 400 })
      }
      update.content = content
    }

    if (body.body_md !== undefined) {
      if (existing.is_folder) {
        return NextResponse.json({ error: 'Folders cannot have a body' }, { status: 400 })
      }
      if (body.body_md === null || body.body_md === '') {
        update.body_md = null
      } else {
        if (body.body_md.length > MAX_BODY_MD_LEN) {
          return NextResponse.json({ error: `Body too long (max ${MAX_BODY_MD_LEN} chars)` }, { status: 400 })
        }
        update.body_md = body.body_md
      }
    }

    // parent_id change = move to folder (or to root if null).
    if (body.parent_id !== undefined) {
      if (body.parent_id === null) {
        update.parent_id = null
      } else {
        if (!isUuid(body.parent_id)) {
          return NextResponse.json({ error: 'Invalid parent_id' }, { status: 400 })
        }
        if (body.parent_id === id) {
          return NextResponse.json({ error: 'A note cannot be its own parent' }, { status: 400 })
        }
        const { data: parent } = await supabase
          .from('notes')
          .select('id, is_folder, parent_id')
          .eq('id', body.parent_id)
          .eq('user_id', user.id)
          .maybeSingle()
        if (!parent) {
          return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 })
        }
        if (!parent.is_folder) {
          return NextResponse.json({ error: 'parent_id must reference a folder' }, { status: 400 })
        }
        // Cycle protection: walk up the proposed parent's ancestors. If we
        // encounter the note we're moving, the move would create a cycle.
        if (existing.is_folder) {
          let cursor: string | null = body.parent_id
          let safety = 100
          while (cursor && safety-- > 0) {
            if (cursor === id) {
              return NextResponse.json({ error: 'Cannot move a folder into itself' }, { status: 400 })
            }
            const { data: anc }: { data: { parent_id: string | null } | null } = await supabase
              .from('notes')
              .select('parent_id')
              .eq('id', cursor)
              .eq('user_id', user.id)
              .maybeSingle()
            cursor = anc?.parent_id ?? null
          }
        }
        update.parent_id = body.parent_id
      }
    }

    if (body.tags !== undefined) {
      update.tags = sanitizeTags(body.tags)
    }

    const currentMeta: NoteMeta = (existing.meta as NoteMeta | null) ?? {}
    const nextMeta: NoteMeta = { ...currentMeta }
    let metaChanged = false

    if (body.title !== undefined) {
      if (body.title === null || body.title === '') delete nextMeta.title
      else nextMeta.title = body.title.trim().slice(0, MAX_TITLE_LEN)
      metaChanged = true
    }
    if (body.pinned !== undefined) {
      if (body.pinned === true) nextMeta.pinned = true
      else delete nextMeta.pinned
      metaChanged = true
    }
    if (metaChanged) {
      update.meta = Object.keys(nextMeta).length > 0 ? nextMeta : null
    }

    const { data, error } = await supabase
      .from('notes')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, content, body_md, type, tags, meta, parent_id, is_folder, attachments, created_at, updated_at, is_voice')
      .single()

    if (error || !data) {
      console.error('[notes PATCH]', error)
      return NextResponse.json({ error: 'Could not update note' }, { status: 500 })
    }

    return NextResponse.json({ note: data })
  } catch (err) {
    console.error('[notes PATCH] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: 'Invalid note id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    // Before deleting, collect all attachment paths in this note + descendants
    // (folders cascade-delete via FK, but Storage files don't auto-delete).
    const pathsToDelete: string[] = []
    const queue: string[] = [id]
    let safety = 1000
    while (queue.length > 0 && safety-- > 0) {
      const cursor = queue.shift()!
      const { data: row } = await supabase
        .from('notes')
        .select('attachments, is_folder')
        .eq('id', cursor)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!row) continue
      const atts = (row.attachments as Attachment[] | null) ?? []
      for (const a of atts) {
        if (typeof a?.path === 'string') pathsToDelete.push(a.path)
      }
      if (row.is_folder) {
        const { data: children } = await supabase
          .from('notes')
          .select('id')
          .eq('user_id', user.id)
          .eq('parent_id', cursor)
        for (const c of children ?? []) queue.push(c.id as string)
      }
    }

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[notes DELETE]', error)
      return NextResponse.json({ error: 'Could not delete note' }, { status: 500 })
    }

    // Best-effort: clean up Storage files. If this fails, we don't fail the
    // overall delete — orphaned files are just wasted space, not a correctness issue.
    if (pathsToDelete.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from('note-attachments')
        .remove(pathsToDelete)
      if (storageErr) {
        console.warn('[notes DELETE] storage cleanup', storageErr)
      }
    }

    return NextResponse.json({ ok: true, attachments_removed: pathsToDelete.length })
  } catch (err) {
    console.error('[notes DELETE] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
