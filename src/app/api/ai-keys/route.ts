/**
 *   GET    /api/ai-keys  → status for the current user (no secret returned)
 *   POST   /api/ai-keys  { provider, key, model? } → verify + encrypt + save
 *   DELETE /api/ai-keys  → disconnect
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { encryptSecret } from '@/lib/crypto'
import { verifyAnthropicKey } from '@/lib/user-ai'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('user_ai_keys').select('provider, key_hint, model, verified, updated_at').eq('user_id', user.id).maybeSingle()
  return NextResponse.json({ connected: !!data, ...(data ?? {}) })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { provider, key, model } = await request.json() as { provider?: string; key?: string; model?: string }
  const prov = provider || 'anthropic'
  if (!key || key.trim().length < 12) return NextResponse.json({ error: 'Paste a valid API key' }, { status: 400 })
  if (!['anthropic', 'openai', 'google'].includes(prov)) return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 })

  // Only Claude is wired end-to-end today; others are stored but not yet active.
  let verified = false
  if (prov === 'anthropic') {
    const v = await verifyAnthropicKey(key.trim())
    if (!v.ok) return NextResponse.json({ error: v.error || 'That key did not verify' }, { status: 400 })
    verified = true
  }

  const key_hint = key.trim().slice(-4)
  const { error } = await supabase.from('user_ai_keys').upsert({
    user_id: user.id,
    provider: prov,
    key_cipher: encryptSecret(key.trim()),
    key_hint,
    model: model || null,
    verified,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, verified, provider: prov, key_hint })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await supabase.from('user_ai_keys').delete().eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
