/**
 *   POST /api/onboarding/finish
 *
 * Single transaction-ish endpoint called at the end of the new 8-step
 * onboarding. Writes every profile field the form captured, marks the
 * user as onboarded, then generates a welcome letter from the just-saved
 * profile and stores it as today's daily_letters row.
 *
 * Returns { profile, letter } so the onboarding page can render the
 * letter inline as the final screen.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { generateWelcomeLetter } from '@/lib/letter-generator'
import { applyIntakeForNewUser } from '@/lib/user-modules'
import type { IntakeAnswers } from '@/lib/life-intake'

export const maxDuration = 60

interface FinishBody {
  nickname?: string
  pronouns?: string | null
  life_stage?: string
  biggest_goal?: string
  struggles_text?: string
  help_domains?: string[]
  module_answers?: IntakeAnswers
  voice_prefs?: string[]
  boundaries?: string | null
}

function todayDateKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as FinishBody
  const nickname = (body.nickname ?? '').trim()
  const lifeStage = (body.life_stage ?? '').trim()
  const biggestGoal = (body.biggest_goal ?? '').trim()
  const strugglesText = (body.struggles_text ?? '').trim()

  if (!nickname || !lifeStage || biggestGoal.length < 3) {
    return NextResponse.json({ error: 'Missing required fields (nickname, life stage, biggest goal)' }, { status: 400 })
  }

  // This route is reachable any time a signed-in user POSTs to it, not just on the client's
  // one intended visit — check the PRE-upsert state so a re-run (or a replayed request) never
  // re-applies curated new-user module defaults over whatever the person has since set up.
  const { data: existingProfile } = await supabase.from('profiles').select('onboarding_complete').eq('id', user.id).maybeSingle()
  const isFirstCompletion = !existingProfile?.onboarding_complete

  // Compose the profile patch. Keep `struggles` as a single-element array
  // for back-compat with the old text[] column shape.
  const patch = {
    id: user.id,
    nickname,
    full_name: nickname,
    pronouns: body.pronouns?.trim() || null,
    life_stage: lifeStage,
    biggest_goal: biggestGoal,
    struggles: strugglesText ? [strugglesText] : [],
    help_domains: Array.isArray(body.help_domains) ? body.help_domains : [],
    voice_prefs: Array.isArray(body.voice_prefs) ? body.voice_prefs : [],
    boundaries: body.boundaries?.trim() || null,
    onboarding_complete: true,
    updated_at: new Date().toISOString(),
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .upsert(patch)
    .select('*')
    .single()

  if (profileErr || !profile) {
    return NextResponse.json(
      { error: profileErr?.message ?? 'profile save failed' },
      { status: 500 },
    )
  }

  // Curated defaults: only on genuine first completion. This writes an explicit user_modules
  // row per registry module (premium force-disabled), which is what takes a new user off the
  // fail-open "show everything" path — existing users never hit this branch.
  if (isFirstCompletion) {
    try { await applyIntakeForNewUser(supabase, user.id, body.module_answers ?? {}) }
    catch (err) { console.warn('[onboarding/finish] module curation failed:', err instanceof Error ? err.message : err) }

    // Start the 7-day premium trial from this moment. Separate update (not part of the patch
    // above) so a missing column — migration 047 not yet applied — degrades to "no trial"
    // instead of failing the whole onboarding upsert.
    const trialEnds = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
    const { error: trialErr } = await supabase.from('profiles').update({ premium_trial_ends_at: trialEnds }).eq('id', user.id)
    if (trialErr) console.warn('[onboarding/finish] trial start failed (migration 047 applied?):', trialErr.message)
  }

  // Generate the welcome letter from the freshly-saved profile. Failures
  // here shouldn't block the user from entering the app — we still return
  // success, just without a letter.
  let letter = null
  try {
    const result = await generateWelcomeLetter(supabase, user.id)

    // Persist as today's daily_letters row. If today's date already has a row
    // (unlikely but possible if someone re-runs onboarding), skip the insert.
    const existing = await supabase
      .from('daily_letters')
      .select('id')
      .eq('user_id', user.id)
      .eq('letter_date', result.letterDate)
      .maybeSingle()

    if (existing.data) {
      // Re-fetch the full row to return
      const row = await supabase
        .from('daily_letters')
        .select('*')
        .eq('id', existing.data.id)
        .single()
      letter = row.data
    } else {
      const inserted = await supabase
        .from('daily_letters')
        .insert({
          user_id: user.id,
          letter_date: result.letterDate,
          text_md: result.textMd,
          model: result.model,
        })
        .select('*')
        .single()
      letter = inserted.data
    }
  } catch (err) {
    console.warn('[onboarding/finish] welcome letter generation failed:', err instanceof Error ? err.message : err)
    // Continue — profile is saved, user can still enter.
  }

  return NextResponse.json({ profile, letter, dateKey: todayDateKey() })
}
