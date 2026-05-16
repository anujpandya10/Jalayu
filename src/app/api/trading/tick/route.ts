import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getAllAssets } from '@/lib/market-data'
import { rankSignals } from '@/lib/trading-signals'

// ── Strategy constants ──────────────────────────────────────────────────────
const TAKE_PROFIT_PCT   = 0.0012  // +0.12% — trigger quick exits
const STOP_LOSS_PCT     = 0.004   // -0.4%  — cut fast
const MAX_POSITIONS     = 4       // never hold more than 4 at once
const CASH_RESERVE_PCT  = 0.20    // keep 20% cash for opportunities
const POSITION_SIZE_PCT = 0.20    // 20% of available cash per buy
const MIN_TRADE_USD     = 4
const BUY_SCORE_MIN     = 1.0     // fire on any dip signal
// Time-based exit: sell any position showing profit after this many seconds
const TIME_EXIT_SECS    = 60

export interface TickEvent {
  type: 'BUY' | 'SELL' | 'ROTATE' | 'SCAN' | 'HOLD'
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
  created_at: string
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const events: TickEvent[] = []
  const now = Date.now()

  // ── 1. Load / create portfolio ─────────────────────────────────────────────
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

  let cash = Number(portfolio.cash)

  // ── 2. Fetch live market data ──────────────────────────────────────────────
  const assets = await getAllAssets()
  const signals = rankSignals(assets)
  const priceMap = new Map(assets.map((a) => [a.symbol, a.price]))

  events.push({
    type: 'SCAN', symbol: '', name: '', price: 0,
    reason: `Scanned ${assets.length} assets`, ts: now,
  })

