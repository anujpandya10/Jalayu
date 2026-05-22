/**
 * Notes API — list and create.
 *
 * Security: Supabase RLS policy "Users manage own notes" enforces
 *   auth.uid() = user_id on all operations at the DB level. Even if this
 *   code had a bug, the database would reject unauthorized access.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const MAX_CONTENT_LEN = 8000
const MAX_BODY_MD_LEN = 200000   // 200KB of markdown — covers long project docs
const MAX_TITLE_LEN = 200
const MAX_TAGS = 8
const MAX_TAG_LEN = 40

interface NoteMeta {
  title?: string
  pinned?: boolean
}

interface CreateNoteBody {
  content?: string
  body_md?: string
  title?: string
  type?: string
  tags?: string[]
  pinned?: boolean
  parent_id?: string | null
  is_folder?: boolean
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function sanitizeTags(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  for (const t of raw) {
    if (typeof t !== 'string') continue
    const clean = t.trim().slice(0, MAX_TAG_LEN)
    if (clean) out.push(clean)
    if (out.length >= MAX_TAGS) break
  }
  return out.length > 0 ? out : null
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500', 10) || 500, 1000)
  const type = url.searchParams.get('type')
  const parentParam = url.searchParams.get('parent_id')
  // parent_id semantics:
  //   not provided → return all (workspace tree view loads everything)
  //   "null" or "root" → only root-level notes (parent_id IS NULL)
  //   a UUID → only children of that folder

  let query = supabase
    .from('notes')
    .select('id, content, body_md, type, tags, meta, parent_id, is_folder, attachments, created_at, updated_at, is_voice')
    .eq('user_id', user.id)
    .order('is_folder', { ascending: false })   // folders first
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) query = query.eq('type', type)
  if (parentParam === 'null' || parentParam === 'root') {
    query = query.is('parent_id', null)
  } else if (parentParam && isUuid(parentParam)) {
    query = query.eq('parent_id', parentParam)
  }

  const { data, error } = await query
  if (error) {
    console.error('[notes GET]', error)
    return NextResponse.json({ error: 'Could not load notes' }, { status: 500 })
  }

  return NextResponse.json({ notes: data ?? [] })
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const body = (await request.json()) as CreateNoteBody
    const isFolder = body.is_folder === true
    const content = body.content?.trim()

    // For folders, `content` is the folder name. For notes, it's the first-line
    // preview (still required). body_md holds the long-form markdown body.
    if (!content) {
      return NextResponse.json(
        { error: isFolder ? 'Folder name required' : 'Note content cannot be empty' },
        { status: 400 },
      )
    }
    if (content.length > MAX_CONTENT_LEN) {
      return NextResponse.json(
        { error: `Content too long (max ${MAX_CONTENT_LEN} characters)` },
        { status: 400 },
      )
    }

    const bodyMd = body.body_md?.trim() || null
    if (bodyMd && bodyMd.length > MAX_BODY_MD_LEN) {
      return NextResponse.json(
        { error: `Body too long (max ${MAX_BODY_MD_LEN} characters)` },
        { status: 400 },
      )
    }

    // Validate parent_id if provided — must be a UUID AND must be a folder
    // belonging to the user. Defense against putting notes under arbitrary IDs.
    let parentId: string | null = null
    if (body.parent_id) {
      if (!isUuid(body.parent_id)) {
        return NextResponse.json({ error: 'Invalid parent_id' }, { status: 400 })
      }
      const { data: parent } = await supabase
        .from('notes')
        .select('id, is_folder')
        .eq('id', body.parent_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!parent) {
        return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 })
      }
      if (!parent.is_folder) {
        return NextResponse.json({ error: 'parent_id must reference a folder' }, { status: 400 })
      }
      parentId = body.parent_id
    }

    const ALLOWED_TYPES = new Set(['note', 'learning', 'mind', 'people', 'decision', 'meeting'])
    const type = body.type && ALLOWED_TYPES.has(body.type) ? body.type : 'note'

    const title = body.title?.trim().slice(0, MAX_TITLE_LEN) || undefined
    const meta: NoteMeta = {}
    if (title) meta.title = title
    if (body.pinned === true) meta.pinned = true

    const payload = {
      user_id: user.id,
      content,
      body_md: isFolder ? null : bodyMd,  // folders don't have bodies
      type,
      tags: sanitizeTags(body.tags),
      meta: Object.keys(meta).length > 0 ? meta : null,
      parent_id: parentId,
      is_folder: isFolder,
    }

    const { data, error } = await supabase
      .from('notes')
      .insert(payload)
      .select('id, content, body_md, type, tags, meta, parent_id, is_folder, attachments, created_at, updated_at, is_voice')
      .single()

    if (error || !data) {
      console.error('[notes POST]', error)
      return NextResponse.json({ error: 'Could not save note' }, { status: 500 })
    }

    return NextResponse.json({ note: data })
  } catch (err) {
    console.error('[notes POST] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
