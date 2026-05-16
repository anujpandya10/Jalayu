import type { AssetData } from './market-data'

export interface Signal {
  asset: AssetData
  score: number       // positive = buy opportunity, negative = sell
  action: 'BUY' | 'SELL' | 'HOLD'
  reason: string
}

/**
 * Score an asset based on momentum and mean-reversion signals.
 *
 * Strategy: buy assets that dipped in the last 24h but are in a healthy 7d trend
 * (dip-buy in an uptrend). Sell assets that are overbought on both timeframes.
 *
 * Score ranges -10 to +10. BUY threshold: ≥ 1.5. SELL threshold: ≤ -2.
 *
 * We ALWAYS produce a ranked list — no asset gets score 0 unless perfectly neutral.
 * This ensures the algo always finds something to trade.
 */
export function scoreAsset(asset: AssetData): Signal {
  const { change24h, change7d } = asset
  let score = 0
  const reasons: string[] = []

  // ── 24h momentum (primary signal) ─────────────────────────────────────────
  // Extreme drop in 24h → strong buy (mean reversion)
  if (change24h <= -8)       { score += 4.5; reasons.push(`${change24h.toFixed(1)}% 24h drop`) }
  else if (change24h <= -5)  { score += 3.5; reasons.push(`${change24h.toFixed(1)}% 24h dip`) }
  else if (change24h <= -3)  { score += 2.5; reasons.push(`${change24h.toFixed(1)}% 24h dip`) }
  else if (change24h <= -1.5){ score += 1.5; reasons.push(`${change24h.toFixed(1)}% 24h pullback`) }
  else if (change24h <= -0.5){ score += 0.8; reasons.push(`${change24h.toFixed(1)}% 24h pullback`) }
  else if (change24h >= 8)   { score -= 4.0; reasons.push(`${change24h.toFixed(1)}% 24h spike`) }
  else if (change24h >= 5)   { score -= 2.5; reasons.push(`${change24h.toFixed(1)}% 24h spike`) }
  else if (change24h >= 3)   { score -= 1.5; reasons.push(`${change24h.toFixed(1)}% 24h rise`) }
  else if (change24h >= 1.5) { score -= 0.8; reasons.push(`${change24h.toFixed(1)}% 24h rise`) }

  // ── 7d trend context (secondary signal) ───────────────────────────────────
  // Dip-buy: 24h down but 7d up = healthy pullback in uptrend → buy more
  if (change24h < 0 && change7d > 3)  { score += 1.5; reasons.push(`7d +${change7d.toFixed(1)}% uptrend`) }
  if (change24h < 0 && change7d > 0)  { score += 0.5 }
  // Extended rally: both 24h and 7d up = potentially overbought
  if (change24h > 2 && change7d > 10) { score -= 1.5; reasons.push(`7d +${change7d.toFixed(1)}% extended`) }
  // Deep correction: 7d also down = might go lower → reduce score
  if (change24h < -5 && change7d < -10) { score -= 1.0; reasons.push('deep correction') }

  score = Math.max(-10, Math.min(10, score))

  // Always floor to a small non-zero value so ranking produces variety
  if (score === 0) score = -change24h * 0.1

  const action: Signal['action'] = score >= 1.5 ? 'BUY' : score <= -2 ? 'SELL' : 'HOLD'

  return {
    asset,
    score,
    action,
    reason: reasons.join(', ') || `neutral (${change24h.toFixed(2)}% 24h)`,
  }
}

/** Rank all assets by score descending. */
export function rankSignals(assets: AssetData[]): Signal[] {
  return assets.map(scoreAsset).sort((a, b) => b.score - a.score)
}
