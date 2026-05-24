import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { CORE_LONG_SETUPS } from '@/lib/trading-config'

const ALL_SETUP_TAGS = [
  ...CORE_LONG_SETUPS,
  'PUMP_SHORT', 'SUPERNOVA_SHORT', 'VWAP_SHORT', 'FOREX_DIP', 'FOREX_FADE', 'MEAN_REVERT',
]

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: portfolio } = await supabase
    .from('paper_portfolio')
    .select('auto_trading_enabled, last_run_at, cash')
    .eq('user_id', user.id)
    .single()

  const { data: disabled } = await supabase
    .from('strategy_config')
    .select('setup_tag')
    .eq('user_id', user.id)
    .eq('enabled', false)

  return NextResponse.json({
    autoTradingEnabled: portfolio?.auto_trading_enabled !== false,
    lastRunAt: portfolio?.last_run_at ?? null,
    disabledSetups: (disabled ?? []).map((r) => r.setup_tag),
  })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    autoTradingEnabled?: boolean
    resumeEngine?: boolean
  }

  const updates: Record<string, unknown> = {}

  if (body.autoTradingEnabled !== undefined) {
    updates.auto_trading_enabled = body.autoTradingEnabled
  }
  if (body.resumeEngine === true) {
    updates.auto_trading_enabled = true
  }

  if (Object.keys(updates).length > 0) {
    const { data: existing } = await supabase
      .from('paper_portfolio')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('paper_portfolio')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('paper_portfolio')
        .insert({ user_id: user.id, cash: 500, ...updates })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (body.resumeEngine === true) {
    for (const setup_tag of ALL_SETUP_TAGS) {
      await supabase.from('strategy_config').upsert({
        user_id: user.id,
        setup_tag,
        enabled: true,
        notes: 'Re-enabled via resume engine',
      }, { onConflict: 'user_id,setup_tag' })
    }
  }

  const { data: portfolio } = await supabase
    .from('paper_portfolio')
    .select('auto_trading_enabled, last_run_at')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    ok: true,
    autoTradingEnabled: portfolio?.auto_trading_enabled !== false,
    lastRunAt: portfolio?.last_run_at ?? null,
    resumed: body.resumeEngine === true,
  })
}
