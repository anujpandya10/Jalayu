/**
 * Intraday Technical Indicators — TypeScript port of trading_bot/indicators.py
 *
 * RSI  (Wilder's exponential smoothing — the correct implementation)
 * ATR  (Wilder's True Range average)
 * VWAP (rolling volume-weighted average price)
 * EMA  (standard exponential moving average)
 * Volume Spike multiplier
 *
 * All functions are pure — no side effects, no API calls.
 */

// ── RSI — Relative Strength Index ─────────────────────────────────────────────

/**
 * Wilder's RSI.  Returns 50 if insufficient data.
 * @param closes  Array of close prices (oldest → newest)
 * @param period  Default 14
 */
export function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50

  const deltas: number[] = []
  for (let i = 1; i < closes.length; i++) deltas.push(closes[i] - closes[i - 1])

  const gains = deltas.map((d) => (d > 0 ? d : 0))
  const losses = deltas.map((d) => (d < 0 ? -d : 0))

  // Seed with simple average of first `period` values
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period

  // Wilder smoothing for remaining bars
  for (let i = period; i < deltas.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2))
}

// ── ATR — Average True Range ───────────────────────────────────────────────────

/**
 * Wilder's ATR.  Returns mean(high-low) if insufficient data.
 */
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number {
  if (closes.length < period + 1) {
    const hl = highs.map((h, i) => h - lows[i])
    return hl.reduce((a, b) => a + b, 0) / hl.length
  }

  const trueRanges: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i]
    const hc = Math.abs(highs[i] - closes[i - 1])
    const lc = Math.abs(lows[i] - closes[i - 1])
    trueRanges.push(Math.max(hl, hc, lc))
  }

  // Seed
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period
  // Wilder smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period
  }

  return parseFloat(atr.toFixed(8))
}

// ── VWAP — Volume Weighted Average Price ──────────────────────────────────────

/**
 * Rolling VWAP over last `periods` candles.
 * Typical price = (H + L + C) / 3
 * VWAP = Σ(TP × Vol) / Σ(Vol)
 */
export function calculateVWAP(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  periods = 20,
): number {
  const n = Math.min(periods, closes.length)
  const h = highs.slice(-n)
  const l = lows.slice(-n)
  const c = closes.slice(-n)
  const v = volumes.slice(-n)

  const totalVol = v.reduce((a, b) => a + b, 0)
  if (totalVol === 0) return closes[closes.length - 1] ?? 0

  let tpVol = 0
  for (let i = 0; i < n; i++) {
    const tp = (h[i] + l[i] + c[i]) / 3
    tpVol += tp * v[i]
  }

  return parseFloat((tpVol / totalVol).toFixed(8))
}

/** Returns how many % the price is above (+) or below (–) VWAP. */
export function vwapDeviationPct(price: number, vwap: number): number {
  if (vwap === 0) return 0
  return parseFloat(((price - vwap) / vwap * 100).toFixed(4))
}

// ── EMA — Exponential Moving Average ─────────────────────────────────────────

export function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return data.reduce((a, b) => a + b, 0) / data.length
  const k = 2 / (period + 1)
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k)
  }
  return parseFloat(ema.toFixed(8))
}

// ── Volume Spike Multiplier ───────────────────────────────────────────────────

/**
 * Returns current_volume / MA_20_volume.
 * > 3.0 = actionable spike.
 * Uses all volumes provided; last element is the "current" candle.
 */
export function volumeSpike(volumes: number[]): number {
  if (volumes.length < 3) return 1.0
  const current = volumes[volumes.length - 1]
  // If the current (live) candle has zero volume it may just be the candle-open moment — treat as neutral
  if (current === 0) return 1.0
  const prior   = volumes.slice(0, -1)             // exclude current bar from MA
  const ma      = prior.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, prior.length)
  if (ma === 0) return 1.0
  return parseFloat((current / ma).toFixed(3))
}

// ── Composite Indicator Bundle ────────────────────────────────────────────────

export interface IndicatorBundle {
  rsi       : number   // 0–100
  atr       : number   // price units
  atrPct    : number   // ATR as % of price (volatility proxy)
  vwap      : number
  vwapDevPct: number   // % above/below VWAP
  ema9      : number
  ema21     : number
  volSpike  : number   // current_vol / MA20
  regime    : 'HIGH_VOL' | 'LOW_VOL' | 'NORMAL'
}

export interface CandleInput {
  high  : number
  low   : number
  close : number
  volume: number
}

/**
 * Compute all indicators at once from a candle array.
 * Caller passes candles oldest → newest.
 */
export function computeIndicators(candles: CandleInput[]): IndicatorBundle {
  const highs   = candles.map((c) => c.high)
  const lows    = candles.map((c) => c.low)
  const closes  = candles.map((c) => c.close)
  const volumes = candles.map((c) => c.volume)
  const price   = closes[closes.length - 1] ?? 0

  const rsi     = calculateRSI(closes)
  const atr     = calculateATR(highs, lows, closes)
  const atrPct  = price > 0 ? parseFloat((atr / price * 100).toFixed(4)) : 0
  const vwap    = calculateVWAP(highs, lows, closes, volumes)
  const vwapDev = vwapDeviationPct(price, vwap)
  const ema9    = calculateEMA(closes, 9)
  const ema21   = calculateEMA(closes, 21)
  const spike   = volumeSpike(volumes)

  const regime: IndicatorBundle['regime'] =
    atrPct >= 3.5 ? 'HIGH_VOL' :
    atrPct <= 1.2 ? 'LOW_VOL'  : 'NORMAL'

  return {
    rsi,
    atr,
    atrPct,
    vwap,
    vwapDevPct: vwapDev,
    ema9,
    ema21,
    volSpike: spike,
    regime,
  }
}
