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
const MAX_TITLE_LEN = 200
const MAX_TAGS = 8
const MAX_TAG_LEN = 40

interface NoteMeta {
  title?: string
  pinned?: boolean
}

interface CreateNoteBody {
  content?: string
  title?: string
  type?: string
  tags?: string[]
  pinned?: boolean
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
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10) || 200, 500)
  const type = url.searchParams.get('type')

  let query = supabase
    .from('notes')
    .select('id, content, type, tags, meta, created_at, updated_at, is_voice')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) query = query.eq('type', type)

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
    const content = body.content?.trim()
    if (!content) {
      return NextResponse.json({ error: 'Note content cannot be empty' }, { status: 400 })
    }
    if (content.length > MAX_CONTENT_LEN) {
      return NextResponse.json(
        { error: `Note too long (max ${MAX_CONTENT_LEN} characters)` },
        { status: 400 },
      )
    }

    // Whitelist of allowed types (matches existing usage in codebase)
    const ALLOWED_TYPES = new Set(['note', 'learning', 'mind', 'people', 'decision', 'meeting'])
    const type = body.type && ALLOWED_TYPES.has(body.type) ? body.type : 'note'

    const title = body.title?.trim().slice(0, MAX_TITLE_LEN) || undefined
    const meta: NoteMeta = {}
    if (title) meta.title = title
    if (body.pinned === true) meta.pinned = true

    const payload = {
      user_id: user.id,
      content,
      type,
      tags: sanitizeTags(body.tags),
      meta: Object.keys(meta).length > 0 ? meta : null,
    }

    const { data, error } = await supabase
      .from('notes')
      .insert(payload)
      .select('id, content, type, tags, meta, created_at, updated_at, is_voice')
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
