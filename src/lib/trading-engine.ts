/**
 * Shared paper-trading engine — used by /api/trading/tick (dashboard) and /api/cron/trading (24/7).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAllAssets, fetchStockPrice, isUsMarketOpen, isPremarket, type AssetData } from '@/lib/market-data'
import {
  rankSignalsEnriched,
  filterLongEntries,
  filterShortEntries,
  type Signal,
} from '@/lib/trading-signals'
import { getCurrentPhase, type PhaseInfo } from '@/lib/trading-phase'
import {
  evaluateApexVeto,
  loadValidApexDecisions,
  logEngineApexVeto,
} from '@/lib/apex-veto'
import {
  ROUND_TRIP_FEE_PCT,
  computeEntryBudget,
  DAILY_LOSS_LIMIT_PCT,
  CRYPTO_HOT_WINDOWS_UTC,
  STOCK_HOT_WINDOWS_UTC,
  MIN_TRADE_USD,
  TIME_EXIT_SECS,
  STALE_EXIT_SECS,
  STALE_MIN_LOSS_PCT,
  QUICK_WIN_MIN_PCT,
  QUICK_WIN_HOLD_SECS,
  TIME_EXIT_TP_FRACTION,
  SYMBOL_COOLDOWN_SECS,
  SEED_CAPITAL,
  MIN_SHORT_SCORE,
  ENRICH_TOP_N,
  CORE_LONG_SETUPS,
  DRAWDOWN_HARD_STOP_PCT,
  DRAWDOWN_RECOVERY_PCT,
  MIN_TRADE_USD_RECOVERY,
  NEUTRAL_CRYPTO_MIN_SCORE,
  BEAR_CRYPTO_MIN_SCORE,
  getTpSl,
  BREAKEVEN_TRIGGER_PCT,
  BREAKEVEN_LOCK_PCT,
  TRAIL_TRIGGER_PCT,
  TRAIL_DISTANCE_PCT,
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

export interface TradingDiagnostics {
  ddMode: 'normal' | 'cautious' | 'recovery' | 'hard_stop'
  drawdownPct: number
  marketRegime: 'BULL' | 'BEAR' | 'NEUTRAL'
  openLongs: number
  openShorts: number
  longSlotsFree: number
  longCandidates: number
  shortCandidates: number
  circuitBreaker: boolean
  topLong: { symbol: string; score: number; setup: string } | null
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
  diagnostics?: TradingDiagnostics
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
  stop_loss_price?: number | null   // dynamic — updated by break-even / trailing logic
  take_profit_price?: number | null // stored for reference
}

function applyFees(notional: number, rawPnl: number): number {
  const fee = notional * ROUND_TRIP_FEE_PCT
  return parseFloat((rawPnl - fee).toFixed(4))
}

function getPositionLimits(phase: PhaseInfo) {
  if (phase.phase === 'STOCK_MARKET') {
    return { maxLongs: 3, maxShorts: 2 }
  }
  if (phase.phase === 'PREMARKET') {
    return { maxLongs: 3, maxShorts: 1 }
  }
  // CRYPTO_NIGHT / AFTER_HOURS — fewer but larger positions
  // 3 slots × ~$140 each = $420 deployed, far better profit per trade
  // than 5 × $80 (and shorts rarely fire in crypto night)
  return { maxLongs: 3, maxShorts: 1 }
}

function computePortfolioEquity(
  cash: number,
  positions: PositionRow[],
  priceMap: Map<string, number>,
): number {
  let positionsEquity = 0
  for (const pos of positions) {
    const shares = Number(pos.shares)
    const avgCost = Number(pos.avg_buy_price)
    const current = priceMap.get(pos.symbol) ?? avgCost
    const isShort = pos.direction === 'SHORT'
    if (isShort) {
      const pnl = (avgCost - current) * shares
      positionsEquity += avgCost * shares + pnl
    } else {
      positionsEquity += current * shares
    }
  }
  return cash + positionsEquity
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

  const baseAssets = options.assets ?? await getAllAssets()

  // ── Merge user's personal watchlist (stocks only, during market/premarket) ──
  const assets = [...baseAssets]
  if (isUsMarketOpen() || isPremarket()) {
    const { data: watchlistRows } = await supabase
      .from('trading_watchlist')
      .select('symbol, name')
      .eq('user_id', userId)

    if (watchlistRows && watchlistRows.length > 0) {
      const existingSymbols = new Set(assets.map((a) => a.symbol))
      const toFetch = watchlistRows.filter((r: { symbol: string }) => !existingSymbols.has(r.symbol))
      if (toFetch.length > 0) {
        const fetched = await Promise.allSettled(
          toFetch.map((r: { symbol: string; name: string }) => fetchStockPrice(r.symbol, r.name ?? r.symbol))
        )
        for (const r of fetched) {
          if (r.status === 'fulfilled' && r.value) assets.push(r.value)
        }
      }
    }
  }

  const priceMap    = new Map(assets.map((a) => [a.symbol, a.price]))
  const assetTypeMap = new Map(assets.map((a) => [a.symbol, a.assetType]))
  const pumpCandidates = assets.filter((a) => a.isPumpCandidate).length
  const stockCount  = assets.filter((a) => a.assetType === 'stock').length
  const forexCount  = assets.filter((a) => a.assetType === 'forex').length

  // ── Enriched signals: candles + RSI/VWAP for top candidates (incl. momentum) ─
  const allSignals = await rankSignalsEnriched(assets, ENRICH_TOP_N)
  const signalMap = new Map(allSignals.map((s) => [s.asset.symbol, s]))

  events.push({
    type: 'SCAN', symbol: '', name: '', price: 0, direction: 'LONG',
    reason: `[${phaseInfo.emoji} ${phaseInfo.label}] Scanned ${assets.length} assets · ${stockCount} stocks · ${pumpCandidates} pumps · ${forexCount} forex`,
    ts: now,
  })

  let posRaw: PositionRow[] | null = null
  const { data: posWithDir, error: dirError } = await supabase
    .from('paper_positions')
    .select('id, symbol, name, shares, avg_buy_price, created_at, direction, asset_type, stop_loss_price, take_profit_price')
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

    const avgCost   = Number(pos.avg_buy_price)
    const shares    = Number(pos.shares)
    const heldSecs  = (now - new Date(pos.created_at).getTime()) / 1000
    const direction = pos.direction === 'SHORT' ? 'SHORT' : 'LONG'
    const posAssetType = (pos.asset_type ?? assetTypeMap.get(pos.symbol) ?? 'crypto') as 'crypto' | 'stock' | 'forex'
    const openSig  = signalMap.get(pos.symbol)
    const setupTag = openSig?.setupTag ?? 'MEAN_REVERT'
    const { tp: tpPct, sl: slPct } = getTpSl(setupTag, direction, posAssetType)

    // ── Current P&L ────────────────────────────────────────────────────────
    const isLong   = direction === 'LONG'
    const rawPnlPct = isLong
      ? (current - avgCost) / avgCost
      : (avgCost - current) / avgCost
    const pnlPct = rawPnlPct   // signed: positive = in profit
    const pnl    = isLong ? (current - avgCost) * shares : (avgCost - current) * shares

    // ── Dynamic stop: read stored price or compute from % ──────────────────
    // stop_loss_price starts as the hard SL set at entry.
    // It gets ratcheted up (LONG) / down (SHORT) by break-even + trailing logic below.
    let dynamicSl = pos.stop_loss_price != null
      ? Number(pos.stop_loss_price)
      : (isLong ? avgCost * (1 - slPct) : avgCost * (1 + slPct))

    // ── Break-even stop activation ─────────────────────────────────────────
    // Once we're up BREAKEVEN_TRIGGER_PCT, lock the stop at entry + BREAKEVEN_LOCK_PCT.
    // After this fires, the trade CANNOT end in a meaningful loss — worst case is fees.
    if (pnlPct >= BREAKEVEN_TRIGGER_PCT) {
      const beSl = isLong
        ? avgCost * (1 + BREAKEVEN_LOCK_PCT)   // just above entry
        : avgCost * (1 - BREAKEVEN_LOCK_PCT)   // just below entry (short)
      if ((isLong && beSl > dynamicSl) || (!isLong && beSl < dynamicSl)) {
        dynamicSl = beSl
        // Persist to DB so subsequent ticks see the updated stop
        await supabase.from('paper_positions')
          .update({ stop_loss_price: dynamicSl })
          .eq('id', pos.id)
      }
    }

    // ── Trailing stop activation / ratchet ─────────────────────────────────
    // Once we're up TRAIL_TRIGGER_PCT, trail TRAIL_DISTANCE_PCT below price peak.
    // For longs: stop moves UP as price rises — never back down.
    // This lets big winners run while locking in most of the profit.
    if (pnlPct >= TRAIL_TRIGGER_PCT) {
      const trailSl = isLong
        ? current * (1 - TRAIL_DISTANCE_PCT)
        : current * (1 + TRAIL_DISTANCE_PCT)
      // Only move the stop if it improves (ratchet — never widen stop)
      if ((isLong && trailSl > dynamicSl) || (!isLong && trailSl < dynamicSl)) {
        dynamicSl = trailSl
        await supabase.from('paper_positions')
          .update({ stop_loss_price: dynamicSl })
          .eq('id', pos.id)
      }
    }

    // ── Exit decisions ─────────────────────────────────────────────────────
    let shouldExit = false
    let exitReason = ''
    const eventType: TickEvent['type'] = isLong ? 'LONG_SELL' : 'SHORT_COVER'

    // Quick wins ONLY for value-zone scalps (VWAP_LONG dips).
    // MOMENTUM_LONG and OVERSOLD_BOUNCE are high-conviction trend trades —
    // let them run to TP or trailing stop. Cutting them at +0.35% wastes the
    // setup's edge (these have 5:1 R:R; you want the 1.5%+ moves, not 0.35%).
    const allowQuickWin = ['VWAP_LONG', 'FOREX_DIP', 'FOREX_FADE'].includes(setupTag)

    // 1. Hard take-profit ceiling
    if (pnlPct >= tpPct) {
      shouldExit = true
      exitReason = `TP hit +${(pnlPct * 100).toFixed(2)}% (+$${pnl.toFixed(2)})`
    }
    // 2. Dynamic stop (hard SL, break-even, or trailing — whichever is highest/lowest)
    else if ((isLong && current <= dynamicSl) || (!isLong && current >= dynamicSl)) {
      const slLabel = pnlPct > 0.001
        ? `Trailing stop +${(pnlPct * 100).toFixed(2)}% (locked profit)`
        : pnlPct > -0.002
        ? `Break-even stop (fees only ~${(pnlPct * 100).toFixed(2)}%)`
        : `Hard stop ${(pnlPct * 100).toFixed(2)}% ($${pnl.toFixed(2)})`
      shouldExit = true
      exitReason = slLabel
    }
    // 3. Quick win: bank decent profit after 2 min.
    //    Only for value-zone setups. MOMENTUM/OVERSOLD ride to their targets.
    else if (allowQuickWin && heldSecs >= QUICK_WIN_HOLD_SECS && pnlPct >= QUICK_WIN_MIN_PCT && pnlPct < tpPct * 0.65) {
      shouldExit = true
      exitReason = `Quick win +${(pnlPct * 100).toFixed(2)}% secured after ${Math.round(heldSecs)}s`
    }
    // 4. Time exit: held 12 min and at least 40% of the way to TP — take it
    else if (heldSecs >= TIME_EXIT_SECS && pnlPct >= tpPct * TIME_EXIT_TP_FRACTION) {
      shouldExit = true
      exitReason = `Time exit — ${Math.round(heldSecs)}s, +${(pnlPct * 100).toFixed(2)}%`
    }
    // 5. Stale cut: held 12 min and STILL losing — it's not working, exit now
    else if (heldSecs >= STALE_EXIT_SECS && pnlPct < -STALE_MIN_LOSS_PCT) {
      shouldExit = true
      exitReason = `Stale cut — ${Math.round(heldSecs)}s with no recovery, ${(pnlPct * 100).toFixed(2)}%`
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

  // ── Symbol cooldown: differential, with multi-loss block ────────────────────
  // After 1 loss: 30 min cooldown (was 5 min). Pumps/dumps last hours, not minutes —
  //   a 5-min cooldown causes the "short NEAR → lose → short NEAR → lose" death loop.
  // After 2+ losses in 24h: 4 HOUR block. If we've been wrong twice on the same
  //   symbol in a day, that symbol is moving against our model — stop fighting it.
  // After a win: 60s cooldown (unchanged) — quick re-entry on new signals.
  const LOSS_COOLDOWN_SECS         = 1800   // 30 min after any losing exit
  const MULTI_LOSS_BLOCK_SECS      = 14400  // 4 hours if 2+ losses in 24h on same symbol
  const WIN_COOLDOWN_SECS          = SYMBOL_COOLDOWN_SECS
  const lossCutoff      = new Date(now - LOSS_COOLDOWN_SECS * 1000).toISOString()
  const winCutoff       = new Date(now - WIN_COOLDOWN_SECS * 1000).toISOString()
  const dayLookback     = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const multiLossCutoff = new Date(now - MULTI_LOSS_BLOCK_SECS * 1000).toISOString()

  const [{ data: lossExits }, { data: winExits }, { data: recentLosses }] = await Promise.all([
    supabase.from('paper_trades').select('symbol')
      .eq('user_id', userId).in('action', ['SELL', 'BUY']).lt('pnl', 0)
      .gte('created_at', lossCutoff),
    supabase.from('paper_trades').select('symbol')
      .eq('user_id', userId).in('action', ['SELL', 'BUY']).gte('pnl', 0).neq('pnl', null)
      .gte('created_at', winCutoff),
    supabase.from('paper_trades').select('symbol, created_at')
      .eq('user_id', userId).in('action', ['SELL', 'BUY']).lt('pnl', 0)
      .gte('created_at', dayLookback),
  ])

  // Count losses per symbol in 24h; if >= 2 AND most recent within MULTI_LOSS_BLOCK_SECS, block
  const lossCountBySymbol = new Map<string, { count: number; latestIso: string }>()
  for (const t of (recentLosses ?? []) as { symbol: string; created_at: string }[]) {
    const cur = lossCountBySymbol.get(t.symbol)
    if (!cur) lossCountBySymbol.set(t.symbol, { count: 1, latestIso: t.created_at })
    else {
      cur.count++
      if (t.created_at > cur.latestIso) cur.latestIso = t.created_at
    }
  }
  const multiLossBlocked = new Set<string>()
  for (const [symbol, info] of lossCountBySymbol.entries()) {
    if (info.count >= 2 && info.latestIso >= multiLossCutoff) {
      multiLossBlocked.add(symbol)
    }
  }

  const cooldownSet = new Set([
    ...(lossExits ?? []).map((t: { symbol: string }) => t.symbol),
    ...(winExits  ?? []).map((t: { symbol: string }) => t.symbol),
    ...multiLossBlocked,
  ])

  if (multiLossBlocked.size > 0) {
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
      reason: `⛔ Multi-loss block: ${[...multiLossBlocked].join(', ')} — 2+ losses in 24h, blocked for 4h`,
      ts: now,
    })
  }
  let currentLongs = 0
  let currentShorts = 0
  for (const h of held) {
    const dir = (h as { direction?: string }).direction
    if (dir === 'SHORT') currentShorts++
    else currentLongs++
  }

  // ── Daily loss circuit breaker ───────────────────────────────────────────────
  // If realized P&L today already hit -DAILY_LOSS_LIMIT_PCT, stop all new entries.
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { data: todayTrades } = await supabase
    .from('paper_trades')
    .select('pnl')
    .eq('user_id', userId)
    .neq('pnl', null)
    .gte('created_at', todayStart.toISOString())
  const dailyRealizedPnl = (todayTrades ?? []).reduce((sum, t: { pnl: number | null }) => sum + (t.pnl ?? 0), 0)
  const dailyLossLimit   = SEED_CAPITAL * DAILY_LOSS_LIMIT_PCT
  const circuitBreakerOn = dailyRealizedPnl <= -dailyLossLimit

  if (circuitBreakerOn) {
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
      reason: `⛔ Daily loss limit hit ($${dailyRealizedPnl.toFixed(2)} today). No new entries until tomorrow.`,
      ts: now,
    })
  }

  // ── Time-of-day filter: only open in high-volatility windows ────────────────
  const utcHour = new Date(now).getUTCHours()
  const utcMin  = new Date(now).getUTCMinutes()
  const utcDecimal = utcHour + utcMin / 60

  function inHotWindow(windows: [number, number][]): boolean {
    return windows.some(([start, end]) => utcDecimal >= start && utcDecimal < end)
  }
  const cryptoHot = inHotWindow(CRYPTO_HOT_WINDOWS_UTC)
  const stockHot  = inHotWindow(STOCK_HOT_WINDOWS_UTC)

  const filterByPhase = (s: Signal) => {
    const t = s.asset.assetType
    if (t === 'stock' && !phaseInfo.stocksActive) return false
    if (t === 'forex' && !phaseInfo.forexActive) return false
    if (t === 'crypto' && !phaseInfo.cryptoActive) return false
    // Only enter during high-volatility windows (exit logic ignores this)
    if (t === 'crypto' && !cryptoHot) return false
    if (t === 'stock'  && !stockHot)  return false
    return true
  }

  // ── MARKET REGIME GATE ───────────────────────────────────────────────────────
  // Crypto is highly correlated with BTC. When BTC is weak, almost every long
  // entry fights the market and stale-cuts at a loss. Use BTC's technical state
  // as a regime filter for all crypto longs.
  //
  // BULL: BTC EMA9 > EMA21 + RSI ≥ 48 + near/above VWAP → take all setups
  // NEUTRAL: BTC mixed → only score ≥ 5.5 setups (MOMENTUM_LONG quality)
  // BEAR: BTC EMA9 < EMA21 or weak RSI + negative 24h → block all crypto longs
  const btcSignal = allSignals.find((s) => s.asset.symbol === 'BTC')
  let marketRegime: 'BULL' | 'BEAR' | 'NEUTRAL' = 'NEUTRAL'
  let regimeNote = 'BTC data unavailable — treating as neutral'
  if (btcSignal?.indicators) {
    const { ema9, ema21, rsi, vwapDevPct } = btcSignal.indicators
    const btcChange24h = btcSignal.asset.change24h
    if (ema9 > ema21 * 1.001 && rsi >= 48 && vwapDevPct > -0.3 && btcChange24h > -1.0) {
      marketRegime = 'BULL'
      regimeNote = `BTC bullish: RSI ${rsi.toFixed(0)}, EMA9>21, VWAP ${vwapDevPct.toFixed(2)}%, 24h ${btcChange24h >= 0 ? '+' : ''}${btcChange24h.toFixed(1)}%`
    } else if ((ema9 < ema21 * 0.999 && rsi < 50) || (rsi < 42) || btcChange24h < -2.5) {
      marketRegime = 'BEAR'
      regimeNote = `BTC bearish: RSI ${rsi.toFixed(0)}, EMA9${ema9 < ema21 ? '<' : '>'}21, 24h ${btcChange24h >= 0 ? '+' : ''}${btcChange24h.toFixed(1)}%`
    } else {
      regimeNote = `BTC neutral: RSI ${rsi.toFixed(0)}, 24h ${btcChange24h >= 0 ? '+' : ''}${btcChange24h.toFixed(1)}%`
    }
  }

  events.push({
    type: 'HOLD', symbol: 'BTC', name: 'Market', price: 0, direction: 'LONG',
    reason: `📊 ${marketRegime === 'BULL' ? '🟢' : marketRegime === 'BEAR' ? '🔴' : '🟡'} ${marketRegime} — ${regimeNote}`,
    ts: now,
  })

  let longSignals = filterLongEntries(allSignals)
    .filter((s) => !heldSet.has(s.asset.symbol))
    .filter((s) => !cooldownSet.has(s.asset.symbol))
    .filter(filterByPhase)

  // Apply regime gate to CRYPTO longs only — bear allows high-quality dips, not a full freeze
  const beforeRegimeCount = longSignals.filter((s) => s.asset.assetType === 'crypto').length
  if (marketRegime === 'BEAR') {
    longSignals = longSignals.filter((s) =>
      s.asset.assetType !== 'crypto'
      || (s.score >= BEAR_CRYPTO_MIN_SCORE && (CORE_LONG_SETUPS as readonly string[]).includes(s.setupTag)),
    )
    const filtered = beforeRegimeCount - longSignals.filter((s) => s.asset.assetType === 'crypto').length
    if (filtered > 0) {
      events.push({
        type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
        reason: `🔴 Bear regime — only core dips (score ≥ ${BEAR_CRYPTO_MIN_SCORE}, ${CORE_LONG_SETUPS.join('/')}); filtered ${filtered}`,
        ts: now,
      })
    }
  } else if (marketRegime === 'NEUTRAL') {
    longSignals = longSignals.filter((s) => s.asset.assetType !== 'crypto' || s.score >= NEUTRAL_CRYPTO_MIN_SCORE)
    const filtered = beforeRegimeCount - longSignals.filter((s) => s.asset.assetType === 'crypto').length
    if (filtered > 0) {
      events.push({
        type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
        reason: `🟡 Neutral regime — blocked ${filtered} sub-conviction crypto (need score ≥ ${NEUTRAL_CRYPTO_MIN_SCORE})`,
        ts: now,
      })
    }
  }

  let shortSignals = filterShortEntries(allSignals)
    .filter((s) => !heldSet.has(s.asset.symbol))
    .filter((s) => !cooldownSet.has(s.asset.symbol))
    .filter(filterByPhase)

  // Shorts: gate by regime. In BULL or NEUTRAL, "pump shorts" usually keep
  // pumping — that's the NEAR loop that just destroyed us. Only short when
  // the overall market regime confirms the downward bias.
  const beforeShortCount = shortSignals.filter((s) => s.asset.assetType === 'crypto').length
  if (marketRegime !== 'BEAR') {
    shortSignals = shortSignals.filter((s) => s.asset.assetType !== 'crypto')
    if (beforeShortCount > 0) {
      events.push({
        type: 'HOLD', symbol: '', name: '', price: 0, direction: 'SHORT',
        reason: `${marketRegime === 'BULL' ? '🟢' : '🟡'} ${marketRegime} regime — blocked ${beforeShortCount} crypto short signals (only short in BEAR)`,
        ts: now,
      })
    }
  }

  // ── Tiered drawdown response ────────────────────────────────────────────────
  // Old design: hard stop at -5% from seed. Problem: once equity dropped below
  // that, NO new trades could fire, and small/sleepy positions wouldn't move
  // equity back above the line — perfect deadlock for days at a time.
  //
  // New design: graduate the response by drawdown depth so we can carefully
  // trade out of a hole instead of being frozen:
  //
  //   NORMAL   (0% to -3%)    → trade as usual
  //   CAUTIOUS (-3% to -5%)   → smaller positions (50%), higher score bar (>= 5.0),
  //                              no new shorts, MOMENTUM/OVERSOLD only
  //   RECOVERY (-5% to -8%)   → tiny positions (33%), best-of-best signals only
  //                              (score >= 5.5), no shorts, MOMENTUM/OVERSOLD only
  //   HARD STOP (worse than -8%) → block everything (real emergency)
  const currentEquityForDrawdown = computePortfolioEquity(cash, positions, priceMap)
  const drawdownPct = (currentEquityForDrawdown - SEED_CAPITAL) / SEED_CAPITAL
  type DDMode = 'normal' | 'cautious' | 'recovery' | 'hard_stop'
  const ddMode: DDMode =
    drawdownPct <= DRAWDOWN_HARD_STOP_PCT ? 'hard_stop' :
    drawdownPct <= DRAWDOWN_RECOVERY_PCT ? 'recovery' :
    drawdownPct <= -0.03 ? 'cautious' : 'normal'

  const minTradeUsd = ddMode === 'normal' ? MIN_TRADE_USD : MIN_TRADE_USD_RECOVERY

  let drawdownPositionMultiplier = 1.0
  if (ddMode === 'hard_stop') {
    // Deep drawdown: still trade small size on best setups (avoid multi-day deadlock)
    drawdownPositionMultiplier = 0.25
    const before = longSignals.length + shortSignals.length
    longSignals = longSignals
      .filter((s) => s.score >= 5.5)
      .filter((s) => (CORE_LONG_SETUPS as readonly string[]).includes(s.setupTag))
    shortSignals = []
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
      reason: `⛔ Deep drawdown (${(drawdownPct * 100).toFixed(1)}%) — micro size only, core setups (score ≥ 5.5). ${before} → ${longSignals.length} signals.`,
      ts: now,
    })
  } else if (ddMode === 'recovery') {
    drawdownPositionMultiplier = 0.5
    const before = longSignals.length + shortSignals.length
    longSignals = longSignals
      .filter((s) => s.score >= 4.5)
      .filter((s) => (CORE_LONG_SETUPS as readonly string[]).includes(s.setupTag))
    shortSignals = []
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
      reason: `🔁 Recovery (${(drawdownPct * 100).toFixed(1)}%): core setups score ≥ 4.5, 50% size. ${before} → ${longSignals.length} long candidates.`,
      ts: now,
    })
  } else if (ddMode === 'cautious') {
    drawdownPositionMultiplier = 0.5
    const before = longSignals.length + shortSignals.length
    longSignals = longSignals
      .filter((s) => s.score >= 5.0)
      .filter((s) => ['MOMENTUM_LONG', 'OVERSOLD_BOUNCE', 'VWAP_LONG'].includes(s.setupTag))
    shortSignals = []
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
      reason: `⚠️ Cautious mode: equity ${(drawdownPct * 100).toFixed(2)}% from seed. Higher bar (score ≥ 5.0), 50% position size, no shorts. Filtered ${before} → ${longSignals.length} signals.`,
      ts: now,
    })
  }

  // ── Helper: check if this setup tag is disabled by user ──────────────────
  const { data: strategyConfigs } = await supabase
    .from('strategy_config')
    .select('setup_tag, enabled')
    .eq('user_id', userId)
  const userDisabledTags = new Set(
    (strategyConfigs ?? [])
      .filter((c: { enabled: boolean }) => !c.enabled)
      .map((c: { setup_tag: string }) => c.setup_tag)
  )

  // ── AUTO-LEARNING: compute per-setup performance from YOUR trade history ──
  // For every setup tag, look at the last 30 closed trades and compute win
  // rate + average P&L. Use this to:
  //   1. AUTO-DISABLE setups that win <30% over 10+ trades (clearly broken FOR YOU)
  //   2. Scale position sizes: winning setups get up to 1.5×, losing ones cut to 0.6×
  // Setup gets full 1.0× until it has at least 5 closed trades (need a sample size).
  const { data: setupHistory } = await supabase
    .from('trade_setups')
    .select('setup_tag, won, outcome_pnl, closed_at')
    .eq('user_id', userId)
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(300)  // cap to last 300 closed trades total — plenty for stats

  const perSetup = new Map<string, { wins: number; losses: number; pnl: number; count: number }>()
  for (const t of setupHistory ?? []) {
    const tag = t.setup_tag as string
    const cur = perSetup.get(tag) ?? { wins: 0, losses: 0, pnl: 0, count: 0 }
    // Limit each setup's sample to last 30 trades — newer data weighs more
    if (cur.count >= 30) continue
    cur.count++
    cur.pnl += Number(t.outcome_pnl ?? 0)
    if (t.won) cur.wins++; else cur.losses++
    perSetup.set(tag, cur)
  }

  // Build auto-disabled set + per-setup position multiplier map
  const autoDisabledTags = new Set<string>()
  const setupMultiplier = new Map<string, number>()
  for (const [tag, s] of perSetup.entries()) {
    if (s.count < 5) {
      setupMultiplier.set(tag, 1.0)  // need a sample size — don't penalize yet
      continue
    }
    const winRate = s.wins / s.count
    if (s.count >= 15 && winRate < 0.25) {
      autoDisabledTags.add(tag)
      setupMultiplier.set(tag, 0)
      continue
    }
    // Linear scale: 30% win rate → 0.6×, 50% → 1.0×, 70%+ → 1.5×
    // Capped to [0.6, 1.5] so no setup goes wild on a hot streak
    const raw = 0.6 + (winRate - 0.30) / 0.40 * 0.9  // 30%→0.6, 70%→1.5
    setupMultiplier.set(tag, Math.max(0.6, Math.min(1.5, raw)))
  }

  // ── Reconciliation: don't let auto-learning collide with drawdown mode ──
  // If we're in CAUTIOUS or RECOVERY mode, the system only allows specific
  // setup types. If auto-learning has ALSO disabled those, NOTHING can fire
  // and we deadlock. Recovery overrides auto-learning for the setups it
  // needs — the alternative is doing nothing for days. Risk is bounded by
  // the 33% position size in recovery and the higher score bar.
  // Never auto-disable core long setups — learning can't zero out all crypto entries
  for (const tag of CORE_LONG_SETUPS) {
    autoDisabledTags.delete(tag)
  }

  if (autoDisabledTags.size > 0) {
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
      reason: `🧠 Auto-learning: disabled ${[...autoDisabledTags].join(', ')} (win rate <30% over 10+ trades)`,
      ts: now,
    })
  }

  // Merged disabled set: user toggle OR auto-learning verdict
  const disabledTags = new Set([...userDisabledTags, ...autoDisabledTags])

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

  const maxSlots = limits.maxLongs + limits.maxShorts
  let openSlots = currentLongs + currentShorts

  const longSlotsFree = Math.max(0, limits.maxLongs - currentLongs)
  const shortSlotsFree = Math.max(0, limits.maxShorts - currentShorts)

  const longsToOpen = circuitBreakerOn
    ? []
    : longSignals.slice(0, longSlotsFree)

  const shortsToOpen = circuitBreakerOn
    ? []
    : shortSignals.slice(0, shortSlotsFree)

  const topLong = longSignals[0]
    ? { symbol: longSignals[0].asset.symbol, score: longSignals[0].score, setup: longSignals[0].setupTag }
    : null

  const diagnostics: TradingDiagnostics = {
    ddMode,
    drawdownPct,
    marketRegime,
    openLongs: currentLongs,
    openShorts: currentShorts,
    longSlotsFree,
    longCandidates: longSignals.length,
    shortCandidates: shortSignals.length,
    circuitBreaker: circuitBreakerOn,
    topLong,
  }

  if (!circuitBreakerOn && longSlotsFree > 0 && longSignals.length === 0) {
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
      reason: `📋 No entry candidates after filters (${marketRegime} BTC, ${ddMode} mode) — waiting for setup`,
      ts: now,
    })
  } else if (!circuitBreakerOn && longSlotsFree === 0 && longSignals.length > 0) {
    events.push({
      type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
      reason: `📋 ${longSignals.length} signal(s) ready but all ${limits.maxLongs} long slots full — exits free a slot`,
      ts: now,
    })
  }

  const entrySymbols = [
    ...longsToOpen.map((s) => s.asset.symbol),
    ...shortsToOpen.map((s) => s.asset.symbol),
  ]
  const apexBySymbol = await loadValidApexDecisions(supabase, userId, entrySymbols, priceMap)

  for (const sig of longsToOpen) {
    if (!sig.indicators && sig.asset.assetType === 'crypto') continue

    // Check if this setup is disabled by the user
    if (disabledTags.has(sig.setupTag)) continue

    // Use LONG slots only — shorts rarely fire so dividing equity by total slots
    // (longs+shorts) under-sizes longs. Long-side capital is what matters here.
    const longSlotsRemaining = Math.max(1, limits.maxLongs - currentLongs)
    const equity = computePortfolioEquity(cash, positions, priceMap)
    let budget = computeEntryBudget(cash, equity, longSlotsRemaining, sig.setupTag)
    // Apply drawdown-mode position scaling (0.33× in recovery, 0.5× in cautious)
    if (drawdownPositionMultiplier < 1.0) {
      budget = parseFloat((budget * drawdownPositionMultiplier).toFixed(2))
    }
    // Apply per-setup auto-learning multiplier (winners 1.5×, losers 0.6×)
    const setupMult = setupMultiplier.get(sig.setupTag) ?? 1.0
    if (setupMult !== 1.0) {
      budget = parseFloat((budget * setupMult).toFixed(2))
    }

    const price = sig.asset.price
    const apexVeto = evaluateApexVeto(apexBySymbol.get(sig.asset.symbol) ?? null, 'LONG')

    if (!apexVeto.proceed) {
      await logEngineApexVeto(supabase, {
        userId,
        symbol: sig.asset.symbol,
        assetType: sig.asset.assetType,
        direction: 'LONG',
        engineScore: sig.score,
        engineSetup: sig.setupTag,
        entryPrice: price,
        veto: apexVeto,
        wouldHaveBudgetUsd: budget,
        executed: false,
      })
      events.push({
        type: 'HOLD', symbol: sig.asset.symbol, name: sig.asset.name,
        price, direction: 'LONG',
        reason: `🛡️ Apex veto: ${apexVeto.reason}`,
        ts: now,
      })
      continue
    }

    if (apexVeto.positionMultiplier !== 1) {
      budget = parseFloat((budget * apexVeto.positionMultiplier).toFixed(2))
    }
    if (budget < minTradeUsd) continue
    const shares = parseFloat((budget / price).toFixed(8))
    const total = parseFloat((price * shares).toFixed(2))
    if (total > cash || total < minTradeUsd) continue

    const indStr = sig.indicators
      ? ` RSI:${sig.indicators.rsi.toFixed(0)} VWAP:${sig.indicators.vwapDevPct.toFixed(2)}% vol:${sig.indicators.volSpike.toFixed(1)}×`
      : ''
    const apexNote = apexVeto.vetoType !== 'no_apex_cache'
      ? ` · ${apexVeto.reason}`
      : ''
    const reason = `LONG [${sig.setupTag}] — ${sig.reason}${indStr} (score ${sig.score.toFixed(1)})${apexNote}`

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

    if (apexVeto.vetoType !== 'no_apex_cache') {
      await logEngineApexVeto(supabase, {
        userId,
        symbol: sig.asset.symbol,
        assetType: sig.asset.assetType,
        direction: 'LONG',
        engineScore: sig.score,
        engineSetup: sig.setupTag,
        entryPrice: price,
        veto: apexVeto,
        wouldHaveBudgetUsd: total,
        executed: true,
      })
    }

    const { sl: longSlPct, tp: longTpPct } = getTpSl(sig.setupTag, 'LONG', sig.asset.assetType as 'crypto' | 'stock' | 'forex')
    const posPayload = {
      user_id: userId,
      symbol: sig.asset.symbol, name: sig.asset.name,
      shares, avg_buy_price: price, direction: 'LONG',
      asset_type: sig.asset.assetType,
      stop_loss_price:   parseFloat((price * (1 - longSlPct)).toFixed(8)),
      take_profit_price: parseFloat((price * (1 + longTpPct)).toFixed(8)),
    }
    const { error: pe1 } = await supabase.from('paper_positions').insert(posPayload)
    if (pe1) {
      const { direction: _d, stop_loss_price: _sl, take_profit_price: _tp, ...noDirPos } = posPayload
      await supabase.from('paper_positions').insert(noDirPos)
    }

    // Log setup snapshot for learning
    await logSetup(sig, 'LONG')

    cash = parseFloat((cash - total).toFixed(2))
    heldSet.add(sig.asset.symbol)
    currentLongs++
    openSlots++
    tradesExecuted++
    events.push({
      type: 'LONG_BUY', symbol: sig.asset.symbol, name: sig.asset.name,
      price, direction: 'LONG', shares, total,
      reason: `${reason} · $${total.toFixed(0)} (${((total / equity) * 100).toFixed(0)}% of portfolio)`,
      urgency: sig.urgency, ts: now,
    })
  }

  for (const sig of shortsToOpen) {
    if (!sig.indicators && sig.asset.assetType === 'crypto') continue
    if (sig.score > MIN_SHORT_SCORE) continue

    if (disabledTags.has(sig.setupTag)) continue

    const slotsRemaining = maxSlots - openSlots
    const equity = computePortfolioEquity(cash, positions, priceMap)
    let budget = computeEntryBudget(cash, equity, slotsRemaining, sig.setupTag)
    const price = sig.asset.price

    const apexVeto = evaluateApexVeto(apexBySymbol.get(sig.asset.symbol) ?? null, 'SHORT')

    if (!apexVeto.proceed) {
      await logEngineApexVeto(supabase, {
        userId,
        symbol: sig.asset.symbol,
        assetType: sig.asset.assetType,
        direction: 'SHORT',
        engineScore: sig.score,
        engineSetup: sig.setupTag,
        entryPrice: price,
        veto: apexVeto,
        wouldHaveBudgetUsd: budget,
        executed: false,
      })
      events.push({
        type: 'HOLD', symbol: sig.asset.symbol, name: sig.asset.name,
        price, direction: 'SHORT',
        reason: `🛡️ Apex veto: ${apexVeto.reason}`,
        ts: now,
      })
      continue
    }

    if (apexVeto.positionMultiplier !== 1) {
      budget = parseFloat((budget * apexVeto.positionMultiplier).toFixed(2))
    }
    if (budget < minTradeUsd) continue

    const shares = parseFloat((budget / price).toFixed(8))
    const total = parseFloat((price * shares).toFixed(2))
    if (total > cash || total < minTradeUsd) continue

    const indStr = sig.indicators
      ? ` RSI:${sig.indicators.rsi.toFixed(0)} VWAP:${sig.indicators.vwapDevPct.toFixed(2)}%`
      : ''
    const apexNote = apexVeto.vetoType !== 'no_apex_cache'
      ? ` · ${apexVeto.reason}`
      : ''
    const reason = `SHORT [${sig.setupTag}] — ${sig.reason}${indStr} (score ${sig.score.toFixed(1)})${apexNote}`

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

    if (apexVeto.vetoType !== 'no_apex_cache') {
      await logEngineApexVeto(supabase, {
        userId,
        symbol: sig.asset.symbol,
        assetType: sig.asset.assetType,
        direction: 'SHORT',
        engineScore: sig.score,
        engineSetup: sig.setupTag,
        entryPrice: price,
        veto: apexVeto,
        wouldHaveBudgetUsd: total,
        executed: true,
      })
    }

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
    openSlots++
    tradesExecuted++
    events.push({
      type: 'SHORT_OPEN', symbol: sig.asset.symbol, name: sig.asset.name,
      price, direction: 'SHORT', shares, total,
      reason: `${reason} · $${total.toFixed(0)} (${((total / equity) * 100).toFixed(0)}% of portfolio)`,
      urgency: sig.urgency, ts: now,
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
    diagnostics,
  }
}
