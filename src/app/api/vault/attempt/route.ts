/**
 * Vault PIN attempt tracking — brute-force protection.
 *
 * Note: ACTUAL PIN verification happens client-side (the client decrypts the
 * verification blob with the PIN-derived key — if it works, PIN is correct).
 * This endpoint exists to track failed attempts server-side and lock the
 * vault after too many failures, regardless of what the client does.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const MAX_FAILED_ATTEMPTS = 8
const LOCKOUT_MINUTES = 15

interface AttemptBody {
  success: boolean
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { success } = (await request.json()) as AttemptBody

    const { data: settings } = await supabase
      .from('vault_settings')
      .select('failed_attempts, locked_until')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!settings) {
      return NextResponse.json({ error: 'Vault not initialized' }, { status: 404 })
    }

    if (success) {
      // Reset counter on success
      await supabase
        .from('vault_settings')
        .update({ failed_attempts: 0, locked_until: null })
        .eq('user_id', user.id)
      return NextResponse.json({ ok: true })
    }

    // Failed attempt — increment counter, lock if threshold reached
    const newCount = (settings.failed_attempts ?? 0) + 1
    const update: { failed_attempts: number; locked_until?: string | null } = {
      failed_attempts: newCount,
    }
    if (newCount >= MAX_FAILED_ATTEMPTS) {
      update.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
    }

    await supabase
      .from('vault_settings')
      .update(update)
      .eq('user_id', user.id)

    return NextResponse.json({
      ok: true,
      failed_attempts: newCount,
      locked: newCount >= MAX_FAILED_ATTEMPTS,
      lockout_minutes: LOCKOUT_MINUTES,
    })
  } catch (err) {
    console.error('[vault/attempt POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
