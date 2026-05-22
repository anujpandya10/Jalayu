/**
 * Vault settings — get verification material, or initialize for first time.
 *
 * Security: server NEVER sees the PIN or any plaintext. The client derives
 * a key from the PIN and proves correctness by decrypting the verification
 * blob locally. Server only stores salt + ciphertext.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const MAX_BLOB_LEN = 1000     // base64 of small token
const MAX_IV_LEN = 64
const MAX_SALT_LEN = 64

interface InitVaultBody {
  salt?: string
  iterations?: number
  verification_blob?: string
  verification_iv?: string
}

function isBase64Like(s: string): boolean {
  return typeof s === 'string' && /^[A-Za-z0-9+/=]+$/.test(s)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_settings')
    .select('salt, iterations, verification_blob, verification_iv, failed_attempts, locked_until')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[vault/settings GET]', error)
    return NextResponse.json({ error: 'Could not load vault' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ initialized: false })
  }

  // Honour lockout: if locked_until is in the future, vault is throttled
  const lockedUntil = data.locked_until ? new Date(data.locked_until).getTime() : 0
  const lockedSecondsRemaining = lockedUntil > Date.now()
    ? Math.ceil((lockedUntil - Date.now()) / 1000)
    : 0

  return NextResponse.json({
    initialized: true,
    salt: data.salt,
    iterations: data.iterations,
    verification_blob: data.verification_blob,
    verification_iv: data.verification_iv,
    locked_seconds_remaining: lockedSecondsRemaining,
  })
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const body = (await request.json()) as InitVaultBody
    const { salt, iterations, verification_blob, verification_iv } = body

    if (
      !salt || !verification_blob || !verification_iv ||
      typeof iterations !== 'number' ||
      iterations < 100000 || iterations > 1000000 ||
      !isBase64Like(salt) ||
      !isBase64Like(verification_blob) ||
      !isBase64Like(verification_iv) ||
      salt.length > MAX_SALT_LEN ||
      verification_blob.length > MAX_BLOB_LEN ||
      verification_iv.length > MAX_IV_LEN
    ) {
      return NextResponse.json({ error: 'Invalid vault material' }, { status: 400 })
    }

    // Check if vault already exists — reject re-init to prevent accidental
    // overwrites that would orphan existing entries. User must explicitly
    // delete the vault first via DELETE /api/vault.
    const { data: existing } = await supabase
      .from('vault_settings')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Vault already initialized. Reset via DELETE /api/vault first.' },
        { status: 409 },
      )
    }

    const { error } = await supabase
      .from('vault_settings')
      .insert({
        user_id: user.id,
        salt,
        iterations,
        verification_blob,
        verification_iv,
        failed_attempts: 0,
      })

    if (error) {
      console.error('[vault/settings POST]', error)
      return NextResponse.json({ error: 'Could not initialize vault' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[vault/settings POST] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
