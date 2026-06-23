/**
 * Per-bar indicator SERIES for charting — pure, dependency-free, client-safe.
 *
 * The existing indicators.ts returns a single latest value per indicator (for
 * the trading engine). Charts need a value at EVERY bar so overlays line up
 * with the candles. These functions return arrays aligned 1:1 with the input,
 * with `null` where there isn't enough data yet (the chart just skips nulls).
 *
 * No imports → safe to use in client components without dragging anything
 * server-only into the browser bundle.
 */

export interface Bar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Exponential moving average, one value per input element (null until seeded). */
export function emaArray(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  // Seed with simple average of the first `period` values
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** Cumulative (session-style) VWAP, one value per bar. */
export function vwapArray(bars: Bar[]): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null)
  let cumTPV = 0
  let cumVol = 0
  for (let i = 0; i < bars.length; i++) {
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3
    const vol = bars[i].volume || 0
    cumTPV += tp * vol
    cumVol += vol
    out[i] = cumVol > 0 ? cumTPV / cumVol : bars[i].close
  }
  return out
}

export interface BollingerPoint { upper: number; middle: number; lower: number }

/** Bollinger Bands per bar (null until `period` bars are available). */
export function bollingerArray(
  closes: number[],
  period = 20,
  mult = 2,
): (BollingerPoint | null)[] {
  const out: (BollingerPoint | null)[] = new Array(closes.length).fill(null)
  for (let i = period - 1; i < closes.length; i++) {
    const window = closes.slice(i - period + 1, i + 1)
    const mean = window.reduce((a, b) => a + b, 0) / period
    const variance = window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    out[i] = { upper: mean + mult * sd, middle: mean, lower: mean - mult * sd }
  }
  return out
}

/** Wilder's RSI per bar (null until seeded). */
export function rsiArray(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return out

  const gains: number[] = []
  const losses: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gains.push(d > 0 ? d : 0)
    losses.push(d < 0 ? -d : 0)
  }

  // Seed averages over the first `period` deltas (deltas index 0..period-1 → close index `period`)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
    out[i + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export interface MacdPoint { macd: number; signal: number; hist: number }

/** MACD (12/26/9) per bar (null until both EMAs and the signal are seeded). */
export function macdArray(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): (MacdPoint | null)[] {
  const out: (MacdPoint | null)[] = new Array(closes.length).fill(null)
  const emaFast = emaArray(closes, fast)
  const emaSlow = emaArray(closes, slow)

  // MACD line where both EMAs exist (contiguous from index slow-1 onward)
  const macdLine: (number | null)[] = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null,
  )

  // Signal = EMA(signalPeriod) over the contiguous non-null MACD values
  const firstIdx = macdLine.findIndex((v) => v != null)
  if (firstIdx === -1) return out
  const macdVals = macdLine.slice(firstIdx).map((v) => v as number)
  const signalVals = emaArray(macdVals, signalPeriod)

  for (let j = 0; j < macdVals.length; j++) {
    const sig = signalVals[j]
    if (sig == null) continue
    const idx = firstIdx + j
    const macd = macdVals[j]
    out[idx] = { macd, signal: sig, hist: macd - sig }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Moving averages
// ─────────────────────────────────────────────────────────────────────────────

export function smaArray(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function wmaArray(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  const denom = (period * (period + 1)) / 2
  for (let i = period - 1; i < values.length; i++) {
    let w = 0
    for (let k = 0; k < period; k++) w += values[i - period + 1 + k] * (k + 1)
    out[i] = w / denom
  }
  return out
}

export function vwmaArray(bars: Bar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null)
  for (let i = period - 1; i < bars.length; i++) {
    let pv = 0, v = 0
    for (let k = i - period + 1; k <= i; k++) { pv += bars[k].close * (bars[k].volume || 0); v += bars[k].volume || 0 }
    out[i] = v > 0 ? pv / v : bars[i].close
  }
  return out
}

export function stdDevArray(values: number[], period = 20): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    const w = values.slice(i - period + 1, i + 1)
    const m = w.reduce((a, b) => a + b, 0) / period
    out[i] = Math.sqrt(w.reduce((acc, x) => acc + (x - m) ** 2, 0) / period)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Volatility / true range
// ─────────────────────────────────────────────────────────────────────────────

/** True range per bar. */
function trueRanges(bars: Bar[]): number[] {
  const tr: number[] = []
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { tr.push(bars[i].high - bars[i].low); continue }
    const hl = bars[i].high - bars[i].low
    const hc = Math.abs(bars[i].high - bars[i - 1].close)
    const lc = Math.abs(bars[i].low - bars[i - 1].close)
    tr.push(Math.max(hl, hc, lc))
  }
  return tr
}

/** Wilder's ATR per bar. */
export function atrArray(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null)
  if (bars.length < period + 1) return out
  const tr = trueRanges(bars)
  let atr = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
  out[period] = atr
  for (let i = period + 1; i < bars.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period
    out[i] = atr
  }
  return out
}

