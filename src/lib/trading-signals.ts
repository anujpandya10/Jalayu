/**
 * Trading signal generation — two-stage pipeline.
 *
 * STAGE 1 — Fast filter (24h % change, no API call)
 *   Eliminates obviously neutral assets quickly.
 *
 * STAGE 2 — Indicator scoring (RSI + VWAP + ATR + volume spike on 1m candles)
 *   Only runs for assets that passed Stage 1.
 *   Returns a richer signal with a setup_tag for the learning database.
 *
 * Setup tags (what gets logged to trade_setups):
 *   MOMENTUM_LONG     — 24h +5–12%, vol spike ≥ 2×, RSI 48–72, EMA9 > EMA21 (trend following)
 *   OVERSOLD_BOUNCE   — RSI < 32, price near VWAP floor, dip > −5% (mean reversion)
 *   VWAP_LONG         — price below VWAP, RSI 35–55, any vol regime
 *   PUMP_SHORT        — 24h > 12%, RSI ≥ 70, vol spike ≥ 2×
 *   SUPERNOVA_SHORT   — 24h > 25%, vol spike ≥ 5×, RSI ≥ 80
 *   VWAP_SHORT        — price extended above VWAP, RSI 65–80
 *   FOREX_DIP         — forex 24h < −0.3%, RSI < 45
 *   FOREX_FADE        — forex 24h > 0.3%, RSI > 55
 *   MEAN_REVERT       — oscillating around VWAP with no clear trend
 */

import type { AssetData } from './market-data'
import type { IndicatorBundle } from './indicators'
import { computeIndicators } from './indicators'
import { fetchCandles } from './candle-data'
import { analyzePriceAction, type PriceActionRead } from './price-action'
import { MIN_LONG_SCORE, MIN_SHORT_SCORE, getMinLongScore, ENRICH_TOP_N } from './trading-config'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Signal {
  asset     : AssetData
  score     : number          // −10 … +10
  direction : 'LONG' | 'SHORT'
  action    : 'BUY_LONG' | 'SELL_SHORT' | 'HOLD'
  reason    : string
  urgency   : 'high' | 'medium' | 'low'
  setupTag  : string          // for trade_setups logging
  indicators: IndicatorBundle | null   // null if candles unavailable
  priceAction: PriceActionRead | null  // raw-candle read (engulfing/pins/structure/S-R); null if no candles
}

// ── Stage 1: fast 24h-change pre-filter ───────────────────────────────────────

function stage1Score(asset: AssetData): number {
  const { change24h, assetType } = asset

  if (assetType === 'forex') {
    if (change24h < -0.8) return  4.5   // strong daily dip → buy
    if (change24h < -0.5) return  3.5
    if (change24h < -0.2) return  2.0
    if (change24h < -0.1) return  1.2
    if (change24h >  0.8) return -4.5   // strong daily pump → short
    if (change24h >  0.5) return -3.5
    if (change24h >  0.2) return -2.0
    return 0
  }

  // ── CRYPTO / STOCKS ─────────────────────────────────────────────────────────
  // SHORT signals: only the real pumps — extreme overextension
  if (change24h > 30)  return -9   // extreme pump → hard short
  if (change24h > 22)  return -7
  if (change24h > 15)  return -5.5

  // LONG signals: momentum breakout (ride the trend) + extreme dip (reversal)
  // Key insight: assets up 5–12% in 24h with volume confirmation often KEEP going.
  // Stage 2 must confirm with volume spike + RSI + EMA — this just gets them in the pool.
  if (change24h >= 8 && change24h <= 20) return  4.0  // strong momentum — always enrich
  if (change24h >= 5 && change24h <  8)  return  3.5  // building momentum
  if (change24h >= 3 && change24h <  5)  return  3.0  // early momentum — Stage 2 confirms
  if (change24h >= 2 && change24h <  3)  return  2.0

  // Deep dip reversal signals — market overreacted
  if (change24h < -18) return  7.5  // extreme crash — aggressive oversold bounce
  if (change24h < -10) return  5.5  // strong dip — likely reversal with confirmation
  if (change24h <  -6) return  3.5  // moderate dip — needs Stage 2 confirmation
  // Ignore small dips (−2% to −6%) without any indicator confirmation
  return 0
}

