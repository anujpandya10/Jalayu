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
 *   OVERSOLD_BOUNCE   — RSI < 32, price near VWAP floor, dip > −5%
 *   VWAP_LONG         — price below VWAP, RSI 35–55, low vol regime
 *   MOMENTUM_LONG     — volume spike ≥ 3×, RSI 45–65, EMA9 > EMA21
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
import { MIN_LONG_SCORE, MIN_SHORT_SCORE } from './trading-config'

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
    if (change24h < -0.5) return  3.5
    if (change24h < -0.2) return  2.0
    if (change24h < -0.1) return  1.2
    if (change24h >  0.5) return -3.5
    if (change24h >  0.2) return -2.0
    return 0
  }

  if (change24h > 30)  return -9
  if (change24h > 20)  return -7
  if (change24h > 12)  return -5
  if (change24h >  8)  return -3
  if (change24h < -15) return  7
  if (change24h <  -8) return  5
  if (change24h <  -5) return  3.5
  if (change24h <  -2) return  2
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

  // OVERSOLD BOUNCE — highest conviction long
  if (rsi < 32 && vwapDevPct < -1.0 && change24h < -5) {
    score   += 2.5
    reasons.push(`Oversold bounce: RSI ${rsi.toFixed(0)}, ${vwapDevPct.toFixed(2)}% below VWAP`)
    setupTag = 'OVERSOLD_BOUNCE'
  }
  // VWAP LONG — value zone scalp in calm market
  else if (rsi >= 35 && rsi <= 55 && vwapDevPct < -0.5 && regime === 'LOW_VOL') {
    score   += 1.5
    reasons.push(`VWAP long: RSI ${rsi.toFixed(0)}, ${vwapDevPct.toFixed(2)}% below VWAP, low vol`)
    setupTag = 'VWAP_LONG'
  }
  // MOMENTUM LONG — volume-confirmed breakout
  else if (volSpike >= 3.0 && rsi >= 45 && rsi <= 68 && ema9 > ema21) {
    score   += 2.0
    reasons.push(`Momentum: ${volSpike.toFixed(1)}× volume, RSI ${rsi.toFixed(0)}, EMA9 > EMA21`)
    setupTag = 'MOMENTUM_LONG'
  }
  // Mild RSI confirmation for existing long score
  else if (score > 0 && rsi < 45 && vwapDevPct < 0) {
    score   += 0.8
    reasons.push(`RSI ${rsi.toFixed(0)} + below VWAP confirms dip`)
    if (setupTag === 'UNTAGGED') setupTag = 'MEAN_REVERT'
  }

  // Kill weak longs if RSI is overbought — signal already faded
  if (score > 0 && rsi > 75) {
    score -= 2
    reasons.push(`RSI ${rsi.toFixed(0)} overbought — weakening long`)
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
  } else {
    // Fall back to 24h-only logic with a basic tag
    reasons  = [`24h change ${asset.change24h.toFixed(2)}% (no candles)`]
    setupTag = s1 > 0 ? 'MEAN_REVERT' : s1 < 0 ? 'PUMP_SHORT' : 'UNTAGGED'
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

/**
 * Async version — enriches top N candidates with real indicator data.
 * Fetches candles for up to `topN` assets per direction.
 * Returns all signals (indicators only on the enriched ones).
 */
export async function rankSignalsEnriched(
  assets: AssetData[],
  topN = 3,
): Promise<Signal[]> {
  // Fast sort first
  const quick = rankSignals(assets)

  // Enrich the top N on each side
  const longsToEnrich  = quick.filter((s) => s.score > 0).slice(0, topN)
  const shortsToEnrich = quick.filter((s) => s.score < 0).slice(0, topN)
  const toEnrich       = [...longsToEnrich, ...shortsToEnrich]

  const enriched = await Promise.allSettled(
    toEnrich.map((s) => scoreAssetFull(s.asset))
  )

  const enrichedMap = new Map<string, Signal>()
  for (const r of enriched) {
    if (r.status === 'fulfilled') enrichedMap.set(r.value.asset.symbol, r.value)
  }

  return quick.map((s) => enrichedMap.get(s.asset.symbol) ?? s)
}