export interface BandPoint { upper: number; middle: number; lower: number }

/** Keltner Channels: EMA middle ± mult × ATR. */
export function keltnerArray(bars: Bar[], emaPeriod = 20, atrPeriod = 10, mult = 2): (BandPoint | null)[] {
  const closes = bars.map((b) => b.close)
  const mid = emaArray(closes, emaPeriod)
  const atr = atrArray(bars, atrPeriod)
  return bars.map((_, i) => (mid[i] != null && atr[i] != null
    ? { upper: (mid[i] as number) + mult * (atr[i] as number), middle: mid[i] as number, lower: (mid[i] as number) - mult * (atr[i] as number) }
    : null))
}

/** Donchian Channels: highest high / lowest low over period. */
export function donchianArray(bars: Bar[], period = 20): (BandPoint | null)[] {
  const out: (BandPoint | null)[] = new Array(bars.length).fill(null)
  for (let i = period - 1; i < bars.length; i++) {
    let hi = -Infinity, lo = Infinity
    for (let k = i - period + 1; k <= i; k++) { hi = Math.max(hi, bars[k].high); lo = Math.min(lo, bars[k].low) }
    out[i] = { upper: hi, lower: lo, middle: (hi + lo) / 2 }
  }
  return out
}

/** Parabolic SAR per bar. */
export function psarArray(bars: Bar[], step = 0.02, maxStep = 0.2): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null)
  if (bars.length < 2) return out
  let uptrend = bars[1].close >= bars[0].close
  let sar = uptrend ? bars[0].low : bars[0].high
  let ep = uptrend ? bars[0].high : bars[0].low
  let af = step
  for (let i = 1; i < bars.length; i++) {
    sar = sar + af * (ep - sar)
    if (uptrend) {
      if (bars[i].low < sar) { uptrend = false; sar = ep; ep = bars[i].low; af = step }
      else { if (bars[i].high > ep) { ep = bars[i].high; af = Math.min(maxStep, af + step) } }
    } else {
      if (bars[i].high > sar) { uptrend = true; sar = ep; ep = bars[i].high; af = step }
      else { if (bars[i].low < ep) { ep = bars[i].low; af = Math.min(maxStep, af + step) } }
    }
    out[i] = sar
  }
  return out
}

export interface SuperTrendPoint { value: number; up: boolean }

