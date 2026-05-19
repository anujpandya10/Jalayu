/**
 * Notes API — update and delete by id.
 *
 * Security: All queries filter on .eq('user_id', user.id) AND Supabase RLS
 *   enforces the same check at the DB level. Defense in depth.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const MAX_CONTENT_LEN = 8000
const MAX_TITLE_LEN = 200
const MAX_TAGS = 8
const MAX_TAG_LEN = 40

interface PatchNoteBody {
  content?: string
  title?: string | null
  tags?: string[] | null
  pinned?: boolean
}

interface NoteMeta {
  title?: string
  pinned?: boolean
}

function sanitizeTags(raw: unknown): string[] | null {
  if (raw === null) return null
  if (!Array.isArray(raw)) return undefined as unknown as string[] | null  // signal "no change"
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

    // Load current note (user_id filter for defense-in-depth alongside RLS)
    const { data: existing, error: loadErr } = await supabase
      .from('notes')
      .select('id, content, type, tags, meta')
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

    // Build update payload — only update fields that were sent
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof body.content === 'string') {
      const content = body.content.trim()
      if (!content) {
        return NextResponse.json({ error: 'Note content cannot be empty' }, { status: 400 })
      }
      if (content.length > MAX_CONTENT_LEN) {
        return NextResponse.json(
          { error: `Note too long (max ${MAX_CONTENT_LEN} characters)` },
          { status: 400 },
        )
      }
      update.content = content
    }

    if (body.tags !== undefined) {
      const tags = sanitizeTags(body.tags)
      // tags === undefined sentinel means leave alone, but our function returns []
      // if invalid; treat empty array as clearing tags.
      update.tags = tags
    }

    // Merge meta fields (title/pinned) — preserve other keys we don't know about
    const currentMeta: NoteMeta = (existing.meta as NoteMeta | null) ?? {}
    const nextMeta: NoteMeta = { ...currentMeta }
    let metaChanged = false

    if (body.title !== undefined) {
      if (body.title === null || body.title === '') {
        delete nextMeta.title
      } else {
        nextMeta.title = body.title.trim().slice(0, MAX_TITLE_LEN)
      }
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
      .select('id, content, type, tags, meta, created_at, updated_at, is_voice')
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

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[notes DELETE]', error)
      return NextResponse.json({ error: 'Could not delete note' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[notes DELETE] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
