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

const DAY_MS = 86_400_000

export interface PremiumAccess {
  /** Premium ids shown with NO badge — permanently unlocked (owner or explicit grant). */
  unlockedPremiumIds: string[]
  isOwner: boolean
  trialActive: boolean
  trialEndsAt: string | null
  trialDaysLeft: number
}

/**
 * The single source of truth for "what premium can this user touch right now."
 * Pure + deterministic so it can be reasoned about and reused everywhere
 * (the /api/modules response, and any server check). Precedence:
 *   owner            → everything, unlocked, no trial concept.
 *   explicit grant   → that module, unlocked (survives trial expiry).
 *   active trial     → all premium usable, but shown as "trial" not "unlocked".
 *   otherwise        → locked.
 */
export function resolvePremiumAccess(params: {
  isOwner: boolean
  explicitGrants: string[]
  trialEndsAt: string | null
  allPremiumIds: string[]
  now?: Date
}): PremiumAccess {
  const now = params.now ?? new Date()
  const endMs = params.trialEndsAt ? new Date(params.trialEndsAt).getTime() : null
  const trialActive = !params.isOwner && endMs != null && endMs > now.getTime()
  const trialDaysLeft = !params.isOwner && endMs != null ? Math.max(0, Math.ceil((endMs - now.getTime()) / DAY_MS)) : 0

  const unlockedPremiumIds = params.isOwner
    ? [...params.allPremiumIds]
    : params.explicitGrants.filter((id) => params.allPremiumIds.includes(id))

  return { unlockedPremiumIds, isOwner: params.isOwner, trialActive, trialEndsAt: params.trialEndsAt, trialDaysLeft }
}
