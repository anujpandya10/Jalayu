/**
 * Shared paper-trading engine — used by /api/trading/tick (dashboard) and /api/cron/trading (24/7).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAllAssets, type AssetData } from '@/lib/market-data'
import { rankLongs, rankShorts, rankSignalsEnriched, type Signal } from '@/lib/trading-signals'
import { getCurrentPhase, type PhaseInfo } from '@/lib/trading-phase'
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
  SEED_CAPITAL,
} from '@/lib/trading-config'

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

export interface TradingTickResult {
  events: TickEvent[]
  cash: number
  assetsScanned: number
  pumpCandidates: number
  currentLongs: number
  currentShorts: number
  phase: PhaseInfo
  tradesExecuted: number
  skipped?: boolean
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

function applyFees(notional: number, rawPnl: number): number {
  const fee = notional * ROUND_TRIP_FEE_PCT
  return parseFloat((rawPnl - fee).toFixed(4))
}

function getPositionLimits(phase: PhaseInfo) {
  if (phase.phase === 'STOCK_MARKET') {
    return { maxLongs: 2, maxShorts: 2 }
  }
  if (phase.phase === 'PREMARKET') {
    return { maxLongs: 2, maxShorts: 1 }
  }
  return { maxLongs: 2, maxShorts: 2 }
}

export interface RunTradingTickOptions {
  /** Pre-fetched market data (cron batches one fetch for all users) */
  assets?: AssetData[]
  /** Skip if last_run_at is within this many seconds (avoids double-trading with cron) */
  minSecondsSinceLastRun?: number
  /** Force run even if recently ran */
  force?: boolean
}

