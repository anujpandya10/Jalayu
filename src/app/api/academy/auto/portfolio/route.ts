import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getQuote } from '@/lib/yahoo-finance'
import { AUTO_SEED_CAPITAL } from '@/lib/academy-auto-trader'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let { data: portfolio } = await supabase.from('academy_auto_portfolio').select('*').eq('user_id', user.id).maybeSingle()
  if (!portfolio) {
    const { data: created } = await supabase
      .from('academy_auto_portfolio').insert({ user_id: user.id, cash: AUTO_SEED_CAPITAL, enabled: false }).select().single()
    portfolio = created
  }
  if (!portfolio) return NextResponse.json({ error: 'Failed to load portfolio' }, { status: 500 })

  const { data: positionsRaw } = await supabase.from('academy_auto_positions').select('*').eq('user_id', user.id)
  const positions = positionsRaw ?? []
  const cash = Number(portfolio.cash)
  let positionsValue = 0

  const enriched = await Promise.all(positions.map(async (pos) => {
    const shares = Number(pos.shares)
    const entry = Number(pos.avg_entry_price)
    let price = entry
    try { price = (await getQuote(pos.symbol)).price } catch { /* fall back to entry */ }
    const isShort = pos.direction === 'SHORT'
    const pnl = isShort ? (entry - price) * shares : (price - entry) * shares
    const pnlPct = entry * shares !== 0 ? (pnl / (entry * shares)) * 100 : 0
    const value = isShort ? entry * shares + pnl : price * shares
    positionsValue += value
    return {
      symbol: pos.symbol, name: pos.name ?? pos.symbol, direction: pos.direction,
      shares, originalShares: Number(pos.original_shares), avgEntryPrice: entry, currentPrice: price,
      value, pnl, pnlPct, setupTag: pos.setup_tag, halfClosed: pos.half_closed,
      stopPrice: pos.stop_price, target1Price: pos.target1_price, target2Price: pos.target2_price,
      entryEma9: pos.entry_ema9, entryEma21: pos.entry_ema21, entryVwap: pos.entry_vwap, entryRsi: pos.entry_rsi,
    }
  }))

  const totalValue = cash + positionsValue
  return NextResponse.json({
    cash, enabled: portfolio.enabled, positions: enriched,
    totalValue, totalPnL: totalValue - AUTO_SEED_CAPITAL, totalPnLPct: ((totalValue - AUTO_SEED_CAPITAL) / AUTO_SEED_CAPITAL) * 100,
    seedCapital: AUTO_SEED_CAPITAL,
  })
}
