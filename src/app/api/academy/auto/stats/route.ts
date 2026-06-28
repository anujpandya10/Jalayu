/**
 *   GET /api/academy/auto/stats
 * Performance + learning view for the Auto Trader: equity curve (cumulative
 * realized P&L over closed trades), today's P&L, overall win rate, and the
 * per-setup track record the bot uses to decide what to keep trading.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { AUTO_SEED_CAPITAL } from '@/lib/academy-auto-trader'

function etDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: closedRaw } = await supabase
    .from('academy_auto_trades').select('symbol, pnl, setup_tag, shares, risk_per_share, created_at')
    .eq('user_id', user.id).not('pnl', 'is', null).order('created_at', { ascending: true }).limit(500)
  const closed = closedRaw ?? []

  // Equity curve: running realized P&L on top of the seed
  let running = AUTO_SEED_CAPITAL
  const equityCurve = closed.map((t) => { running += Number(t.pnl); return Math.round(running * 100) / 100 })

  const wins = closed.filter((t) => Number(t.pnl) > 0).length
  const totalClosed = closed.length
  const totalRealized = closed.reduce((s, t) => s + Number(t.pnl), 0)

  const today = etDateKey(new Date())
  const realizedToday = closed.filter((t) => etDateKey(new Date(t.created_at as string)) === today).reduce((s, t) => s + Number(t.pnl), 0)

  // R-multiple expectancy — the real professional scoreboard. Per closed trade,
  // R = realized $ / (per-share risk fixed at entry × shares). Avg R is "expectancy":
  // how many units of risk you net, on average, every time you take a trade. Positive
  // avg R = a genuine edge; it's the number that actually matters, more than win rate.
  const rTrades = closed.filter((t) => t.risk_per_share != null && Number(t.risk_per_share) > 0 && Number(t.shares) > 0)
  const rValues = rTrades.map((t) => Number(t.pnl) / (Number(t.risk_per_share) * Number(t.shares)))
  const totalR = rValues.reduce((s, r) => s + r, 0)
  const avgR = rValues.length > 0 ? totalR / rValues.length : null
  const bestR = rValues.length > 0 ? Math.max(...rValues) : null

  const bySetup = new Map<string, { wins: number; total: number; pnl: number }>()
  for (const t of closed) {
    const tag = t.setup_tag ?? 'UNTAGGED'
    const cur = bySetup.get(tag) ?? { wins: 0, total: 0, pnl: 0 }
    cur.total++; if (Number(t.pnl) > 0) cur.wins++; cur.pnl += Number(t.pnl)
    bySetup.set(tag, cur)
  }
  const setupStats = [...bySetup.entries()]
    .map(([setupTag, s]) => ({ setupTag, total: s.total, wins: s.wins, winRatePct: Math.round((s.wins / s.total) * 100), pnl: Math.round(s.pnl * 100) / 100 }))
    .sort((a, b) => b.total - a.total)

  const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10)
  return NextResponse.json({
    equityCurve, seedCapital: AUTO_SEED_CAPITAL,
    totalClosed, wins, winRatePct: totalClosed > 0 ? Math.round((wins / totalClosed) * 100) : 0,
    totalRealized: Math.round(totalRealized * 100) / 100,
    realizedToday: Math.round(realizedToday * 100) / 100,
    avgR: round1(avgR), totalR: round1(totalR), bestR: round1(bestR), rSamples: rValues.length,
    setupStats,
  })
}
