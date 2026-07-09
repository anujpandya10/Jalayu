/**
 * Server-side helpers for the per-user module layer (the "house on the land").
 * Functions take a supabase client + userId, matching the academy-orders.ts
 * pattern. Reads/writes `user_modules` and `user_life_intake` (migration 037).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { MODULE_REGISTRY, isPremiumModule } from '@/lib/modules-registry'
import { assembleFromIntake, type IntakeAnswers } from '@/lib/life-intake'

export interface UserModuleRow {
  module_id: string
  enabled: boolean
  sort_order: number
  config: Record<string, unknown>
}

const nowISO = () => new Date().toISOString()

/** The user's saved module config (empty array = never personalized → shell shows all). */
export async function getUserModules(supabase: SupabaseClient, userId: string): Promise<UserModuleRow[]> {
  const { data } = await supabase
    .from('user_modules')
    .select('module_id, enabled, sort_order, config')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
  return (data ?? []) as UserModuleRow[]
}

/**
 * Apply a completed life-intake: store the raw answers (resettable + auditable)
 * and write a full row set for every registry module — enabled where the
 * answers (or always-on) call for it. Writing the full set is what flips the
 * shell from "show everything" into the user's personalized house.
 * Returns the enabled module ids.
 */
export async function applyIntake(supabase: SupabaseClient, userId: string, answers: IntakeAnswers): Promise<string[]> {
  const enabled = assembleFromIntake(answers)
  const enabledSet = new Set(enabled)

  await supabase.from('user_life_intake').upsert(
    { user_id: userId, answers, completed_at: nowISO(), updated_at: nowISO() },
    { onConflict: 'user_id' },
  )

  const rows = MODULE_REGISTRY.map((m, i) => ({
    user_id: userId,
    module_id: m.id,
    enabled: enabledSet.has(m.id) || !!m.alwaysOn,
    sort_order: i,
    updated_at: nowISO(),
  }))
  await supabase.from('user_modules').upsert(rows, { onConflict: 'user_id,module_id' })

  return enabled
}

/**
 * Same as applyIntake, but for the moment a user first completes onboarding:
 * premium modules (Trading, Academy, Vault, Health) are force-disabled
 * regardless of what the intake mapping would have turned on — a new user
 * starts on the free tier and requests premium access afterward (Settings).
 * The chip they picked stays visibly selected (assembleFromIntake still ran),
 * only the resulting module row is held back — matches the disclaimer shown
 * in the onboarding UI, rather than silently hiding the option.
 */
export async function applyIntakeForNewUser(supabase: SupabaseClient, userId: string, answers: IntakeAnswers): Promise<string[]> {
  const enabled = await applyIntake(supabase, userId, answers)
  const premiumOn = enabled.filter((id) => isPremiumModule(id))
  if (premiumOn.length === 0) return enabled

  await supabase.from('user_modules')
    .update({ enabled: false, updated_at: nowISO() })
    .eq('user_id', userId)
    .in('module_id', premiumOn)

  return enabled.filter((id) => !isPremiumModule(id))
}

/** Toggle a single module on/off (the manual override on top of the intake). */
export async function setModuleEnabled(supabase: SupabaseClient, userId: string, moduleId: string, enabled: boolean): Promise<void> {
  await supabase.from('user_modules').upsert(
    { user_id: userId, module_id: moduleId, enabled, updated_at: nowISO() },
    { onConflict: 'user_id,module_id' },
  )
}

export async function getIntakeAnswers(supabase: SupabaseClient, userId: string): Promise<{ answers: IntakeAnswers; completedAt: string | null } | null> {
  const { data } = await supabase
    .from('user_life_intake')
    .select('answers, completed_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return { answers: (data.answers ?? {}) as IntakeAnswers, completedAt: data.completed_at as string | null }
}

/** Wipe the user's personalization — back to a blank "land" (shell shows all again). */
export async function resetIntake(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from('user_modules').delete().eq('user_id', userId)
  await supabase.from('user_life_intake').delete().eq('user_id', userId)
}