/** SuperTrend (ATR-based trend line that flips). */
export function superTrendArray(bars: Bar[], period = 10, mult = 3): (SuperTrendPoint | null)[] {
  const out: (SuperTrendPoint | null)[] = new Array(bars.length).fill(null)
  const atr = atrArray(bars, period)
  let prevUpper = 0, prevLower = 0, prevST = 0, prevUp = true
  for (let i = 0; i < bars.length; i++) {
    if (atr[i] == null) continue
    const mid = (bars[i].high + bars[i].low) / 2
    const a = atr[i] as number
    let upper = mid + mult * a
    let lower = mid - mult * a
    if (prevST !== 0) {
      upper = upper < prevUpper || bars[i - 1].close > prevUpper ? upper : prevUpper
      lower = lower > prevLower || bars[i - 1].close < prevLower ? lower : prevLower
    }
    let up: boolean = prevUp
    if (prevST === 0) up = bars[i].close >= mid
    else if (prevST === prevUpper) up = bars[i].close > upper ? true : false
    else up = bars[i].close < lower ? false : true
    const st = up ? lower : upper
    out[i] = { value: st, up }
    prevUpper = upper; prevLower = lower; prevST = st; prevUp = up
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Oscillators
// ─────────────────────────────────────────────────────────────────────────────

export interface StochPoint { k: number; d: number }

export function stochasticArray(bars: Bar[], kPeriod = 14, dPeriod = 3): (StochPoint | null)[] {
  const rawK: (number | null)[] = new Array(bars.length).fill(null)
  for (let i = kPeriod - 1; i < bars.length; i++) {
    let hi = -Infinity, lo = Infinity
    for (let k = i - kPeriod + 1; k <= i; k++) { hi = Math.max(hi, bars[k].high); lo = Math.min(lo, bars[k].low) }
    rawK[i] = hi === lo ? 50 : (100 * (bars[i].close - lo)) / (hi - lo)
  }
  const kVals = rawK.map((v) => (v == null ? 0 : v))
  const dArr = smaArray(kVals, dPeriod)
  return bars.map((_, i) => (rawK[i] != null ? { k: rawK[i] as number, d: dArr[i] ?? (rawK[i] as number) } : null))
}

export function stochRsiArray(closes: number[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3): (StochPoint | null)[] {
  const rsi = rsiArray(closes, rsiPeriod)
  const out: (number | null)[] = new Array(closes.length).fill(null)
  for (let i = 0; i < closes.length; i++) {
    if (rsi[i] == null) continue
    const start = i - stochPeriod + 1
    if (start < 0 || rsi[start] == null) continue
    let hi = -Infinity, lo = Infinity
    let ok = true
    for (let k = start; k <= i; k++) { if (rsi[k] == null) { ok = false; break } hi = Math.max(hi, rsi[k] as number); lo = Math.min(lo, rsi[k] as number) }
    if (!ok) continue
    out[i] = hi === lo ? 50 : (100 * ((rsi[i] as number) - lo)) / (hi - lo)
  }
  const kArr = smaArray(out.map((v) => v ?? 0), kSmooth)
  const dArr = smaArray(kArr.map((v) => v ?? 0), dSmooth)
  return closes.map((_, i) => (out[i] != null ? { k: kArr[i] ?? (out[i] as number), d: dArr[i] ?? (out[i] as number) } : null))
}

export interface AdxPoint { adx: number; plusDI: number; minusDI: number }

/** Wilder's ADX / DMI. */
export function adxArray(bars: Bar[], period = 14): (AdxPoint | null)[] {
  const out: (AdxPoint | null)[] = new Array(bars.length).fill(null)
  if (bars.length < period * 2) return out
  const tr: number[] = [0], plusDM: number[] = [0], minusDM: number[] = [0]
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high
    const down = bars[i - 1].low - bars[i].low
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
    const hl = bars[i].high - bars[i].low
    const hc = Math.abs(bars[i].high - bars[i - 1].close)
    const lc = Math.abs(bars[i].low - bars[i - 1].close)
    tr.push(Math.max(hl, hc, lc))
  }
  let trN = tr.slice(1, period + 1).reduce((a, b) => a + b, 0)
  let plusN = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0)
  let minusN = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0)
  const dx: (number | null)[] = new Array(bars.length).fill(null)
  for (let i = period + 1; i < bars.length; i++) {
    trN = trN - trN / period + tr[i]
    plusN = plusN - plusN / period + plusDM[i]
    minusN = minusN - minusN / period + minusDM[i]
    const pDI = trN > 0 ? (100 * plusN) / trN : 0
    const mDI = trN > 0 ? (100 * minusN) / trN : 0
    const dxi = pDI + mDI > 0 ? (100 * Math.abs(pDI - mDI)) / (pDI + mDI) : 0
    dx[i] = dxi
    out[i] = { adx: 0, plusDI: pDI, minusDI: mDI }
  }
  // ADX = Wilder-smoothed DX
  const firstDx = dx.findIndex((v) => v != null)
  if (firstDx !== -1) {
    const dxVals = dx.slice(firstDx).map((v) => v ?? 0)
    let adx = dxVals.slice(0, period).reduce((a, b) => a + b, 0) / period
    for (let j = period; j < dxVals.length; j++) {
      adx = (adx * (period - 1) + dxVals[j]) / period
      const idx = firstDx + j
      if (out[idx]) (out[idx] as AdxPoint).adx = adx
    }
  }
  return out
}

export function cciArray(bars: Bar[], period = 20): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null)
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3)
  for (let i = period - 1; i < bars.length; i++) {
    const w = tp.slice(i - period + 1, i + 1)
    const m = w.reduce((a, b) => a + b, 0) / period
    const md = w.reduce((acc, x) => acc + Math.abs(x - m), 0) / period
    out[i] = md === 0 ? 0 : (tp[i] - m) / (0.015 * md)
  }
  return out
}

