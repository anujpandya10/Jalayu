/**
 * Vault destruction — delete settings + all entries.
 * Used when user forgot their PIN and wants to start over (loses all data).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  // Delete entries first (FK on user_id, but explicit for clarity)
  await supabase.from('vault_entries').delete().eq('user_id', user.id)
  await supabase.from('vault_settings').delete().eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
