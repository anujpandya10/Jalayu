/**
 * Equity curve — computes the user's portfolio net-worth over time from their
 * actual closed trades. Returns a series of { time, equity, trade_label? }
 * points for charting.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { SEED_CAPITAL } from '@/lib/trading-config'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pull all closed trades ordered by close time
  const { data: trades, error } = await supabase
    .from('paper_trades')
    .select('symbol, action, direction, pnl, created_at, total')
    .eq('user_id', user.id)
    .not('pnl', 'is', null)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Start at SEED, walk forward through trades, accumulating P&L
  const series: Array<{ time: number; equity: number; pnl: number; symbol: string }> = []
  let equity = SEED_CAPITAL
  // Seed point: portfolio creation
  const firstTradeTime = trades && trades.length > 0
    ? Math.floor(new Date(trades[0].created_at as string).getTime() / 1000)
    : Math.floor(Date.now() / 1000)
  series.push({ time: firstTradeTime - 60, equity, pnl: 0, symbol: 'SEED' })

  for (const t of trades ?? []) {
    const pnl = Number(t.pnl ?? 0)
    equity = parseFloat((equity + pnl).toFixed(2))
    series.push({
      time: Math.floor(new Date(t.created_at as string).getTime() / 1000),
      equity,
      pnl,
      symbol: t.symbol as string,
    })
  }

  // Summary stats
  const finalEquity = series[series.length - 1]?.equity ?? SEED_CAPITAL
  const totalPnl = finalEquity - SEED_CAPITAL
  const wins = (trades ?? []).filter((t) => Number(t.pnl) > 0).length
  const losses = (trades ?? []).filter((t) => Number(t.pnl) < 0).length
  const winRate = trades && trades.length > 0 ? wins / trades.length : 0
  const bestTrade = (trades ?? []).reduce((best, t) =>
    Number(t.pnl) > Number(best?.pnl ?? -Infinity) ? t : best, null as typeof trades extends Array<infer U> ? U | null : null)
  const worstTrade = (trades ?? []).reduce((worst, t) =>
    Number(t.pnl) < Number(worst?.pnl ?? Infinity) ? t : worst, null as typeof trades extends Array<infer U> ? U | null : null)

  return NextResponse.json({
    seed: SEED_CAPITAL,
    series,
    summary: {
      finalEquity,
      totalPnl,
      totalTrades: trades?.length ?? 0,
      wins,
      losses,
      winRate,
      bestTrade: bestTrade ? { symbol: bestTrade.symbol, pnl: Number(bestTrade.pnl) } : null,
      worstTrade: worstTrade ? { symbol: worstTrade.symbol, pnl: Number(worstTrade.pnl) } : null,
    },
  })
}
