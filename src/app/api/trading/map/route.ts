/**
 * Live asset map data — returns ALL scanned assets with their full state
 * for the visualization. Polled every ~5s by the AssetMap component.
 *
 * Returns:
 *   - Every asset with: symbol, name, price, change24h, score, action, setupTag
 *   - User's open positions (so the map can ring them)
 *   - Current market regime (BTC trend)
 *   - Phase info (crypto night / market hours / etc.)
 *
 * Lightweight — uses stage1-only `rankSignals` (no candle fetch) so it
 * stays fast even at 5s polling. The full trading engine (with candles)
 * runs on its own cycle.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getAllAssets } from '@/lib/market-data'
import { rankSignals } from '@/lib/trading-signals'
import { getCurrentPhase } from '@/lib/trading-phase'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [assets, { data: positions }, { data: setupHistory }] = await Promise.all([
    getAllAssets(),
    supabase
      .from('paper_positions')
      .select('symbol, direction, shares, avg_buy_price, created_at')
      .eq('user_id', user.id),
    // For the bot constellation — last 100 closed trades grouped by setup
    supabase
      .from('trade_setups')
      .select('setup_tag, won, outcome_pnl, closed_at, opened_at')
      .eq('user_id', user.id)
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(300),
  ])

  // ── Per-setup "bot" stats ─────────────────────────────────────────────────
  type BotStats = {
    setup: string
    trades: number
    wins: number
    losses: number
    netPnl: number
    winRate: number
    avgPnl: number
    lastTradeAt: string | null
    last30Pnl: number
  }
  const botMap = new Map<string, BotStats>()
  for (const t of setupHistory ?? []) {
    const tag = (t.setup_tag as string) || 'UNTAGGED'
    let b = botMap.get(tag)
    if (!b) {
      b = { setup: tag, trades: 0, wins: 0, losses: 0, netPnl: 0, winRate: 0, avgPnl: 0, lastTradeAt: null, last30Pnl: 0 }
      botMap.set(tag, b)
    }
    if (b.trades >= 50) continue
    b.trades++
    const pnl = Number(t.outcome_pnl ?? 0)
    b.netPnl += pnl
    if (b.trades <= 30) b.last30Pnl += pnl
    if (t.won) b.wins++; else b.losses++
    if (!b.lastTradeAt || (t.closed_at as string) > b.lastTradeAt) {
      b.lastTradeAt = t.closed_at as string
    }
  }
  const bots = [...botMap.values()].map((b) => ({
    ...b,
    winRate: b.trades > 0 ? b.wins / b.trades : 0,
    avgPnl: b.trades > 0 ? b.netPnl / b.trades : 0,
  })).sort((a, b) => b.trades - a.trades)

  // Score every asset cheaply (stage-1 only — no candle fetch per request)
  const signals = rankSignals(assets)

  const heldSet = new Set((positions ?? []).map((p) => p.symbol as string))
  const positionBySymbol = new Map(
    (positions ?? []).map((p) => [p.symbol as string, p]),
  )

  const map = signals.map((s) => {
    const pos = positionBySymbol.get(s.asset.symbol)
    return {
      symbol: s.asset.symbol,
      name: s.asset.name,
      assetType: s.asset.assetType,
      price: s.asset.price,
      change24h: s.asset.change24h,
      score: s.score,
      action: s.action,
      setupTag: s.setupTag,
      reason: s.reason,
      isPumpCandidate: s.asset.isPumpCandidate ?? false,
      held: heldSet.has(s.asset.symbol),
      position: pos
        ? {
            direction: (pos.direction as string) ?? 'LONG',
            shares: Number(pos.shares),
            entry: Number(pos.avg_buy_price),
            heldMins: Math.floor(
              (Date.now() - new Date(pos.created_at as string).getTime()) / 60000,
            ),
          }
        : null,
    }
  })

  return NextResponse.json({
    phase: getCurrentPhase(),
    serverTime: new Date().toISOString(),
    counts: {
      total: map.length,
      held: heldSet.size,
      longSignals: map.filter((m) => m.action === 'BUY_LONG').length,
      shortSignals: map.filter((m) => m.action === 'SELL_SHORT').length,
    },
    assets: map,
    bots,
  })
}
