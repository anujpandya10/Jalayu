import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getAllAssets } from '@/lib/market-data'
import { rankLongs, rankShorts } from '@/lib/trading-signals'
import { getCurrentPhase } from '@/lib/trading-phase'
import type { PhaseInfo } from '@/lib/trading-phase'
import {
  ROUND_TRIP_FEE_PCT,
  LONG_TP_PCT,
  LONG_SL_PCT,
  SHORT_TP_PCT,
  SHORT_SL_PCT,
  FOREX_TP_PCT,
  FOREX_SL_PCT,
  POSITION_SIZE_PCT,
  MIN_TRADE_USD,
  TIME_EXIT_SECS,
  STALE_EXIT_SECS,
} from '@/lib/trading-config'

/** Apply simulated round-trip fees to closed-trade P&L */
function applyFees(notional: number, rawPnl: number): number {
  const fee = notional * ROUND_TRIP_FEE_PCT
  return parseFloat((rawPnl - fee).toFixed(4))
}

// Phase-based position limits (fewer concurrent = less fee churn)
function getPositionLimits(phase: PhaseInfo) {
  if (phase.phase === 'STOCK_MARKET') {
    return { maxLongs: 2, maxShorts: 2, maxStocks: 2, maxForex: 1, maxCrypto: 2 }
  }
  if (phase.phase === 'PREMARKET') {
    return { maxLongs: 2, maxShorts: 1, maxStocks: 0, maxForex: 1, maxCrypto: 2 }
  }
  return { maxLongs: 2, maxShorts: 2, maxStocks: 0, maxForex: 2, maxCrypto: 2 }
}

export interface TickEvent {
  type: 'LONG_BUY' | 'LONG_SELL' | 'SHORT_OPEN' | 'SHORT_COVER' | 'SCAN' | 'HOLD'
  symbol: string
  name: string
  price: number
  direction: 'LONG' | 'SHORT'
  shares?: number
  total?: number
  pnl?: number
  pnlPct?: number
  reason: string
  urgency?: string
  ts: number
}

interface PositionRow {
  id: string
  symbol: string
  name: string | null
  shares: number | string
  avg_buy_price: number | string
  created_at: string
  direction?: string | null
  asset_type?: string | null
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const events: TickEvent[] = []
  const now = Date.now()

  // ── Determine current trading phase ───────────────────────────────────────
  const phaseInfo = getCurrentPhase()
  const limits = getPositionLimits(phaseInfo)

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
  const priceMap = new Map(assets.map((a) => [a.symbol, a.price]))
  const assetTypeMap = new Map(assets.map((a) => [a.symbol, a.assetType]))

  const pumpCandidates = assets.filter((a) => a.isPumpCandidate).length
  const forexCount = assets.filter((a) => a.assetType === 'forex').length

  events.push({
    type: 'SCAN', symbol: '', name: '', price: 0,
    direction: 'LONG',
    reason: `[${phaseInfo.emoji} ${phaseInfo.label}] Scanned ${assets.length} assets · ${pumpCandidates} pumps · ${forexCount} forex pairs`,
    ts: now,
  })

