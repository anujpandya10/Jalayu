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

  const [assets, { data: positions }] = await Promise.all([
    getAllAssets(),
    supabase
      .from('paper_positions')
      .select('symbol, direction, shares, avg_buy_price, created_at')
      .eq('user_id', user.id),
  ])

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
  })
}