// ── Stage 2: indicator-enriched scoring (call after candles are available) ────

function stage2Score(
  asset      : AssetData,
  ind        : IndicatorBundle,
  s1Score    : number,
): { score: number; reasons: string[]; setupTag: string } {
  const { change24h, assetType, isPumpCandidate } = asset
  const { rsi, vwapDevPct, volSpike, atrPct, ema9, ema21, ema50, regime, bb, macd, currentPrice } = ind

  let score   = s1Score
  const reasons: string[] = []
  let setupTag = 'UNTAGGED'

  // ── FOREX branch (tighter moves, different dynamics) ─────────────────────
  if (assetType === 'forex') {
    if (rsi < 40 && vwapDevPct < -0.1) {
      score   += 1.5
      reasons.push(`RSI ${rsi.toFixed(0)} oversold, ${vwapDevPct.toFixed(2)}% below VWAP`)
      setupTag = 'FOREX_DIP'
    } else if (rsi > 60 && vwapDevPct > 0.1) {
      score   -= 1.5
      reasons.push(`RSI ${rsi.toFixed(0)} overbought, ${vwapDevPct.toFixed(2)}% above VWAP`)
      setupTag = 'FOREX_FADE'
    }
    return { score: Math.max(-5, Math.min(5, score)), reasons, setupTag }
  }

  // ── LONG setups ──────────────────────────────────────────────────────────
  //
  // Design principle: each setup has a GUARANTEED minimum score so it always
  // clears the per-setup threshold even when the 24h trend is flat/neutral.
  // Stage-1 score is additive so strong trending assets score even higher.

  // MOMENTUM LONG — asset trending up with volume. Enter the move.
  // Crypto: 1.5% 24h catches active sessions when alts lead while BTC 1m lags.
  const mom24hMin = assetType === 'crypto' ? 1.5 : 2.0
  const momVolMin = assetType === 'crypto' ? 1.3 : 1.5
  if (change24h >= mom24hMin && volSpike >= momVolMin && rsi >= 42 && rsi <= 75 && ema9 > ema21) {
    score = Math.max(score, 3.0) + 2.5   // floor → guaranteed 5.5+
    reasons.push(`Momentum: +${change24h.toFixed(1)}% 24h, ${volSpike.toFixed(1)}× vol, RSI ${rsi.toFixed(0)}`)
    setupTag = 'MOMENTUM_LONG'
  }
  // OVERSOLD BOUNCE — extreme dip with reversal signals.
  else if (rsi < 35 && vwapDevPct < -1.0 && change24h < -5) {
    score = Math.max(score, 3.0) + 2.5
    reasons.push(`Oversold bounce: RSI ${rsi.toFixed(0)}, ${vwapDevPct.toFixed(2)}% below VWAP`)
    setupTag = 'OVERSOLD_BOUNCE'
  }
  // VWAP LONG — two modes, both require asset NOT in a crash:
  //   A) Dip-buy: below VWAP, price above EMA50 (uptrend), minimum volume
  //   B) Support-buy: at VWAP in uptrend, RSI 42-60, clear EMA alignment
  // Volume spike > 6× = panic dump; < 0.7 = dead market with no buyers — block both.
  // EMA50 check for Mode A: ensures we're buying a dip in an uptrend, not a falling knife.
  else if (
    rsi >= 38 && rsi <= 65 && ema9 >= ema21 * 0.997 &&
    volSpike >= 0.7 && volSpike < 6 && change24h > -3 &&
    (
      (vwapDevPct < -0.1 && currentPrice > ema50) ||                              // Mode A: dip in uptrend
      (vwapDevPct < 0.15 && rsi >= 42 && rsi <= 60 && ema9 > ema21 * 1.001)     // Mode B: VWAP support
    )
  ) {
    score = Math.max(score, 2.5) + 1.5   // floor → guaranteed 4.0 score
    reasons.push(`VWAP ${vwapDevPct < 0 ? 'dip' : 'support'}: RSI ${rsi.toFixed(0)}, ${vwapDevPct.toFixed(2)}% vs VWAP, vol ${volSpike.toFixed(1)}×`)
    setupTag = 'VWAP_LONG'
  }
  // MACD CROSS LONG — MACD histogram turns positive: fast money rotating in.
  // Widely used by institutional desks as momentum inflection signal.
  // Requires: MACD line above zero + histogram growing + EMA9 > EMA21 + RSI not overbought.
  else if (
    macd.bullish && macd.macd > 0 &&
    rsi >= 40 && rsi <= 70 && ema9 > ema21 * 0.999 &&
    change24h > -8 && volSpike > 0.5 && setupTag === 'UNTAGGED'
  ) {
    score = Math.max(score, 3.5) + 2.0   // floor → guaranteed 5.5+
    reasons.push(`MACD cross bullish: MACD ${macd.macd.toFixed(5)}, hist +${macd.histogram.toFixed(5)}, RSI ${rsi.toFixed(0)}`)
    setupTag = 'MACD_CROSS_LONG'
  }
  // BB LOWER BOUNCE — price at/near lower Bollinger Band with reversal signs.
  // John Bollinger's own strategy: lower band is dynamic support; mean reversion with edge.
  // Requires: within 0.8% of lower band + oversold RSI + not in free-fall.
  else if (
    bb.lower > 0 && currentPrice <= bb.lower * 1.008 &&
    rsi < 38 && rsi > 15 &&                     // oversold but not crashed
    change24h > -20 &&                           // not in free-fall
    volSpike >= 0.5 &&                           // some buying volume
    ema9 >= ema21 * 0.985 &&                    // not in strong confirmed downtrend
    setupTag === 'UNTAGGED'
  ) {
    score = Math.max(score, 4.0) + 2.0   // floor → guaranteed 6.0+
    reasons.push(`BB lower bounce: price ${((currentPrice / bb.lower - 1) * 100).toFixed(2)}% from band, width ${bb.width.toFixed(1)}%, RSI ${rsi.toFixed(0)}`)
    setupTag = 'BB_LOWER_BOUNCE'
  }
  // MEAN_REVERT removed — every backtest showed it was a knife-catcher and
  // contributed most of the historical losses. A "mild dip in uptrend" is just
  // VWAP_LONG with a worse name. If a setup doesn't qualify as MOMENTUM_LONG,
  // OVERSOLD_BOUNCE, or VWAP_LONG, we shouldn't be in it.

  // Kill knife-catchers: deep dip with no volume = no buyer conviction
  if (setupTag === 'MEAN_REVERT' && change24h < -8 && volSpike < 1.5) {
    score = Math.min(score, 2.5)
    reasons.push('Deep dip without volume — knife catch risk')
  }

  // Kill overbought longs: RSI > 78 + no volume spike = already faded
  if (score > 0 && rsi > 78 && volSpike < 2.0 && setupTag !== 'MOMENTUM_LONG') {
    score -= 2.5
    reasons.push(`RSI ${rsi.toFixed(0)} overbought with no vol — fading long`)
  }

  // ── SHORT setups ─────────────────────────────────────────────────────────

  // SUPERNOVA SHORT — extreme pump + high volume
  if (change24h > 25 && volSpike >= 5 && rsi >= 80) {
    score   -= 2.0
    reasons.push(`Supernova: +${change24h.toFixed(0)}%, ${volSpike.toFixed(1)}× vol, RSI ${rsi.toFixed(0)}`)
    setupTag = 'SUPERNOVA_SHORT'
  }
  // PUMP SHORT — fade an extended pump only when it's STARTING TO TURN.
  // Critical: require ema9 < ema21 — short-term momentum has rolled over.
  // Without this, we keep shorting pumps that have hours of upside left.
  // The NEAR death loop happened here: rsi 70+ but ema9 still > ema21 = still pumping.
  else if (change24h > 15 && rsi >= 72 && volSpike >= 2 && score < 0 && ema9 < ema21) {
    score   -= 1.5
    reasons.push(`Pump fade: RSI ${rsi.toFixed(0)}, ${vwapDevPct.toFixed(2)}% above VWAP, EMA9<21 (turning)`)
    setupTag = 'PUMP_SHORT'
  }
  // VWAP SHORT — extended above fair value AND momentum turning down.
  // Requires ema9 < ema21 for the same reason as PUMP_SHORT.
  else if (vwapDevPct > 1.5 && rsi >= 68 && rsi <= 80 && regime !== 'HIGH_VOL' && ema9 < ema21) {
    score   -= 1.5
    reasons.push(`VWAP short: ${vwapDevPct.toFixed(2)}% above VWAP, RSI ${rsi.toFixed(0)}, EMA9<21`)
    if (setupTag === 'UNTAGGED') setupTag = 'VWAP_SHORT'
  }
  // Kill weak shorts if RSI deeply oversold — risk of violent bounce
  else if (score < 0 && rsi < 25) {
    score += 2
    reasons.push(`RSI ${rsi.toFixed(0)} extreme oversold — short risk elevated`)
  }

  // ── Pump candidate penalty ───────────────────────────────────────────────
  if (isPumpCandidate && score < 0) {
    score  -= 1.0
    reasons.push('Confirmed pump candidate')
  }

  // ── ATR regime adjustment ────────────────────────────────────────────────
  if (regime === 'HIGH_VOL' && score > 0) {
    // High volatility → Buffett warning — reduce long conviction
    score = Math.max(score - 1, 0)
    reasons.push(`High vol regime (ATR ${atrPct.toFixed(1)}%) — reducing long size`)
  }

  score = Math.max(-10, Math.min(10, score))

  // No fallback for longs — if no specific named setup matched, we have no edge.
  // UNTAGGED stays UNTAGGED and gets blocked downstream. Better to skip than guess.
  if (setupTag === 'UNTAGGED' && score < 0 && Math.abs(score) >= Math.abs(MIN_SHORT_SCORE)) {
    setupTag = 'PUMP_SHORT'  // Keep short fallback — pump fades have real edge
  }

  return { score, reasons, setupTag }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score one asset using only 24h data (fast — no API call).
 * Used as a pre-filter before the full indicator pass.
 */
export function quickScore(asset: AssetData): number {
  return stage1Score(asset)
}

/**
 * Full indicator-enriched scoring for one asset.
 * Fetches 1m candles from Binance/Yahoo — use for top candidates only.
 */
export async function scoreAssetFull(asset: AssetData): Promise<Signal> {
  const s1 = stage1Score(asset)

  const candles = await fetchCandles(asset.symbol, asset.assetType)
  let indicators: IndicatorBundle | null = null
  const priceAction = candles.length >= 6 ? analyzePriceAction(candles) : null
  let score  = s1
  let reasons: string[] = []
  let setupTag = 'UNTAGGED'

  if (candles.length >= 15) {
    indicators = computeIndicators(candles)
    const s2 = stage2Score(asset, indicators, s1)
    score    = s2.score
    reasons  = s2.reasons
    setupTag = s2.setupTag

    // No named setup after full indicator pass = no identifiable edge.
    // Force score to 0 so this asset never clears filterLongEntries/filterShortEntries.
    if (setupTag === 'UNTAGGED') {
      score = 0
      reasons = [...reasons, 'No setup tag after stage2 — skipping']
    }
  } else {
    // No candles — fall back to 24h-only logic
    reasons  = [`24h change ${asset.change24h.toFixed(2)}% (no candles)`]
    setupTag = s1 > 0 ? 'MEAN_REVERT' : s1 < 0 ? 'PUMP_SHORT' : 'UNTAGGED'

    // For crypto: require a very strong Stage-1 signal (≥5.0 = drop >8%) before
    // entering without candle confirmation — prevents buying falling knives blindly.
    // Forex/stocks use reliable daily candles from Frankfurter/Yahoo so they pass through.
    if (asset.assetType === 'crypto' && Math.abs(score) < 5.0) {
      score = 0   // force HOLD until candles confirm
      reasons = [`${asset.change24h.toFixed(2)}% 24h — awaiting candle confirmation`]
    }
  }

  const action: Signal['action'] =
    score >= MIN_LONG_SCORE  ? 'BUY_LONG'    :
    score <= MIN_SHORT_SCORE ? 'SELL_SHORT'  : 'HOLD'

  const urgency: Signal['urgency'] =
    Math.abs(score) >= 7 ? 'high'   :
    Math.abs(score) >= 4 ? 'medium' : 'low'

  return {
    asset,
    score,
    direction : score >= 0 ? 'LONG' : 'SHORT',
    action,
    reason    : reasons.join(' · ') || `${asset.change24h.toFixed(2)}% 24h`,
    urgency,
    setupTag,
    indicators,
    priceAction,
  }
}

/**
 * Synchronous fast scorer — returns Signal using 24h data only.
 * Used by legacy callers and ranking functions that don't await candles.
 */
export function scoreAsset(asset: AssetData): Signal {
  const score = stage1Score(asset)
  const action: Signal['action'] =
    score >= MIN_LONG_SCORE  ? 'BUY_LONG'    :
    score <= MIN_SHORT_SCORE ? 'SELL_SHORT'  : 'HOLD'

  const urgency: Signal['urgency'] =
    Math.abs(score) >= 7 ? 'high'   :
    Math.abs(score) >= 4 ? 'medium' : 'low'

  const tag = score > 3 ? 'MEAN_REVERT' : score < -3 ? 'PUMP_SHORT' : 'UNTAGGED'

  return {
    asset,
    score,
    direction : score >= 0 ? 'LONG' : 'SHORT',
    action,
    reason    : `${asset.change24h.toFixed(2)}% 24h`,
    urgency,
    setupTag  : tag,
    indicators: null,
    priceAction: null,
  }
}

/** Rank all assets by score descending (best longs first). Synchronous. */
export function rankSignals(assets: AssetData[]): Signal[] {
  return assets.map(scoreAsset).sort((a, b) => b.score - a.score)
}

/** Returns LONG signals sorted best first (highest score). Synchronous. */
export function rankLongs(assets: AssetData[]): Signal[] {
  return assets
    .map(scoreAsset)
    .filter((s) => s.action === 'BUY_LONG')
    .sort((a, b) => b.score - a.score)
}

/** Returns SHORT signals sorted best first (most negative score). Synchronous. */
export function rankShorts(assets: AssetData[]): Signal[] {
  return assets
    .map(scoreAsset)
    .filter((s) => s.action === 'SELL_SHORT')
    .sort((a, b) => a.score - b.score)
}

function isMomentumCandidate(asset: AssetData): boolean {
  return asset.assetType !== 'forex' && asset.change24h >= 3 && asset.change24h <= 22
}

function isPumpShortCandidate(asset: AssetData): boolean {
  return asset.assetType !== 'forex' && asset.change24h > 10
}

/**
 * Enrich top candidates with candles. Includes momentum/pump names that Stage-1-only ranking missed.
 */
export async function rankSignalsEnriched(
  assets: AssetData[],
  topN = ENRICH_TOP_N,
): Promise<Signal[]> {
  const scored = assets.map((asset) => ({ asset, s1: stage1Score(asset) }))

  const longPool = new Map<string, AssetData>()

  // 1. Strong stage-1 longs first (trending assets)
  for (const { asset, s1 } of scored.filter((x) => x.s1 > 0).sort((a, b) => b.s1 - a.s1)) {
    if (longPool.size >= topN) break
    longPool.set(asset.symbol, asset)
  }

  // 2. Also enrich momentum candidates (might have missed on 24h filter)
  for (const asset of assets) {
    if (longPool.size >= topN) break
    if (isMomentumCandidate(asset) && !longPool.has(asset.symbol)) {
      longPool.set(asset.symbol, asset)
    }
  }

  // 3. CRITICAL: fill remaining slots with ALL crypto/forex regardless of stage-1 score.
  //    VWAP_LONG requires 1m candles to compute VWAP — it CANNOT fire without enrichment.
  //    On quiet market days (most crypto flat, stage1=0) the pool above is empty
  //    and VWAP_LONG never fires. Always enrich crypto/forex up to topN so the
  //    intraday VWAP signal always has data to work with.
  for (const asset of assets) {
    if (longPool.size >= topN) break
    if ((asset.assetType === 'crypto' || asset.assetType === 'forex') && !longPool.has(asset.symbol)) {
      longPool.set(asset.symbol, asset)
    }
  }

  const shortPool = new Map<string, AssetData>()
  for (const { asset, s1 } of scored.filter((x) => x.s1 < 0).sort((a, b) => a.s1 - b.s1)) {
    if (shortPool.size >= topN) break
    shortPool.set(asset.symbol, asset)
  }
  for (const asset of assets) {
    if (shortPool.size >= topN + 2) break
    if (isPumpShortCandidate(asset) && !shortPool.has(asset.symbol)) {
      shortPool.set(asset.symbol, asset)
    }
  }

  // Deduplicate across pools — no need to fetch candles twice for the same symbol
  const seen = new Set<string>()
  const toEnrich: AssetData[] = []
  for (const asset of [...longPool.values(), ...shortPool.values()]) {
    if (!seen.has(asset.symbol)) { seen.add(asset.symbol); toEnrich.push(asset) }
  }

  const enriched = await Promise.allSettled(toEnrich.map((asset) => scoreAssetFull(asset)))

  const out: Signal[] = []
  for (const r of enriched) {
    if (r.status === 'fulfilled') out.push(r.value)
  }
  return out
}

/** Alt pumping on its own tape — don't block because BTC 1m structure lags */
export function isStrongAltMomentum(s: Signal): boolean {
  if (s.asset.assetType !== 'crypto' || !s.indicators) return false
  const { rsi, ema9, ema21, volSpike } = s.indicators
  const ch = s.asset.change24h
  return (
    ch >= 1.5
    && volSpike >= 1.2
    && ema9 > ema21
    && rsi >= 40
    && rsi <= 78
    && (s.setupTag === 'MOMENTUM_LONG' || s.score >= 4.5)
  )
}

/** Long entry candidates from enriched signals only (not Stage-1-only rankLongs). */
export function filterLongEntries(signals: Signal[]): Signal[] {
  return signals
    .filter((s) => s.score >= getMinLongScore(s.setupTag))
    .filter((s) => s.setupTag !== 'UNTAGGED')
    // Volume spike required for momentum/breakout setups — NOT for value-zone entries.
    // VWAP_LONG and MEAN_REVERT enter at fair value; volume spike irrelevant.
    .filter((s) => {
      if (!s.indicators) return true
      if (s.setupTag === 'VWAP_LONG' || s.setupTag === 'MEAN_REVERT') return true
      return s.indicators.volSpike > 0.3
    })
    .filter((s) => !(s.setupTag === 'MEAN_REVERT' && s.asset.change24h < -10))
    .filter((s) => !(s.indicators && s.indicators.rsi > 76 && s.setupTag !== 'MOMENTUM_LONG'))
    .sort((a, b) => b.score - a.score)
}

/** Short entry candidates from enriched signals only. */
export function filterShortEntries(signals: Signal[]): Signal[] {
  return signals
    .filter((s) => s.score <= MIN_SHORT_SCORE)
    .filter((s) => s.setupTag !== 'UNTAGGED')                  // no named setup = no trade
    .filter((s) => !s.indicators || s.indicators.volSpike > 0.3)
    .filter((s) => !(s.indicators && s.indicators.rsi < 28))
    .sort((a, b) => a.score - b.score)
}