  // ── 3. Load open positions (try with direction column, fall back without) ──
  let posRaw: PositionRow[] | null = null
  const { data: posWithDir, error: dirError } = await supabase
    .from('paper_positions')
    .select('id, symbol, name, shares, avg_buy_price, created_at, direction')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (!dirError) {
    posRaw = posWithDir as PositionRow[]
  } else {
    // Migration not run yet — fall back, treat all as LONG
    const { data: posNoDir } = await supabase
      .from('paper_positions')
      .select('id, symbol, name, shares, avg_buy_price, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    posRaw = (posNoDir ?? []).map((p) => ({ ...p, direction: 'LONG' })) as PositionRow[]
  }

  const positions = posRaw ?? []

  // ── 4. Exit decisions for existing positions ───────────────────────────────
  for (const pos of positions) {
    const current = priceMap.get(pos.symbol)
    if (!current) continue

    const avgCost = Number(pos.avg_buy_price)
    const shares = Number(pos.shares)
    const heldSecs = (now - new Date(pos.created_at).getTime()) / 1000
    const direction = pos.direction === 'SHORT' ? 'SHORT' : 'LONG'

    // Determine if this is a forex position (check asset type map or stored type)
    const posAssetType = pos.asset_type ?? assetTypeMap.get(pos.symbol) ?? 'crypto'
    const isForex = posAssetType === 'forex'

    // Use tighter thresholds for forex
    const tpPct = isForex ? FOREX_TP_PCT : (direction === 'SHORT' ? SHORT_TP_PCT : LONG_TP_PCT)
    const slPct = isForex ? FOREX_SL_PCT : (direction === 'SHORT' ? SHORT_SL_PCT : LONG_SL_PCT)

    let shouldExit = false
    let exitReason = ''
    let pnl = 0
    let pnlPct = 0
    const eventType: TickEvent['type'] = direction === 'SHORT' ? 'SHORT_COVER' : 'LONG_SELL'

    if (direction === 'LONG') {
      pnlPct = (current - avgCost) / avgCost
      pnl = (current - avgCost) * shares

      if (pnlPct >= tpPct) {
        shouldExit = true
        exitReason = `Take profit +${(pnlPct * 100).toFixed(2)}% (+$${pnl.toFixed(2)})`
      } else if (pnlPct <= -slPct) {
        shouldExit = true
        exitReason = `Stop loss ${(pnlPct * 100).toFixed(2)}% ($${pnl.toFixed(2)})`
      } else if (heldSecs >= TIME_EXIT_SECS && pnlPct > 0.0001) {
        shouldExit = true
        exitReason = `Time exit — held ${Math.round(heldSecs)}s, +$${pnl.toFixed(3)} profit, rotating`
      } else if (heldSecs >= STALE_EXIT_SECS && pnlPct < 0) {
        shouldExit = true
        exitReason = `Stale cut — held ${Math.round(heldSecs)}s, loss ${(pnlPct * 100).toFixed(2)}%`
      }
    } else {
      // SHORT: profit = price fell below entry
      // pnlPct positive = price dropped = we profit
      pnlPct = (avgCost - current) / avgCost
      pnl = (avgCost - current) * shares

      if (pnlPct >= tpPct) {
        shouldExit = true
        exitReason = `SHORT cover — price dropped ${(pnlPct * 100).toFixed(2)}%, profit +$${pnl.toFixed(2)}`
      } else if (pnlPct <= -slPct) {
        // Price rose, stop loss
        shouldExit = true
        exitReason = `SHORT stop loss — price rose ${(-pnlPct * 100).toFixed(2)}%, loss $${pnl.toFixed(2)}`
      } else if (heldSecs >= TIME_EXIT_SECS && pnlPct > 0.0001) {
        shouldExit = true
        exitReason = `SHORT time exit — held ${Math.round(heldSecs)}s, profit +$${pnl.toFixed(3)}`
      } else if (heldSecs >= STALE_EXIT_SECS && pnlPct < 0) {
        shouldExit = true
        exitReason = `SHORT stale cut — held ${Math.round(heldSecs)}s, loss ${(-pnlPct * 100).toFixed(2)}%`
      }
    }

    if (shouldExit) {
      const total = parseFloat((current * shares).toFixed(2))
      const notional = avgCost * shares
      const pnlFinal = applyFees(notional, pnl)
      const pnlPctFinal = notional > 0
        ? parseFloat(((pnlFinal / notional) * 100).toFixed(2))
        : 0

      // Insert trade record (try with direction, fall back without)
      const tradePayload = {
        user_id: user.id,
        symbol: pos.symbol, name: pos.name,
        action: direction === 'SHORT' ? 'BUY' : 'SELL',  // cover = buy back; sell long = sell
        shares, price: current, total, pnl: pnlFinal,
        reason: exitReason, auto: true,
        direction,
      }

      let tradeInsertError: { message: string } | null = null
      const { error: e1 } = await supabase.from('paper_trades').insert(tradePayload)
      if (e1) {
        // Try without direction column
        const { direction: _dir, ...payloadNoDir } = tradePayload
        const { error: e2 } = await supabase.from('paper_trades').insert(payloadNoDir)
        tradeInsertError = e2
      }

      if (!tradeInsertError) {
        await supabase.from('paper_positions').delete().eq('id', pos.id)

        // For SHORT: when we "cover" we effectively get cash = entry price * shares (we sold at entry, buy back at current)
        if (direction === 'SHORT') {
          // Cash returned = original entry value + profit (or - loss)
          cash = parseFloat((cash + avgCost * shares + pnlFinal).toFixed(2))
        } else {
          cash = parseFloat((cash + total).toFixed(2))
        }

        events.push({
          type: eventType,
          symbol: pos.symbol, name: pos.name ?? pos.symbol,
          price: current, direction, shares, total, pnl: pnlFinal, pnlPct: pnlPctFinal,
          reason: exitReason, ts: now,
        })
      }
    }
  }

  // ── 5. Count current longs/shorts after exits ──────────────────────────────
  const { data: heldRaw } = await supabase
    .from('paper_positions')
    .select('symbol, direction')
    .eq('user_id', user.id)

  const held = heldRaw ?? []
  const heldSet = new Set(held.map((r: { symbol: string }) => r.symbol))

  let currentLongs = 0
  let currentShorts = 0
  for (const h of held) {
    const dir = (h as { symbol: string; direction?: string }).direction
    if (dir === 'SHORT') currentShorts++
    else currentLongs++
  }

  // ── 6. Filter signals by phase ─────────────────────────────────────────────
  // Only trade asset types allowed in the current phase
  const allLongSignals = rankLongs(assets).filter((s) => !heldSet.has(s.asset.symbol))
  const allShortSignals = rankShorts(assets).filter((s) => !heldSet.has(s.asset.symbol))

  const longSignals = allLongSignals.filter((s) => {
    const t = s.asset.assetType
    if (t === 'stock' && !phaseInfo.stocksActive) return false
    if (t === 'forex' && !phaseInfo.forexActive) return false
    if (t === 'crypto' && !phaseInfo.cryptoActive) return false
    return true
  })

  const shortSignals = allShortSignals.filter((s) => {
    const t = s.asset.assetType
    if (t === 'stock' && !phaseInfo.stocksActive) return false
    if (t === 'forex' && !phaseInfo.forexActive) return false
    if (t === 'crypto' && !phaseInfo.cryptoActive) return false
    return true
  })

  // ── 7. Open new LONG positions ─────────────────────────────────────────────
  const maxLongs = limits.maxLongs
  const longSlots = maxLongs - currentLongs
  const longsToOpen = longSignals.slice(0, Math.max(0, longSlots))

  for (const sig of longsToOpen) {
    const budget = Math.min(cash * POSITION_SIZE_PCT, cash * 0.9)
    if (budget < MIN_TRADE_USD || cash < MIN_TRADE_USD) break

    const price = sig.asset.price
    const shares = parseFloat((budget / price).toFixed(8))
    const total = parseFloat((price * shares).toFixed(2))
    if (total > cash) continue

    const reason = `LONG — ${sig.reason} (score ${sig.score.toFixed(1)})`

    const buyPayload = {
      user_id: user.id,
      symbol: sig.asset.symbol, name: sig.asset.name,
      action: 'BUY', shares, price, total, pnl: null, reason, auto: true,
      direction: 'LONG',
    }

    let tradeError: { message: string } | null = null
    const { error: e1 } = await supabase.from('paper_trades').insert(buyPayload)
    if (e1) {
      const { direction: _dir, ...noDir } = buyPayload
      const { error: e2 } = await supabase.from('paper_trades').insert(noDir)
      tradeError = e2
    }

    if (!tradeError) {
      const posPayload = {
        user_id: user.id,
        symbol: sig.asset.symbol, name: sig.asset.name,
        shares, avg_buy_price: price,
        direction: 'LONG',
        asset_type: sig.asset.assetType,
      }

      const { error: pe1 } = await supabase.from('paper_positions').insert(posPayload)
      if (pe1) {
        const { direction: _dir, ...noDirPos } = posPayload
        await supabase.from('paper_positions').insert(noDirPos)
      }

      cash = parseFloat((cash - total).toFixed(2))
      heldSet.add(sig.asset.symbol)
      currentLongs++

      events.push({
        type: 'LONG_BUY', symbol: sig.asset.symbol, name: sig.asset.name,
        price, direction: 'LONG', shares, total, reason, urgency: sig.urgency, ts: now,
      })
    }
  }

  // ── 8. Open new SHORT positions ────────────────────────────────────────────
  const maxShorts = limits.maxShorts
  const shortSlots = maxShorts - currentShorts
  const shortsToOpen = shortSignals.slice(0, Math.max(0, shortSlots))

  for (const sig of shortsToOpen) {
    // For shorts: we "sell" at current price and hold the position.
    // Reserve cash = position size (collateral for the short).
    const budget = Math.min(cash * POSITION_SIZE_PCT, cash * 0.9)
    if (budget < MIN_TRADE_USD || cash < MIN_TRADE_USD) break

    const price = sig.asset.price
    const shares = parseFloat((budget / price).toFixed(8))
    const total = parseFloat((price * shares).toFixed(2))
    if (total > cash) continue

    const reason = `SHORT OPEN — ${sig.reason} (score ${sig.score.toFixed(1)})`

    // Record as BUY action with direction=SHORT (opening the short position)
    const tradePayload = {
      user_id: user.id,
      symbol: sig.asset.symbol, name: sig.asset.name,
      action: 'BUY', shares, price, total, pnl: null, reason, auto: true,
      direction: 'SHORT',
    }

    let tradeError: { message: string } | null = null
    const { error: e1 } = await supabase.from('paper_trades').insert(tradePayload)
    if (e1) {
      const { direction: _dir, ...noDir } = tradePayload
      const { error: e2 } = await supabase.from('paper_trades').insert(noDir)
      tradeError = e2
    }

    if (!tradeError) {
      const posPayload = {
        user_id: user.id,
        symbol: sig.asset.symbol, name: sig.asset.name,
        shares, avg_buy_price: price,
        direction: 'SHORT',
        asset_type: sig.asset.assetType,
      }

      const { error: pe1 } = await supabase.from('paper_positions').insert(posPayload)
      if (pe1) {
        const { direction: _dir, ...noDirPos } = posPayload
        await supabase.from('paper_positions').insert(noDirPos)
      }

      // Reserve cash as collateral for the short
      cash = parseFloat((cash - total).toFixed(2))
      heldSet.add(sig.asset.symbol)
      currentShorts++

      events.push({
        type: 'SHORT_OPEN', symbol: sig.asset.symbol, name: sig.asset.name,
        price, direction: 'SHORT', shares, total, reason, urgency: sig.urgency, ts: now,
      })
    }
  }

  // ── 9. HOLD if nothing happened ────────────────────────────────────────────
  const actionCount = events.filter((e) => e.type !== 'SCAN').length
  if (actionCount === 0) {
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0,
      direction: 'LONG',
      reason: `${heldSet.size} positions held (${currentLongs}L/${currentShorts}S), watching for exits or new signals`,
      ts: now,
    })
  }

  await supabase.from('paper_portfolio').update({
    cash, updated_at: new Date().toISOString(),
  }).eq('user_id', user.id)

  return NextResponse.json({
    events, cash,
    assetsScanned: assets.length,
    pumpCandidates,
    currentLongs,
    currentShorts,
    phase: phaseInfo,
  })
}