export function williamsRArray(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null)
  for (let i = period - 1; i < bars.length; i++) {
    let hi = -Infinity, lo = Infinity
    for (let k = i - period + 1; k <= i; k++) { hi = Math.max(hi, bars[k].high); lo = Math.min(lo, bars[k].low) }
    out[i] = hi === lo ? -50 : (-100 * (hi - bars[i].close)) / (hi - lo)
  }
  return out
}

export function rocArray(closes: number[], period = 12): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  for (let i = period; i < closes.length; i++) {
    out[i] = closes[i - period] === 0 ? 0 : (100 * (closes[i] - closes[i - period])) / closes[i - period]
  }
  return out
}

/** Awesome Oscillator: SMA(median,5) − SMA(median,34). */
export function awesomeArray(bars: Bar[]): (number | null)[] {
  const med = bars.map((b) => (b.high + b.low) / 2)
  const s5 = smaArray(med, 5)
  const s34 = smaArray(med, 34)
  return bars.map((_, i) => (s5[i] != null && s34[i] != null ? (s5[i] as number) - (s34[i] as number) : null))
}

export interface AroonPoint { up: number; down: number }

export function aroonArray(bars: Bar[], period = 25): (AroonPoint | null)[] {
  const out: (AroonPoint | null)[] = new Array(bars.length).fill(null)
  for (let i = period; i < bars.length; i++) {
    let hiIdx = i, loIdx = i
    for (let k = i - period; k <= i; k++) {
      if (bars[k].high >= bars[hiIdx].high) hiIdx = k
      if (bars[k].low <= bars[loIdx].low) loIdx = k
    }
    out[i] = { up: (100 * (period - (i - hiIdx))) / period, down: (100 * (period - (i - loIdx))) / period }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume
// ─────────────────────────────────────────────────────────────────────────────

export function obvArray(bars: Bar[]): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null)
  let obv = 0
  out[0] = 0
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) obv += bars[i].volume || 0
    else if (bars[i].close < bars[i - 1].close) obv -= bars[i].volume || 0
    out[i] = obv
  }
  return out
}

export function mfiArray(bars: Bar[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null)
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3)
  for (let i = period; i < bars.length; i++) {
    let pos = 0, neg = 0
    for (let k = i - period + 1; k <= i; k++) {
      const flow = tp[k] * (bars[k].volume || 0)
      if (tp[k] > tp[k - 1]) pos += flow
      else if (tp[k] < tp[k - 1]) neg += flow
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg)
  }
  return out
}

/** Chaikin Money Flow. */
export function cmfArray(bars: Bar[], period = 20): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null)
  const mfv = bars.map((b) => {
    const range = b.high - b.low
    const m = range === 0 ? 0 : ((b.close - b.low) - (b.high - b.close)) / range
    return m * (b.volume || 0)
  })
  for (let i = period - 1; i < bars.length; i++) {
    let sv = 0, vv = 0
    for (let k = i - period + 1; k <= i; k++) { sv += mfv[k]; vv += bars[k].volume || 0 }
    out[i] = vv === 0 ? 0 : sv / vv
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Ichimoku
// ─────────────────────────────────────────────────────────────────────────────

export interface IchimokuPoint { tenkan: number | null; kijun: number | null; senkouA: number | null; senkouB: number | null }

export function ichimokuArray(bars: Bar[], conv = 9, base = 26, spanB = 52): IchimokuPoint[] {
  const hl = (start: number, end: number) => {
    let hi = -Infinity, lo = Infinity
    for (let k = start; k <= end; k++) { hi = Math.max(hi, bars[k].high); lo = Math.min(lo, bars[k].low) }
    return (hi + lo) / 2
  }
  return bars.map((_, i) => {
    const tenkan = i >= conv - 1 ? hl(i - conv + 1, i) : null
    const kijun = i >= base - 1 ? hl(i - base + 1, i) : null
    const senkouA = tenkan != null && kijun != null ? (tenkan + kijun) / 2 : null
    const senkouB = i >= spanB - 1 ? hl(i - spanB + 1, i) : null
    return { tenkan, kijun, senkouA, senkouB }
  })
}
