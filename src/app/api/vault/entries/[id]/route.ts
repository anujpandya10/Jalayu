/**
 * Vault entry — update or delete by id.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const MAX_NAME_LEN = 200
const MAX_CIPHERTEXT_LEN = 30000
const MAX_IV_LEN = 64
const ALLOWED_KINDS = new Set(['password', 'note', 'card', 'secret'])

interface PatchEntryBody {
  name?: string
  kind?: string
  ciphertext?: string
  iv?: string
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function isBase64Like(s: string): boolean {
  return typeof s === 'string' && /^[A-Za-z0-9+/=]+$/.test(s)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const body = (await request.json()) as PatchEntryBody
    const update: Record<string, unknown> = {}

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
      if (name.length > MAX_NAME_LEN) return NextResponse.json({ error: 'Name too long' }, { status: 400 })
      update.name = name
    }
    if (typeof body.kind === 'string') {
      if (!ALLOWED_KINDS.has(body.kind)) {
        return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
      }
      update.kind = body.kind
    }
    if (typeof body.ciphertext === 'string' || typeof body.iv === 'string') {
      if (
        !body.ciphertext || !body.iv ||
        !isBase64Like(body.ciphertext) || !isBase64Like(body.iv) ||
        body.ciphertext.length > MAX_CIPHERTEXT_LEN ||
        body.iv.length > MAX_IV_LEN
      ) {
        return NextResponse.json({ error: 'Invalid encrypted payload' }, { status: 400 })
      }
      update.ciphertext = body.ciphertext
      update.iv = body.iv
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('vault_entries')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name, kind, ciphertext, iv, created_at, updated_at')
      .maybeSingle()

    if (error) {
      console.error('[vault/entries PATCH]', error)
      return NextResponse.json({ error: 'Could not update' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }
    return NextResponse.json({ entry: data })
  } catch (err) {
    console.error('[vault/entries PATCH] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { error } = await supabase
      .from('vault_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[vault/entries DELETE]', error)
      return NextResponse.json({ error: 'Could not delete' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[vault/entries DELETE] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
