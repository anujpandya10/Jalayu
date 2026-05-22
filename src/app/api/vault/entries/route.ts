/**
 * Vault entries — list and create.
 *
 * Server only sees: name (plaintext, for the list), kind, ciphertext, iv.
 * Server NEVER sees the plaintext content. The client decrypts ciphertext
 * locally using the PIN-derived key.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const MAX_NAME_LEN = 200
const MAX_CIPHERTEXT_LEN = 30000
const MAX_IV_LEN = 64
const ALLOWED_KINDS = new Set(['password', 'note', 'card', 'secret'])

interface CreateEntryBody {
  name?: string
  kind?: string
  ciphertext?: string
  iv?: string
}

function isBase64Like(s: string): boolean {
  return typeof s === 'string' && /^[A-Za-z0-9+/=]+$/.test(s)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_entries')
    .select('id, name, kind, ciphertext, iv, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[vault/entries GET]', error)
    return NextResponse.json({ error: 'Could not load entries' }, { status: 500 })
  }

  return NextResponse.json({ entries: data ?? [] })
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const body = (await request.json()) as CreateEntryBody
    const name = body.name?.trim()
    const kind = body.kind ?? 'secret'
    const ciphertext = body.ciphertext
    const iv = body.iv

    if (!name) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }
    if (name.length > MAX_NAME_LEN) {
      return NextResponse.json({ error: 'Name too long' }, { status: 400 })
    }
    if (!ALLOWED_KINDS.has(kind)) {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
    }
    if (
      !ciphertext || !iv ||
      !isBase64Like(ciphertext) || !isBase64Like(iv) ||
      ciphertext.length > MAX_CIPHERTEXT_LEN || iv.length > MAX_IV_LEN
    ) {
      return NextResponse.json({ error: 'Invalid encrypted payload' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('vault_entries')
      .insert({ user_id: user.id, name, kind, ciphertext, iv })
      .select('id, name, kind, ciphertext, iv, created_at, updated_at')
      .single()

    if (error || !data) {
      console.error('[vault/entries POST]', error)
      return NextResponse.json({ error: 'Could not save entry' }, { status: 500 })
    }

    return NextResponse.json({ entry: data })
  } catch (err) {
    console.error('[vault/entries POST] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
