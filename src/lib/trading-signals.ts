import type { AssetQuote } from './market-data'

export interface Signal {
  asset: AssetQuote
  score: number        // -10 to +10
  action: 'BUY' | 'SELL' | 'HOLD'
  rsi: number
  bbPosition: number   // -1 (below lower) to +1 (above upper)
  momentum1h: number   // % change last candle
  reason: string
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gains += diff
    else losses -= diff
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function calcBollingerBands(closes: number[], period = 20, stdMult = 2): { upper: number; middle: number; lower: number } {
  const slice = closes.slice(-period)
  const middle = slice.reduce((a, b) => a + b, 0) / slice.length
  const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / slice.length
  const std = Math.sqrt(variance)
  return { upper: middle + stdMult * std, middle, lower: middle - stdMult * std }
}

export function scoreAsset(asset: AssetQuote): Signal {
  const closes = asset.candles.map((c) => c.close)
  const price = asset.price

  const rsi = calcRSI(closes)
  const bb = calcBollingerBands(closes)
  const bbRange = bb.upper - bb.lower
  const bbPosition = bbRange > 0 ? (price - bb.middle) / (bbRange / 2) : 0
  const prev = closes[closes.length - 2] ?? price
  const momentum1h = prev > 0 ? ((price - prev) / prev) * 100 : 0

  let score = 0

  // RSI scoring
  if (rsi < 25) score += 4
  else if (rsi < 35) score += 2.5
  else if (rsi < 45) score += 1
  else if (rsi > 75) score -= 4
  else if (rsi > 65) score -= 2.5
  else if (rsi > 55) score -= 1

  // Bollinger Band scoring
  if (bbPosition < -0.9) score += 3
  else if (bbPosition < -0.5) score += 1.5
  else if (bbPosition > 0.9) score -= 3
  else if (bbPosition > 0.5) score -= 1.5

  // Momentum (slight contrarian + slight follow)
  if (momentum1h < -2) score += 1.5    // big drop = potential bounce
  else if (momentum1h > 2) score -= 1  // big spike = potential reversal
  else if (momentum1h > 0.5) score += 0.5  // mild uptrend = follow
  else if (momentum1h < -0.5) score -= 0.5

  score = Math.max(-10, Math.min(10, score))

  const reasons: string[] = []
  if (rsi < 35) reasons.push(`RSI ${rsi.toFixed(0)} (oversold)`)
  else if (rsi > 65) reasons.push(`RSI ${rsi.toFixed(0)} (overbought)`)
  if (bbPosition < -0.5) reasons.push(`below BB midline`)
  else if (bbPosition > 0.5) reasons.push(`above BB midline`)
  if (Math.abs(momentum1h) > 0.5) reasons.push(`${momentum1h > 0 ? '+' : ''}${momentum1h.toFixed(2)}% last candle`)

  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  if (score >= 3) action = 'BUY'
  else if (score <= -2) action = 'SELL'

  return { asset, score, action, rsi, bbPosition, momentum1h, reason: reasons.join(', ') || 'neutral' }
}

export function rankSignals(assets: AssetQuote[]): Signal[] {
  return assets.map(scoreAsset).sort((a, b) => b.score - a.score)
}
