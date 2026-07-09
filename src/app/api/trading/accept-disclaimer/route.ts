/**
 *   POST /api/trading/accept-disclaimer   { riskProfile }
 *
 * One-time gate before a user's first real action in any of the 3 trading
 * systems: records the plain-English disclaimer acknowledgment and the
 * chosen risk tier in a single write. Plain RLS-scoped update — no admin
 * client needed, the user is only ever touching their own profile row.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { RiskTier } from '@/lib/risk-profiles'

const VALID_TIERS: RiskTier[] = ['cautious', 'balanced', 'aggressive']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { riskProfile?: string }
  const riskProfile = VALID_TIERS.includes(body.riskProfile as RiskTier) ? body.riskProfile : 'balanced'

  const { data: profile, error: updErr } = await supabase
    .from('profiles')
    .update({ trading_disclaimer_accepted_at: new Date().toISOString(), risk_profile: riskProfile })
    .eq('id', user.id)
    .select('*')
    .single()

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, profile })
}
