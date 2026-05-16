import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getAllAssets } from '@/lib/market-data'
import { rankSignals } from '@/lib/trading-signals'

// Thresholds — aggressive for active paper trading
const TAKE_PROFIT_PCT = 0.005  // +0.5%
const STOP_LOSS_PCT   = 0.008  // -0.8%
const POSITION_SIZE_PCT = 0.22 // 22% of cash per trade
const MIN_TRADE_USD = 3
const BUY_SCORE_MIN = 2.0      // lower = more trades fire

export interface TickEvent {
  type: 'BUY' | 'SELL' | 'SCAN' | 'SKIP'
  symbol: string
  name: string
  price: number
  shares?: number
  total?: number
  pnl?: number
  reason: string
  ts: number
}

interface PositionRow {
  id: string
  symbol: string
  name: string | null
  shares: number | string
  avg_buy_price: number | string
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const events: TickEvent[] = []

  // ── 1. Load portfolio ──────────────────────────────────────────────────────
  let { data: portfolio } = await supabase
    .from('paper_portfolio')
    .select('id, cash')
    .eq('user_id', user.id)
    .single()

  if (!portfolio) {
    const { data: created } = await supabase
      .from('paper_portfolio')
      .insert({ user_id: user.id, cash: 500 })
      .select('id, cash')
      .single()
    portfolio = created
  }
  if (!portfolio) return NextResponse.json({ error: 'No portfolio' }, { status: 500 })

  let cash: number = Number(portfolio.cash)

  // ── 2. Fetch live market data ──────────────────────────────────────────────
  const assets = await getAllAssets()
  const signals = rankSignals(assets)
  const priceMap = new Map(assets.map((a) => [a.symbol, a.price]))

  events.push({ type: 'SCAN', symbol: '', name: '', price: 0, reason: `Scanned ${assets.length} assets`, ts: Date.now() })

  // ── 3. Load open positions ──────────────────────────────────────────────────
  const { data: positionsRaw } = await supabase
    .from('paper_positions')
    .select('id, symbol, name, shares, avg_buy_price')
    .eq('user_id', user.id)

  const positions = (positionsRaw ?? []) as PositionRow[]

  // ── 4. Check take-profit / stop-loss on every position ─────────────────────
  for (const pos of positions) {
    const current = priceMap.get(pos.symbol)
    if (!current) continue

    const avgCost = Number(pos.avg_buy_price)
    const shares = Number(pos.shares)
    const pctChange = (current - avgCost) / avgCost

    const hitTP = pctChange >= TAKE_PROFIT_PCT
    const hitSL = pctChange <= -STOP_LOSS_PCT

    if (hitTP || hitSL) {
      const total = parseFloat((current * shares).toFixed(2))
      const pnl = parseFloat(((current - avgCost) * shares).toFixed(4))
      const reason = hitTP
        ? `Take profit +${(pctChange * 100).toFixed(2)}% — sold at $${current.toFixed(4)}`
        : `Stop loss ${(pctChange * 100).toFixed(2)}% — cut loss at $${current.toFixed(4)}`

      const { error } = await supabase.from('paper_trades').insert({
        user_id: user.id,
        symbol: pos.symbol,
        name: pos.name,
        action: 'SELL',
        shares,
        price: current,
        total,
        pnl,
        reason,
        auto: true,
      })

      if (!error) {
        await supabase.from('paper_positions').delete().eq('id', pos.id)
        cash = parseFloat((cash + total).toFixed(2))
        events.push({ type: 'SELL', symbol: pos.symbol, name: pos.name ?? pos.symbol, price: current, shares, total, pnl, reason, ts: Date.now() })
      }
    }
  }

  // ── 5. Find top buy signals ─────────────────────────────────────────────────
  const { data: heldRaw } = await supabase
    .from('paper_positions')
    .select('symbol')
    .eq('user_id', user.id)
  const held = new Set((heldRaw ?? []).map((r: { symbol: string }) => r.symbol))

  const buys = signals
    .filter((s) => s.score >= BUY_SCORE_MIN && !held.has(s.asset.symbol))
    .slice(0, 3)

  for (const sig of buys) {
    const budget = cash * POSITION_SIZE_PCT
    if (budget < MIN_TRADE_USD) continue

    const price = sig.asset.price
    const shares = parseFloat((budget / price).toFixed(8))
    const total = parseFloat((price * shares).toFixed(2))
    const reason = `Buy — ${sig.reason} (score ${sig.score.toFixed(1)})`

    const { error } = await supabase.from('paper_trades').insert({
      user_id: user.id,
      symbol: sig.asset.symbol,
      name: sig.asset.name,
      action: 'BUY',
      shares,
      price,
      total,
      pnl: null,
      reason,
      auto: true,
    })

    if (!error) {
      // Insert position — only include columns we know exist
      await supabase.from('paper_positions').insert({
        user_id: user.id,
        symbol: sig.asset.symbol,
        name: sig.asset.name,
        shares,
        avg_buy_price: price,
      })
      cash = parseFloat((cash - total).toFixed(2))
      held.add(sig.asset.symbol)
      events.push({ type: 'BUY', symbol: sig.asset.symbol, name: sig.asset.name, price, shares, total, reason, ts: Date.now() })
    }
  }

  if (events.filter((e) => e.type !== 'SCAN').length === 0) {
    events.push({ type: 'SKIP', symbol: '', name: '', price: 0, reason: 'No signals strong enough — holding', ts: Date.now() })
  }

  // Update cash
  await supabase.from('paper_portfolio').update({
    cash,
    updated_at: new Date().toISOString(),
  }).eq('user_id', user.id)

  return NextResponse.json({ events, cash, assetsScanned: assets.length })
}