export async function runTradingTick(
  supabase: SupabaseClient,
  userId: string,
  options: RunTradingTickOptions = {},
): Promise<TradingTickResult> {
  const events: TickEvent[] = []
  const now = Date.now()
  const phaseInfo = getCurrentPhase()
  const limits = getPositionLimits(phaseInfo)

  let { data: portfolio } = await supabase
    .from('paper_portfolio')
    .select('id, cash, last_run_at, auto_trading_enabled, total_trades_run')
    .eq('user_id', userId)
    .single()

  if (!portfolio) {
    const { data: created } = await supabase
      .from('paper_portfolio')
      .insert({ user_id: userId, cash: SEED_CAPITAL, auto_trading_enabled: true })
      .select('id, cash, last_run_at, auto_trading_enabled, total_trades_run')
      .single()
    portfolio = created
  }

  if (!portfolio) {
    throw new Error('Could not load portfolio')
  }

  if (portfolio.auto_trading_enabled === false) {
    return {
      events: [{
        type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
        reason: 'Auto-trading paused in settings', ts: now,
      }],
      cash: Number(portfolio.cash),
      assetsScanned: 0,
      pumpCandidates: 0,
      currentLongs: 0,
      currentShorts: 0,
      phase: phaseInfo,
      tradesExecuted: 0,
      skipped: true,
    }
  }

  const lastRun = portfolio.last_run_at ? new Date(portfolio.last_run_at).getTime() : 0
  const secsSinceRun = lastRun ? (now - lastRun) / 1000 : Infinity
  const minGap = options.minSecondsSinceLastRun ?? 0

  if (!options.force && minGap > 0 && secsSinceRun < minGap) {
    return {
      events: [{
        type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
        reason: `Server ran ${Math.round(secsSinceRun)}s ago — next cycle soon`,
        ts: now,
      }],
      cash: Number(portfolio.cash),
      assetsScanned: 0,
      pumpCandidates: 0,
      currentLongs: 0,
      currentShorts: 0,
      phase: phaseInfo,
      tradesExecuted: 0,
      skipped: true,
    }
  }

  let cash = Number(portfolio.cash)
  let tradesExecuted = 0

  const assets = options.assets ?? await getAllAssets()
  const priceMap    = new Map(assets.map((a) => [a.symbol, a.price]))
  const assetTypeMap = new Map(assets.map((a) => [a.symbol, a.assetType]))
  const pumpCandidates = assets.filter((a) => a.isPumpCandidate).length
  const forexCount = assets.filter((a) => a.assetType === 'forex').length

  // ── Enriched signals: run indicator scoring on top candidates ─────────────
  // Enriches top 3 longs + top 3 shorts with 1m candles (Binance/Yahoo)
  const allSignals   = await rankSignalsEnriched(assets, 3)
  const signalMap    = new Map(allSignals.map((s) => [s.asset.symbol, s]))

  events.push({
    type: 'SCAN', symbol: '', name: '', price: 0, direction: 'LONG',
    reason: `[${phaseInfo.emoji} ${phaseInfo.label}] Scanned ${assets.length} assets · ${pumpCandidates} pumps · ${forexCount} forex`,
    ts: now,
  })

  let posRaw: PositionRow[] | null = null
  const { data: posWithDir, error: dirError } = await supabase
    .from('paper_positions')
    .select('id, symbol, name, shares, avg_buy_price, created_at, direction, asset_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (!dirError) {
    posRaw = posWithDir as PositionRow[]
  } else {
    const { data: posNoDir } = await supabase
      .from('paper_positions')
      .select('id, symbol, name, shares, avg_buy_price, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    posRaw = (posNoDir ?? []).map((p) => ({ ...p, direction: 'LONG' })) as PositionRow[]
  }

  const positions = posRaw ?? []

  for (const pos of positions) {
    const current = priceMap.get(pos.symbol)
    if (!current) continue

    const avgCost = Number(pos.avg_buy_price)
    const shares = Number(pos.shares)
    const heldSecs = (now - new Date(pos.created_at).getTime()) / 1000
    const direction = pos.direction === 'SHORT' ? 'SHORT' : 'LONG'
    const posAssetType = pos.asset_type ?? assetTypeMap.get(pos.symbol) ?? 'crypto'
    const isForex = posAssetType === 'forex'
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
        exitReason = `Time exit — held ${Math.round(heldSecs)}s, +$${pnl.toFixed(3)}`
      } else if (heldSecs >= STALE_EXIT_SECS && pnlPct < 0) {
        shouldExit = true
        exitReason = `Stale cut — held ${Math.round(heldSecs)}s, loss ${(pnlPct * 100).toFixed(2)}%`
      }
    } else {
      pnlPct = (avgCost - current) / avgCost
      pnl = (avgCost - current) * shares
      if (pnlPct >= tpPct) {
        shouldExit = true
        exitReason = `SHORT cover — profit +$${pnl.toFixed(2)}`
      } else if (pnlPct <= -slPct) {
        shouldExit = true
        exitReason = `SHORT stop loss — loss $${pnl.toFixed(2)}`
      } else if (heldSecs >= TIME_EXIT_SECS && pnlPct > 0.0001) {
        shouldExit = true
        exitReason = `SHORT time exit — +$${pnl.toFixed(3)}`
      } else if (heldSecs >= STALE_EXIT_SECS && pnlPct < 0) {
        shouldExit = true
        exitReason = `SHORT stale cut — loss ${(-pnlPct * 100).toFixed(2)}%`
      }
    }

    if (!shouldExit) continue

    const total = parseFloat((current * shares).toFixed(2))
    const notional = avgCost * shares
    const pnlFinal = applyFees(notional, pnl)
    const pnlPctFinal = notional > 0 ? parseFloat(((pnlFinal / notional) * 100).toFixed(2)) : 0

    const tradePayload = {
      user_id: userId,
      symbol: pos.symbol, name: pos.name,
      action: direction === 'SHORT' ? 'BUY' : 'SELL',
      shares, price: current, total, pnl: pnlFinal,
      reason: exitReason, auto: true, direction,
    }

    let tradeInsertError: { message: string } | null = null
    const { error: e1 } = await supabase.from('paper_trades').insert(tradePayload)
    if (e1) {
      const { direction: _d, ...noDir } = tradePayload
      const { error: e2 } = await supabase.from('paper_trades').insert(noDir)
      tradeInsertError = e2
    }

    if (tradeInsertError) continue

    await supabase.from('paper_positions').delete().eq('id', pos.id)
    if (direction === 'SHORT') {
      cash = parseFloat((cash + avgCost * shares + pnlFinal).toFixed(2))
    } else {
      cash = parseFloat((cash + total).toFixed(2))
    }
    tradesExecuted++

    events.push({
      type: eventType,
      symbol: pos.symbol, name: pos.name ?? pos.symbol,
      price: current, direction, shares, total, pnl: pnlFinal, pnlPct: pnlPctFinal,
      reason: exitReason, ts: now,
    })
  }

  const { data: heldRaw } = await supabase
    .from('paper_positions')
    .select('symbol, direction')
    .eq('user_id', userId)

  const held = heldRaw ?? []
  const heldSet = new Set(held.map((r: { symbol: string }) => r.symbol))
  let currentLongs = 0
  let currentShorts = 0
  for (const h of held) {
    const dir = (h as { direction?: string }).direction
    if (dir === 'SHORT') currentShorts++
    else currentLongs++
  }

  const filterByPhase = (s: ReturnType<typeof rankLongs>[0]) => {
    const t = s.asset.assetType
    if (t === 'stock' && !phaseInfo.stocksActive) return false
    if (t === 'forex' && !phaseInfo.forexActive) return false
    if (t === 'crypto' && !phaseInfo.cryptoActive) return false
    return true
  }

  const longSignals = rankLongs(assets)
    .filter((s) => !heldSet.has(s.asset.symbol))
    .filter(filterByPhase)

  const shortSignals = rankShorts(assets)
    .filter((s) => !heldSet.has(s.asset.symbol))
    .filter(filterByPhase)

  // ── Helper: check if this setup tag is disabled by user ──────────────────
  const { data: strategyConfigs } = await supabase
    .from('strategy_config')
    .select('setup_tag, enabled')
    .eq('user_id', userId)
  const disabledTags = new Set(
    (strategyConfigs ?? [])
      .filter((c: { enabled: boolean }) => !c.enabled)
      .map((c: { setup_tag: string }) => c.setup_tag)
  )

  // ── Helper: log a trade_setup snapshot ───────────────────────────────────
  async function logSetup(sig: Signal, direction: 'LONG' | 'SHORT'): Promise<string | null> {
    const ind = sig.indicators
    const { data: row } = await supabase.from('trade_setups').insert({
      user_id     : userId,
      symbol      : sig.asset.symbol,
      asset_type  : sig.asset.assetType,
      direction,
      entry_price : sig.asset.price,
      rsi_at_entry: ind?.rsi ?? null,
      vwap_dev_pct: ind?.vwapDevPct ?? null,
      atr_pct     : ind?.atrPct ?? null,
      vol_spike   : ind?.volSpike ?? null,
      change_24h  : sig.asset.change24h,
      initial_score: sig.score,
      setup_tag   : sig.setupTag,
    }).select('id').single()
    return row?.id ?? null
  }

  // ── Helper: close a trade_setup with outcome ──────────────────────────────
  async function closeSetup(setupId: string | null, pnl: number, heldSecs: number, exitReason: string) {
    if (!setupId) return
    await supabase.from('trade_setups').update({
      outcome_pnl: pnl,
      won        : pnl > 0,
      held_secs  : Math.round(heldSecs),
      exit_reason: exitReason,
      closed_at  : new Date().toISOString(),
    }).eq('id', setupId)
  }

  // Track open setup IDs so we can close them when positions exit
  // Symbol → setup_id stored in position name field as JSON metadata isn't ideal;
  // instead we query the latest open trade_setup for a symbol on exit.
  async function getOpenSetupId(symbol: string): Promise<string | null> {
    const { data } = await supabase
      .from('trade_setups')
      .select('id')
      .eq('user_id', userId)
      .eq('symbol', symbol)
      .is('closed_at', null)
      .order('opened_at', { ascending: false })
      .limit(1)
      .single()
    return data?.id ?? null
  }

  // ── Close open positions (with setup logging) ─────────────────────────────
  // (Re-run exit logic so setup IDs can be closed)
  // NOTE: Exit logic already ran above; here we just close setups for exited positions.
  for (const ev of events) {
    if (ev.type === 'LONG_SELL' || ev.type === 'SHORT_COVER') {
      const setupId = await getOpenSetupId(ev.symbol)
      const heldSecs = (now - new Date(positions.find(p => p.symbol === ev.symbol)?.created_at ?? now).getTime()) / 1000
      await closeSetup(setupId, ev.pnl ?? 0, heldSecs, ev.reason)
    }
  }

  const longsToOpen = longSignals.slice(0, Math.max(0, limits.maxLongs - currentLongs))
  for (const rawSig of longsToOpen) {
    // Use enriched signal if available
    const sig = signalMap.get(rawSig.asset.symbol) ?? rawSig

    // Check if this setup is disabled by the user
    if (disabledTags.has(sig.setupTag)) continue

    const budget = Math.min(cash * POSITION_SIZE_PCT, cash * 0.9)
    if (budget < MIN_TRADE_USD || cash < MIN_TRADE_USD) break
    const price = sig.asset.price
    const shares = parseFloat((budget / price).toFixed(8))
    const total = parseFloat((price * shares).toFixed(2))
    if (total > cash) continue

    const indStr = sig.indicators
      ? ` RSI:${sig.indicators.rsi.toFixed(0)} VWAP:${sig.indicators.vwapDevPct.toFixed(2)}% vol:${sig.indicators.volSpike.toFixed(1)}×`
      : ''
    const reason = `LONG [${sig.setupTag}] — ${sig.reason}${indStr} (score ${sig.score.toFixed(1)})`

    const buyPayload = {
      user_id: userId,
      symbol: sig.asset.symbol, name: sig.asset.name,
      action: 'BUY', shares, price, total, pnl: null, reason, auto: true,
      direction: 'LONG', setup_tag: sig.setupTag,
    }

    let tradeError: { message: string } | null = null
    const { error: e1 } = await supabase.from('paper_trades').insert(buyPayload)
    if (e1) {
      const { direction: _d, setup_tag: _t, ...noExtra } = buyPayload
      const { error: e2 } = await supabase.from('paper_trades').insert(noExtra)
      tradeError = e2
    }
    if (tradeError) continue

    const posPayload = {
      user_id: userId,
      symbol: sig.asset.symbol, name: sig.asset.name,
      shares, avg_buy_price: price, direction: 'LONG',
      asset_type: sig.asset.assetType,
    }
    const { error: pe1 } = await supabase.from('paper_positions').insert(posPayload)
    if (pe1) {
      const { direction: _d, ...noDirPos } = posPayload
      await supabase.from('paper_positions').insert(noDirPos)
    }

    // Log setup snapshot for learning
    await logSetup(sig, 'LONG')

    cash = parseFloat((cash - total).toFixed(2))
    heldSet.add(sig.asset.symbol)
    currentLongs++
    tradesExecuted++
    events.push({
      type: 'LONG_BUY', symbol: sig.asset.symbol, name: sig.asset.name,
      price, direction: 'LONG', shares, total, reason, urgency: sig.urgency, ts: now,
    })
  }

  const shortsToOpen = shortSignals.slice(0, Math.max(0, limits.maxShorts - currentShorts))
  for (const rawSig of shortsToOpen) {
    const sig = signalMap.get(rawSig.asset.symbol) ?? rawSig

    if (disabledTags.has(sig.setupTag)) continue

    const budget = Math.min(cash * POSITION_SIZE_PCT, cash * 0.9)
    if (budget < MIN_TRADE_USD || cash < MIN_TRADE_USD) break
    const price = sig.asset.price
    const shares = parseFloat((budget / price).toFixed(8))
    const total = parseFloat((price * shares).toFixed(2))
    if (total > cash) continue

    const indStr = sig.indicators
      ? ` RSI:${sig.indicators.rsi.toFixed(0)} VWAP:${sig.indicators.vwapDevPct.toFixed(2)}%`
      : ''
    const reason = `SHORT [${sig.setupTag}] — ${sig.reason}${indStr} (score ${sig.score.toFixed(1)})`

    const tradePayload = {
      user_id: userId,
      symbol: sig.asset.symbol, name: sig.asset.name,
      action: 'BUY', shares, price, total, pnl: null, reason, auto: true,
      direction: 'SHORT', setup_tag: sig.setupTag,
    }

    let tradeError: { message: string } | null = null
    const { error: e1 } = await supabase.from('paper_trades').insert(tradePayload)
    if (e1) {
      const { direction: _d, setup_tag: _t, ...noExtra } = tradePayload
      const { error: e2 } = await supabase.from('paper_trades').insert(noExtra)
      tradeError = e2
    }
    if (tradeError) continue

    const posPayload = {
      user_id: userId,
      symbol: sig.asset.symbol, name: sig.asset.name,
      shares, avg_buy_price: price, direction: 'SHORT',
      asset_type: sig.asset.assetType,
    }
    const { error: pe1 } = await supabase.from('paper_positions').insert(posPayload)
    if (pe1) {
      const { direction: _d, ...noDirPos } = posPayload
      await supabase.from('paper_positions').insert(noDirPos)
    }

    await logSetup(sig, 'SHORT')

    cash = parseFloat((cash - total).toFixed(2))
    heldSet.add(sig.asset.symbol)
    currentShorts++
    tradesExecuted++
    events.push({
      type: 'SHORT_OPEN', symbol: sig.asset.symbol, name: sig.asset.name,
      price, direction: 'SHORT', shares, total, reason, urgency: sig.urgency, ts: now,
    })
  }

  if (events.filter((e) => e.type !== 'SCAN').length === 0) {
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
      reason: `${heldSet.size} positions (${currentLongs}L/${currentShorts}S) — watching`,
      ts: now,
    })
  }

  await supabase.from('paper_portfolio').update({
    cash,
    updated_at: new Date().toISOString(),
    last_run_at: new Date().toISOString(),
    total_trades_run: (portfolio.total_trades_run ?? 0) + tradesExecuted,
  }).eq('user_id', userId)

  return {
    events,
    cash,
    assetsScanned: assets.length,
    pumpCandidates,
    currentLongs,
    currentShorts,
    phase: phaseInfo,
    tradesExecuted,
  }
}
