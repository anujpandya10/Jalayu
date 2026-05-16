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
  const { rsi, vwapDevPct, volSpike, atrPct, ema9, ema21, regime } = ind

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

  // MOMENTUM LONG — trend-following breakout (highest priority for positive 24h movers)
  // RSI ceiling 73 (not 74) to avoid entering already-overbought assets.
  // volSpike >= 2.0 — same as original; ATOM at 50.9× easily passes.
  // change24h >= 4.5 — slightly tighter than 4.0 but still catches ATOM-quality moves.
  if (change24h >= 4.5 && volSpike >= 2.0 && rsi >= 50 && rsi <= 73 && ema9 > ema21) {
    score   += 2.5
    reasons.push(`Momentum breakout: +${change24h.toFixed(1)}% 24h, ${volSpike.toFixed(1)}× vol, RSI ${rsi.toFixed(0)}, EMA9>21`)
    setupTag = 'MOMENTUM_LONG'
  }
  // OVERSOLD BOUNCE — deep dip with reversal signals (tightened: RSI<32)
  else if (rsi < 32 && vwapDevPct < -1.5 && change24h < -5) {
    score   += 2.5
    reasons.push(`Oversold bounce: RSI ${rsi.toFixed(0)}, ${vwapDevPct.toFixed(2)}% below VWAP`)
    setupTag = 'OVERSOLD_BOUNCE'
  }
  // VWAP LONG — value zone scalp (removed low-vol requirement — fires more often)
  else if (rsi >= 35 && rsi <= 55 && vwapDevPct < -0.5 && regime !== 'HIGH_VOL') {
    score   += 1.5
    reasons.push(`VWAP long: RSI ${rsi.toFixed(0)}, ${vwapDevPct.toFixed(2)}% below VWAP`)
    setupTag = 'VWAP_LONG'
  }
  // Mild RSI confirmation for existing long score
  else if (score > 0 && rsi < 48 && vwapDevPct < 0) {
    score   += 1.0
    reasons.push(`RSI ${rsi.toFixed(0)} + below VWAP confirms dip`)
    if (setupTag === 'UNTAGGED') setupTag = 'MEAN_REVERT'
  }

  // Kill weak dip-longs without real reversal (knife-catching)
  if (setupTag === 'MEAN_REVERT' && change24h < -8 && volSpike < 1.8) {
    score = Math.min(score, 3.0)
    reasons.push('Deep dip without volume — skip knife catch')
  }

  // Kill longs if RSI is very overbought AND no volume spike — already faded
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
  // PUMP SHORT — standard overextension fade
  else if (change24h > 12 && rsi >= 70 && volSpike >= 2 && score < 0) {
    score   -= 1.5
    reasons.push(`Pump fade: RSI ${rsi.toFixed(0)}, ${vwapDevPct.toFixed(2)}% above VWAP`)
    setupTag = 'PUMP_SHORT'
  }
  // VWAP SHORT — extended above fair value, calm market
  else if (vwapDevPct > 1.5 && rsi >= 65 && rsi <= 80 && regime !== 'HIGH_VOL') {
    score   -= 1.5
    reasons.push(`VWAP short: ${vwapDevPct.toFixed(2)}% above VWAP, RSI ${rsi.toFixed(0)}`)
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

  // Fallback tag if nothing matched
  if (setupTag === 'UNTAGGED' && Math.abs(score) >= Math.abs(MIN_LONG_SCORE)) {
    setupTag = score > 0 ? 'MEAN_REVERT' : 'PUMP_SHORT'
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
  for (const { asset, s1 } of scored.filter((x) => x.s1 > 0).sort((a, b) => b.s1 - a.s1)) {
    if (longPool.size >= topN) break
    longPool.set(asset.symbol, asset)
  }
  for (const asset of assets) {
    if (longPool.size >= topN + 2) break
    if (isMomentumCandidate(asset) && !longPool.has(asset.symbol)) {
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

  const toEnrich = [...longPool.values(), ...shortPool.values()]
  const enriched = await Promise.allSettled(toEnrich.map((asset) => scoreAssetFull(asset)))

  const out: Signal[] = []
  for (const r of enriched) {
    if (r.status === 'fulfilled') out.push(r.value)
  }
  return out
}

/** Long entry candidates from enriched signals only (not Stage-1-only rankLongs). */
export function filterLongEntries(signals: Signal[]): Signal[] {
  return signals
    .filter((s) => s.score >= getMinLongScore(s.setupTag))
    .filter((s) => s.setupTag !== 'UNTAGGED')                                           // no named setup = no edge = no trade
    .filter((s) => !s.indicators || s.indicators.volSpike > 0.3)                        // require real volume confirmation
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
