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
