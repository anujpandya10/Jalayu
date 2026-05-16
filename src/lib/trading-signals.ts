import type { AssetData } from './market-data'
import { MIN_LONG_SCORE, MIN_SHORT_SCORE } from './trading-config'

export interface Signal {
  asset: AssetData
  score: number          // positive = LONG, negative = SHORT opportunity
  direction: 'LONG' | 'SHORT'
  action: 'BUY_LONG' | 'SELL_SHORT' | 'HOLD'
  reason: string
  urgency: 'high' | 'medium' | 'low'
}

/**
 * Score an asset for both LONG (dip-buy) and SHORT (pump-and-dump) opportunities.
 *
 * Positive score → LONG signal (buy the dip / oversold bounce)
 * Negative score → SHORT signal (short the pump, profit when it dumps)
 *
 * Score clamped to [-10, +10].
 * BUY_LONG threshold: >= MIN_LONG_SCORE (default 2.5)
 * SELL_SHORT threshold: <= MIN_SHORT_SCORE (default -4)
 */
export function scoreAsset(asset: AssetData): Signal {
  const { change24h, change7d, isPumpCandidate } = asset
  let score = 0
  let urgency: Signal['urgency'] = 'low'
  const reasons: string[] = []

  // ── Forex-specific scoring branch (tighter thresholds, slower movement) ──
  if (asset.assetType === 'forex') {
    // change24h here = % change in the base currency value
    if (change24h < -0.5)       { score += 3; reasons.push(`${change24h.toFixed(3)}% forex dip`) }
    else if (change24h < -0.2)  { score += 1.8 }
    else if (change24h < -0.1)  { score += 1.0 }
    else if (change24h > 0.5)   { score -= 3; reasons.push(`${change24h.toFixed(3)}% forex spike`) }
    else if (change24h > 0.2)   { score -= 1.5 }
    score = Math.max(-5, Math.min(5, score))
    // Forex TP/SL are tighter — handled in tick
    return {
      asset, score,
      direction: score > 0 ? 'LONG' : 'SHORT',
      action: score >= MIN_LONG_SCORE ? 'BUY_LONG' : score <= MIN_SHORT_SCORE ? 'SELL_SHORT' : 'HOLD',
      reason: reasons.join(', ') || 'forex neutral',
      urgency: 'low' as const,
    }
  }

  if (change24h > 30) {
    // Supernova spike — extreme pump, dump imminent
    score = -9
    urgency = 'high'
    reasons.push(`Supernova spike +${change24h.toFixed(1)}%, dump imminent`)
  } else if (change24h > 20) {
    score = -7
    urgency = 'high'
    reasons.push(`Parabolic move +${change24h.toFixed(1)}%, short the top`)
  } else if (change24h > 12) {
    score = -5
    urgency = 'medium'
    reasons.push(`Pump detected +${change24h.toFixed(1)}%, watching for reversal`)
  } else if (change24h > 8) {
    score = -3
    urgency = 'low'
    reasons.push(`Elevated +${change24h.toFixed(1)}%, potential short setup`)
  } else if (change24h < -15) {
    // Panic sell — extreme oversold bounce opportunity
    score = 7
    urgency = 'high'
    reasons.push(`Panic sell ${change24h.toFixed(1)}%, extreme oversold bounce`)
  } else if (change24h < -8) {
    score = 5
    urgency = 'high'
    reasons.push(`Heavy selling ${change24h.toFixed(1)}%, oversold bounce play`)
  } else if (change24h < -5) {
    score = 3.5
    urgency = 'medium'
    reasons.push(`Significant dip ${change24h.toFixed(1)}%, mean reversion`)
  } else if (change24h < -2) {
    score = 2
    urgency = 'low'
    reasons.push(`Pullback ${change24h.toFixed(1)}%, potential uptrend`)
  }
  // Weak -1% dips intentionally skipped — 24h data is too slow for 8s micro-scalps

  // Pump candidate bonus — stocks being artificially pumped
  if (isPumpCandidate) {
    score -= 2
    reasons.push('pump candidate')
    if (urgency === 'low') urgency = 'medium'
  }

  // Dip-in-uptrend bonus for longs
  if (score > 0 && change7d > 0) {
    score += 1
    reasons.push(`7d +${change7d.toFixed(1)}% uptrend`)
  }

  score = Math.max(-10, Math.min(10, score))

  const action: Signal['action'] =
    score >= MIN_LONG_SCORE ? 'BUY_LONG' : score <= MIN_SHORT_SCORE ? 'SELL_SHORT' : 'HOLD'
  const direction: Signal['direction'] = score > 0 ? 'LONG' : 'SHORT'

  return {
    asset,
    score,
    direction,
    action,
    urgency,
    reason: reasons.join(', ') || `neutral (${change24h.toFixed(2)}% 24h)`,
  }
}

/** Rank all assets by score descending (best longs first). */
export function rankSignals(assets: AssetData[]): Signal[] {
  return assets.map(scoreAsset).sort((a, b) => b.score - a.score)
}

/** Returns LONG signals sorted best first (highest score). */
export function rankLongs(assets: AssetData[]): Signal[] {
  return assets
    .map(scoreAsset)
    .filter((s) => s.action === 'BUY_LONG')
    .sort((a, b) => b.score - a.score)
}

/** Returns SHORT signals sorted best first (most negative score first). */
export function rankShorts(assets: AssetData[]): Signal[] {
  return assets
    .map(scoreAsset)
    .filter((s) => s.action === 'SELL_SHORT')
    .sort((a, b) => a.score - b.score)  // most negative first
}
