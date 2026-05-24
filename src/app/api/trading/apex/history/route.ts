/**
 * Apex history + EV analytics.
 *
 *   GET /api/trading/apex/history?limit=100
 *
 * Returns:
 *   • recent decisions (filtered/sorted, max 200)
 *   • outcome correlation: for each decision, joins paper_trades on
 *     symbol + direction within a 60-min window AFTER the decision and
 *     attaches the realized PnL of the first matching trade
 *   • EV breakdowns by: conviction bucket, RSI alignment, regime, vol spike
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface DecisionRow {
  id: string
  symbol: string
  asset_type: string
  current_price: number
  ema9: number | null
  ema21: number | null
  vwap_dev_pct: number | null
  atr_pct: number | null
  regime: string | null
  rsi_1m: number | null
  rsi_15m: number | null
  vol_spike: number | null
  equity_at_decision: number
  drawdown_pct: number | null
  drawdown_active: boolean
  decision: 'BUY' | 'SELL' | 'HOLD'
  conviction_score: number
  rationale: string
  suggested_position_size_pct: number | null
  stop_loss_target: number | null
  take_profit_target: number | null
  rr_ratio: number | null
  created_at: string
}

interface PaperTradeOutcome {
  symbol: string
  direction: string | null
  pnl: number | null
  total: number
  reason: string
  created_at: string
}

function convictionBucket(score: number): string {
  if (score >= 8.5) return '8.5+ (institutional)'
  if (score >= 7)   return '7.0-8.4 (strong)'
  if (score >= 5)   return '5.0-6.9 (moderate)'
  return '<5 (low)'
}

function rsiAlignment(rsi1m: number | null, rsi15m: number | null): string {
  if (rsi1m == null || rsi15m == null) return 'unknown'
  const ob1 = rsi1m > 70, os1 = rsi1m < 30
  const ob15 = rsi15m > 70, os15 = rsi15m < 30
  if (os1 && rsi15m > 50)  return '1m oversold, 15m bullish (real bounce setup)'
  if (os1 && os15)         return 'both oversold (knife-catch risk)'
  if (ob1 && rsi15m < 50)  return '1m overbought, 15m bearish (real top setup)'
  if (ob1 && ob15)         return 'both overbought (momentum continuation)'
  if (Math.abs(rsi1m - rsi15m) < 5) return 'aligned mid-range'
  return 'divergent mid-range'
}

function volBucket(vs: number | null): string {
  if (vs == null) return 'unknown'
  if (vs >= 3)   return 'high spike (3×+)'
  if (vs >= 1.5) return 'moderate (1.5-3×)'
  return 'low (<1.5×)'
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 200)
  const symbolFilter = url.searchParams.get('symbol')
  const decisionFilter = url.searchParams.get('decision')

  let q = supabase
    .from('apex_decisions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (symbolFilter) q = q.eq('symbol', symbolFilter.toUpperCase())
  if (decisionFilter) q = q.eq('decision', decisionFilter.toUpperCase())

  const { data: decisions, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (decisions ?? []) as DecisionRow[]

  // ── Outcome correlation ────────────────────────────────────────────────
  // For each decision, look for the first paper_trade on the same symbol +
  // matching side (BUY → LONG entry; SELL → SHORT entry) within 60 minutes.
  // We don't know if Apex caused the trade — but the temporal+symbol overlap
  // is the closest signal we have for "what would this decision have earned."
  const sixtyMin = 60 * 60_000
  const earliest = rows.length > 0 ? new Date(rows[rows.length - 1].created_at).getTime() : Date.now()
  const symbols = [...new Set(rows.map((r) => r.symbol))]
  const matched = new Map<string, { pnl: number; pct: number; reason: string; closedAt: string }>()

  if (rows.length > 0 && symbols.length > 0) {
    // Pull paper trades on those symbols in the relevant window
    const { data: trades } = await supabase
      .from('paper_trades')
      .select('symbol, direction, action, pnl, total, reason, created_at')
      .eq('user_id', user.id)
      .in('symbol', symbols)
      .gte('created_at', new Date(earliest - sixtyMin).toISOString())
      .order('created_at', { ascending: true })

    const closedTrades = (trades ?? []).filter((t) => t.pnl != null) as PaperTradeOutcome[]

    for (const row of rows) {
      const wantedDir = row.decision === 'BUY' ? 'LONG' : row.decision === 'SELL' ? 'SHORT' : null
      if (!wantedDir) continue
      const decisionTs = new Date(row.created_at).getTime()
      const match = closedTrades.find((t) => {
        const tts = new Date(t.created_at).getTime()
        return t.symbol === row.symbol
          && (t.direction === wantedDir || (wantedDir === 'LONG' && !t.direction))
          && tts >= decisionTs
          && tts <= decisionTs + sixtyMin
      })
      if (match && match.pnl != null) {
        matched.set(row.id, {
          pnl: Number(match.pnl),
          pct: match.total > 0 ? (Number(match.pnl) / match.total) * 100 : 0,
          reason: match.reason,
          closedAt: match.created_at,
        })
      }
    }
  }

  // Build the enriched rows
  const enriched = rows.map((r) => {
    const out = matched.get(r.id)
    return {
      ...r,
      outcome: out ?? null,
      conviction_bucket: convictionBucket(r.conviction_score),
      rsi_alignment: rsiAlignment(r.rsi_1m, r.rsi_15m),
      vol_bucket: volBucket(r.vol_spike),
    }
  })

  // ── EV aggregations ───────────────────────────────────────────────────
  // Only count rows where we have a realized outcome AND the decision was BUY/SELL.
  const actedRows = enriched.filter((r) => r.outcome != null && r.decision !== 'HOLD')

  const byDim = (key: 'conviction_bucket' | 'rsi_alignment' | 'regime' | 'vol_bucket') => {
    const groups = new Map<string, { count: number; wins: number; sumPct: number; sumPnl: number }>()
    for (const r of actedRows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const k = String((r as any)[key] ?? 'unknown')
      const g = groups.get(k) ?? { count: 0, wins: 0, sumPct: 0, sumPnl: 0 }
      g.count++
      if (r.outcome!.pnl > 0) g.wins++
      g.sumPct += r.outcome!.pct
      g.sumPnl += r.outcome!.pnl
      groups.set(k, g)
    }
    return [...groups.entries()]
      .map(([bucket, g]) => ({
        bucket,
        trades: g.count,
        winRate: g.count > 0 ? g.wins / g.count : 0,
        avgPnlPct: g.count > 0 ? g.sumPct / g.count : 0,
        sumPnl: g.sumPnl,
      }))
      .sort((a, b) => b.avgPnlPct - a.avgPnlPct)
  }

  const totals = {
    decisionsLogged: enriched.length,
    actedOnCount: actedRows.length,
    avgConviction: enriched.length > 0
      ? enriched.reduce((s, r) => s + Number(r.conviction_score), 0) / enriched.length
      : 0,
    decisionMix: {
      BUY:  enriched.filter((r) => r.decision === 'BUY').length,
      SELL: enriched.filter((r) => r.decision === 'SELL').length,
      HOLD: enriched.filter((r) => r.decision === 'HOLD').length,
    },
    overallWinRate: actedRows.length > 0
      ? actedRows.filter((r) => r.outcome!.pnl > 0).length / actedRows.length
      : 0,
    overallAvgPnlPct: actedRows.length > 0
      ? actedRows.reduce((s, r) => s + r.outcome!.pct, 0) / actedRows.length
      : 0,
  }

  return NextResponse.json({
    decisions: enriched,
    ev: {
      byConviction: byDim('conviction_bucket'),
      byRsiAlignment: byDim('rsi_alignment'),
      byRegime: byDim('regime'),
      byVolSpike: byDim('vol_bucket'),
    },
    totals,
  })
}
