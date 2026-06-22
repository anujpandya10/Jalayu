/**
 *   GET /api/academy/stats
 *
 * Two distinct stat sets:
 *   botSetupStats     — the auto-trading bot's real, already-running win
 *                        rate per setup tag (from the `setup_stats` view).
 *                        This is the "ahead of time prediction" the curriculum
 *                        and order ticket cite — forward-tested live data,
 *                        not a backtest.
 *   studentSetupStats — the student's own academy track record, grouped by
 *                        the setup the coach actually matched at entry time.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Bot's real history, rolled up across asset types per setup tag ────────
  const { data: botStats } = await supabase
    .from('setup_stats')
    .select('setup_tag, total_trades, wins, avg_pnl')
    .eq('user_id', user.id)

  const botBySetup = new Map<string, { totalTrades: number; wins: number; pnlWeighted: number }>()
  for (const row of botStats ?? []) {
    const cur = botBySetup.get(row.setup_tag) ?? { totalTrades: 0, wins: 0, pnlWeighted: 0 }
    const trades = Number(row.total_trades)
    cur.totalTrades += trades
    cur.wins += Number(row.wins)
    cur.pnlWeighted += Number(row.avg_pnl) * trades
    botBySetup.set(row.setup_tag, cur)
  }
  const botSetupStats = [...botBySetup.entries()].map(([setupTag, s]) => ({
    setupTag,
    totalTrades: s.totalTrades,
    winRatePct: s.totalTrades > 0 ? Math.round((s.wins / s.totalTrades) * 1000) / 10 : 0,
    avgPnl: s.totalTrades > 0 ? Math.round((s.pnlWeighted / s.totalTrades) * 10000) / 10000 : 0,
  }))

  // ── Student's own closed academy trades ────────────────────────────────────
  const { data: closedTrades } = await supabase
    .from('academy_trades')
    .select('id, pnl, total, entry_trade_id')
    .eq('user_id', user.id)
    .not('pnl', 'is', null)

  const entryTradeIds = [...new Set((closedTrades ?? []).map((t) => t.entry_trade_id).filter(Boolean))]
  let entryReviewByTradeId = new Map<string, string>()
  if (entryTradeIds.length > 0) {
    const { data: entryReviews } = await supabase
      .from('academy_trade_reviews')
      .select('trade_id, matched_setup_tag')
      .eq('user_id', user.id)
      .eq('review_type', 'ENTRY')
      .in('trade_id', entryTradeIds)
    entryReviewByTradeId = new Map((entryReviews ?? []).map((r) => [r.trade_id, r.matched_setup_tag ?? 'NO_SETUP']))
  }

  const studentBySetup = new Map<string, { totalTrades: number; wins: number; sumPnlPct: number }>()
  for (const t of closedTrades ?? []) {
    const tag = (t.entry_trade_id && entryReviewByTradeId.get(t.entry_trade_id)) ?? 'NO_SETUP'
    const cur = studentBySetup.get(tag) ?? { totalTrades: 0, wins: 0, sumPnlPct: 0 }
    const pnl = Number(t.pnl)
    const pnlPct = Number(t.total) > 0 ? (pnl / Number(t.total)) * 100 : 0
    cur.totalTrades += 1
    if (pnl > 0) cur.wins += 1
    cur.sumPnlPct += pnlPct
    studentBySetup.set(tag, cur)
  }
  const studentSetupStats = [...studentBySetup.entries()].map(([setupTag, s]) => ({
    setupTag,
    totalTrades: s.totalTrades,
    winRatePct: s.totalTrades > 0 ? Math.round((s.wins / s.totalTrades) * 1000) / 10 : 0,
    avgPnlPct: s.totalTrades > 0 ? Math.round((s.sumPnlPct / s.totalTrades) * 100) / 100 : 0,
  }))

  return NextResponse.json({ botSetupStats, studentSetupStats })
}
