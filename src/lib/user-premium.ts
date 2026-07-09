/**
 * Server-side helpers for premium module grants (migration 045). A module
 * being "enabled" (user wants it, user-modules.ts) is separate from it being
 * "granted" (owner allowed it) — a user can enable a premium module in their
 * config, but the shell still gates it until a grant exists. Reads use the
 * caller's own RLS-scoped client (grants are self-readable); writes always go
 * through the service-role admin client from an owner-gated route.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PremiumGrant {
  module_id: string
  granted_at: string
  granted_by: string | null
  note: string | null
}

/** The caller's own granted premium module ids — safe with the user's RLS-scoped client. */
export async function getGrantedPremiumModuleIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase.from('user_premium_grants').select('module_id').eq('user_id', userId)
  return (data ?? []).map((r) => r.module_id as string)
}

/** Owner-only: list every grant, optionally filtered to one user. Requires the admin client. */
export async function listPremiumGrants(admin: SupabaseClient, userId?: string): Promise<(PremiumGrant & { user_id: string })[]> {
  let query = admin.from('user_premium_grants').select('user_id, module_id, granted_at, granted_by, note').order('granted_at', { ascending: false })
  if (userId) query = query.eq('user_id', userId)
  const { data } = await query
  return (data ?? []) as (PremiumGrant & { user_id: string })[]
}

/** Owner-only: grant a user access to a premium module. Requires the admin client. */
export async function grantPremiumModule(admin: SupabaseClient, userId: string, moduleId: string, grantedBy: string, note?: string): Promise<void> {
  await admin.from('user_premium_grants').upsert(
    { user_id: userId, module_id: moduleId, granted_by: grantedBy, note: note ?? null, granted_at: new Date().toISOString() },
    { onConflict: 'user_id,module_id' },
  )
}

/** Owner-only: revoke a previously-granted premium module. Requires the admin client. */
export async function revokePremiumModule(admin: SupabaseClient, userId: string, moduleId: string): Promise<void> {
  await admin.from('user_premium_grants').delete().eq('user_id', userId).eq('module_id', moduleId)
}
