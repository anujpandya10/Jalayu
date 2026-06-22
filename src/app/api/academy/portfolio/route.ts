import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getQuote } from '@/lib/yahoo-finance'
import { ACADEMY_SEED_CAPITAL } from '@/lib/academy-config'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let { data: portfolio } = await supabase
    .from('academy_portfolio')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!portfolio) {
    const { data: created, error: createError } = await supabase
      .from('academy_portfolio')
      .insert({ user_id: user.id, cash: ACADEMY_SEED_CAPITAL })
      .select()
      .single()
    if (createError || !created) {
      return NextResponse.json({ error: 'Failed to create portfolio' }, { status: 500 })
    }
    portfolio = created
  }

  const { data: positionsRaw } = await supabase
    .from('academy_positions')
    .select('*')
    .eq('user_id', user.id)

  const positions = positionsRaw ?? []
  const cash = Number(portfolio.cash)
  let positionsEquity = 0

  const enrichedPositions = await Promise.all(positions.map(async (pos) => {
    const shares = Number(pos.shares)
    const avgEntryPrice = Number(pos.avg_entry_price)
    const cost = avgEntryPrice * shares
    const isShort = pos.direction === 'SHORT'

    let currentPrice = avgEntryPrice
    try {
      const q = await getQuote(pos.symbol)
      currentPrice = q.price
    } catch {
      // fall back to entry price if the live quote fails
    }

    const pnl = isShort ? (avgEntryPrice - currentPrice) * shares : (currentPrice - avgEntryPrice) * shares
    const pnlPct = cost !== 0 ? (pnl / cost) * 100 : 0
    const equity = isShort ? cost + pnl : currentPrice * shares
    positionsEquity += equity

    return {
      symbol: pos.symbol,
      name: pos.name ?? pos.symbol,
      direction: pos.direction,
      shares,
      avgEntryPrice,
      currentPrice,
      value: equity,
      pnl,
      pnlPct,
      declaredSetupTag: pos.declared_setup_tag,
      declaredStopLoss: pos.declared_stop_loss,
      declaredTakeProfit: pos.declared_take_profit,
      thesis: pos.thesis,
      entryTradeId: pos.entry_trade_id,
      createdAt: pos.created_at,
      managed: pos.managed ?? false,
      halfClosed: pos.half_closed ?? false,
      stopPrice: pos.stop_price ?? null,
      target1Price: pos.target1_price ?? null,
      target2Price: pos.target2_price ?? null,
    }
  }))

  const totalValue = cash + positionsEquity
  const totalPnL = totalValue - ACADEMY_SEED_CAPITAL
  const totalPnLPct = (totalPnL / ACADEMY_SEED_CAPITAL) * 100

  return NextResponse.json({
    cash,
    positions: enrichedPositions,
    totalValue,
    totalPnL,
    totalPnLPct,
    seedCapital: ACADEMY_SEED_CAPITAL,
  })
}