  // ── 3. Load open positions ─────────────────────────────────────────────────
  const { data: posRaw } = await supabase
    .from('paper_positions')
    .select('id, symbol, name, shares, avg_buy_price, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const positions = (posRaw ?? []) as PositionRow[]

  // ── 4. Sell decisions: TP, SL, time-based exit ─────────────────────────────
  for (const pos of positions) {
    const current = priceMap.get(pos.symbol)
    if (!current) continue

    const avgCost = Number(pos.avg_buy_price)
    const shares = Number(pos.shares)
    const pctChange = (current - avgCost) / avgCost
    const heldMs = now - new Date(pos.created_at).getTime()
    const heldSecs = heldMs / 1000

    let shouldSell = false
    let sellReason = ''

    if (pctChange >= TAKE_PROFIT_PCT) {
      shouldSell = true
      const dollarGain = (current - avgCost) * shares
      sellReason = `🟢 Take profit +${(pctChange * 100).toFixed(2)}% (+$${dollarGain.toFixed(2)})`
    } else if (pctChange <= -STOP_LOSS_PCT) {
      shouldSell = true
      const dollarLoss = (current - avgCost) * shares
      sellReason = `🔴 Stop loss ${(pctChange * 100).toFixed(2)}% ($${dollarLoss.toFixed(2)})`
    } else if (heldSecs >= TIME_EXIT_SECS && pctChange > 0.0001) {
      // Held > 60s and any profit at all → take it and reinvest
      shouldSell = true
      const dollarGain = (current - avgCost) * shares
      sellReason = `⏱ Time exit — held ${Math.round(heldSecs)}s, +$${dollarGain.toFixed(3)} profit, rotating`
    } else if (heldSecs >= TIME_EXIT_SECS * 3 && pctChange > -STOP_LOSS_PCT) {
      // Held > 3 min with no movement → free up cash for better opportunities
      shouldSell = true
      const dollardiff = (current - avgCost) * shares
      sellReason = `⏳ Stale exit — held ${Math.round(heldSecs)}s, freeing cash ($${dollardiff >= 0 ? '+' : ''}${dollardiff.toFixed(3)})`
    }

    if (shouldSell) {
      const total = parseFloat((current * shares).toFixed(2))
      const pnl = parseFloat(((current - avgCost) * shares).toFixed(4))

      const { error } = await supabase.from('paper_trades').insert({
        user_id: user.id,
        symbol: pos.symbol, name: pos.name,
        action: 'SELL', shares, price: current, total, pnl,
        reason: sellReason, auto: true,
      })

      if (!error) {
        await supabase.from('paper_positions').delete().eq('id', pos.id)
        cash = parseFloat((cash + total).toFixed(2))
        events.push({
          type: 'SELL', symbol: pos.symbol, name: pos.name ?? pos.symbol,
          price: current, shares, total, pnl, reason: sellReason, ts: now,
        })
      }
    }
  }

  // ── 5. If fully invested with weak positions, rotate the worst one ──────────
  const { data: currentPosRaw } = await supabase
    .from('paper_positions')
    .select('id, symbol, name, shares, avg_buy_price, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  let currentPositions = (currentPosRaw ?? []) as PositionRow[]
  const totalAssetValue = currentPositions.reduce((sum, p) => {
    const price = priceMap.get(p.symbol) ?? Number(p.avg_buy_price)
    return sum + price * Number(p.shares)
  }, 0)
  const totalPortfolioValue = cash + totalAssetValue
  const cashPct = totalPortfolioValue > 0 ? cash / totalPortfolioValue : 1

  // If we hold max positions with little cash, rotate the worst performer
  if (currentPositions.length >= MAX_POSITIONS && cashPct < 0.05) {
    const worstPos = currentPositions.reduce((worst, pos) => {
      const price = priceMap.get(pos.symbol) ?? Number(pos.avg_buy_price)
      const pct = (price - Number(pos.avg_buy_price)) / Number(pos.avg_buy_price)
      const worstPrice = priceMap.get(worst.symbol) ?? Number(worst.avg_buy_price)
      const worstPct = (worstPrice - Number(worst.avg_buy_price)) / Number(worst.avg_buy_price)
      return pct < worstPct ? pos : worst
    })

    const rotatePrice = priceMap.get(worstPos.symbol) ?? Number(worstPos.avg_buy_price)
    const rotateShares = Number(worstPos.shares)
    const rotateTotal = parseFloat((rotatePrice * rotateShares).toFixed(2))
    const rotatePnl = parseFloat(((rotatePrice - Number(worstPos.avg_buy_price)) * rotateShares).toFixed(4))
    const rotatePct = (rotatePrice - Number(worstPos.avg_buy_price)) / Number(worstPos.avg_buy_price)
    const rotateReason = `↩ Rotate out ${worstPos.symbol} (${(rotatePct * 100).toFixed(2)}%) — better signal found`

    const { error: re } = await supabase.from('paper_trades').insert({
      user_id: user.id,
      symbol: worstPos.symbol, name: worstPos.name,
      action: 'SELL', shares: rotateShares, price: rotatePrice,
      total: rotateTotal, pnl: rotatePnl, reason: rotateReason, auto: true,
    })
    if (!re) {
      await supabase.from('paper_positions').delete().eq('id', worstPos.id)
      cash = parseFloat((cash + rotateTotal).toFixed(2))
      currentPositions = currentPositions.filter((p) => p.id !== worstPos.id)
      events.push({
        type: 'ROTATE', symbol: worstPos.symbol, name: worstPos.name ?? worstPos.symbol,
        price: rotatePrice, shares: rotateShares, total: rotateTotal, pnl: rotatePnl,
        reason: rotateReason, ts: now,
      })
    }
  }

  // ── 6. Buy — top signals, respect max positions and cash reserve ────────────
  const { data: heldRaw } = await supabase
    .from('paper_positions').select('symbol').eq('user_id', user.id)
  const heldCount = (heldRaw ?? []).length
  const held = new Set((heldRaw ?? []).map((r: { symbol: string }) => r.symbol))

  const slotsAvailable = MAX_POSITIONS - heldCount
  const spendableCash = Math.max(0, cash - totalPortfolioValue * CASH_RESERVE_PCT)

  const buys = signals
    .filter((s) => s.score >= BUY_SCORE_MIN && !held.has(s.asset.symbol))
    .slice(0, Math.max(0, slotsAvailable))

  for (const sig of buys) {
    const budget = Math.min(spendableCash * POSITION_SIZE_PCT, cash * 0.9)
    if (budget < MIN_TRADE_USD || cash < MIN_TRADE_USD) break

    const price = sig.asset.price
    const shares = parseFloat((budget / price).toFixed(8))
    const total = parseFloat((price * shares).toFixed(2))
    if (total > cash) continue

    const reason = `Buy — ${sig.reason} (score ${sig.score.toFixed(1)})`

    const { error } = await supabase.from('paper_trades').insert({
      user_id: user.id,
      symbol: sig.asset.symbol, name: sig.asset.name,
      action: 'BUY', shares, price, total, pnl: null, reason, auto: true,
    })

    if (!error) {
      await supabase.from('paper_positions').insert({
        user_id: user.id,
        symbol: sig.asset.symbol, name: sig.asset.name,
        shares, avg_buy_price: price,
      })
      cash = parseFloat((cash - total).toFixed(2))
      held.add(sig.asset.symbol)
      events.push({
        type: 'BUY', symbol: sig.asset.symbol, name: sig.asset.name,
        price, shares, total, reason, ts: now,
      })
    }
  }

  const actionCount = events.filter((e) => e.type !== 'SCAN').length
  if (actionCount === 0) {
    const held2 = heldRaw?.length ?? 0
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0,
      reason: `${held2} positions held, watching for exits or new signals`,
      ts: now,
    })
  }

  await supabase.from('paper_portfolio').update({
    cash, updated_at: new Date().toISOString(),
  }).eq('user_id', user.id)

  return NextResponse.json({ events, cash, assetsScanned: assets.length })
}
