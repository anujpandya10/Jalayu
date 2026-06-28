/**
 * Price-action reader — reads the raw CANDLES the way a discretionary trader reads a chart,
 * not just the indicators derived from them. This is the "learn the bars" layer: candlestick
 * patterns (engulfing, pin bars / wick rejections, inside bars), market structure (higher-
 * highs/higher-lows vs lower-lows), and the support/resistance levels price actually respects.
 *
 * Everything here is computed from the bar bodies and wicks — open/high/low/close — so it
 * answers the questions an indicator can't: "who won THIS bar?", "did buyers reject that
 * level?", "is price breaking out of a range or fading back into it?".
 *
 * Pure, no side effects. Reads the last CLOSED bar (second-to-last element), because the
 * final element is the live, still-forming bar whose body/wick aren't final yet — same
 * reasoning the volume-spike calc uses.
 */
import type { CandleInput } from './indicators'

export interface PriceActionRead {
  patterns: string[]                              // human-readable tags found, e.g. ['bullish engulfing', 'at support']
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'         // what the bars say RIGHT NOW
  strength: number                                // count of confirming reads (0–4ish)
  structure: 'UPTREND' | 'DOWNTREND' | 'RANGE'    // swing-based trend, not EMA
  atSupport: boolean
  atResistance: boolean
  support: number | null
  resistance: number | null
  /** A strong reversal bar that argues AGAINST holding this direction — drives early exits.
   *  e.g. 'LONG' = a bearish reversal just printed; if you're long, the bars turned on you. */
  reversalAgainst: 'LONG' | 'SHORT' | null
  note: string                                    // plain-English summary for narration
}

interface BarShape {
  open: number; high: number; low: number; close: number
  body: number; range: number; upperWick: number; lowerWick: number
  green: boolean
}

function shape(c: CandleInput): BarShape {
  const open = c.open ?? c.close
  const { high, low, close } = c
  const body = Math.abs(close - open)
  const range = Math.max(high - low, 1e-9)
  const upperWick = high - Math.max(open, close)
  const lowerWick = Math.min(open, close) - low
  return { open, high, low, close, body, range, upperWick, lowerWick, green: close >= open }
}

/** Recent swing high / low — the levels price has actually turned at lately. */
function swingLevels(candles: CandleInput[], lookback: number): { support: number | null; resistance: number | null } {
  const slice = candles.slice(-lookback, -1) // exclude the live bar
  if (slice.length < 3) return { support: null, resistance: null }
  const support = Math.min(...slice.map((c) => c.low))
  const resistance = Math.max(...slice.map((c) => c.high))
  return { support, resistance }
}

/** Swing-based structure: are we making higher highs & higher lows, or the opposite? */
function readStructure(candles: CandleInput[]): 'UPTREND' | 'DOWNTREND' | 'RANGE' {
  const n = candles.length
  if (n < 12) return 'RANGE'
  const recent = candles.slice(-6, -1)
  const prior = candles.slice(-11, -6)
  const recentHigh = Math.max(...recent.map((c) => c.high))
  const recentLow = Math.min(...recent.map((c) => c.low))
  const priorHigh = Math.max(...prior.map((c) => c.high))
  const priorLow = Math.min(...prior.map((c) => c.low))
  const higherHigh = recentHigh > priorHigh
  const higherLow = recentLow > priorLow
  const lowerHigh = recentHigh < priorHigh
  const lowerLow = recentLow < priorLow
  if (higherHigh && higherLow) return 'UPTREND'
  if (lowerHigh && lowerLow) return 'DOWNTREND'
  return 'RANGE'
}

const NEAR_LEVEL_PCT = 0.004 // within 0.4% of a swing level counts as "at" it

export function analyzePriceAction(candles: CandleInput[]): PriceActionRead {
  const empty: PriceActionRead = {
    patterns: [], bias: 'NEUTRAL', strength: 0, structure: 'RANGE',
    atSupport: false, atResistance: false, support: null, resistance: null,
    reversalAgainst: null, note: 'not enough bars to read price action',
  }
  if (candles.length < 6) return empty

  const i = candles.length - 2 // last CLOSED bar
  const cur = shape(candles[i])
  const prev = shape(candles[i - 1])
  const price = candles[candles.length - 1].close

  const { support, resistance } = swingLevels(candles, 16)
  const structure = readStructure(candles)
  const atSupport = support != null && Math.abs(price - support) / price <= NEAR_LEVEL_PCT
  const atResistance = resistance != null && Math.abs(price - resistance) / price <= NEAR_LEVEL_PCT

  const patterns: string[] = []
  let bull = 0, bear = 0

  // ── Candlestick patterns on the last closed bar ──────────────────────────────────────
  // Engulfing: this bar's body fully swallows the prior bar's body, opposite colour. The
  // single clearest "control just changed hands" signal on the chart.
  const bullEngulf = cur.green && !prev.green && cur.close >= prev.open && cur.open <= prev.close && cur.body > prev.body * 0.8
  const bearEngulf = !cur.green && prev.green && cur.close <= prev.open && cur.open >= prev.close && cur.body > prev.body * 0.8
  if (bullEngulf) { patterns.push('bullish engulfing'); bull += 2 }
  if (bearEngulf) { patterns.push('bearish engulfing'); bear += 2 }

  // Pin bars / wick rejection: a long wick = a level got tested and slammed back. Lower
  // wick = buyers rejected lower prices (bullish); upper wick = sellers rejected higher.
  const smallBody = cur.body <= cur.range * 0.4
  const hammer = smallBody && cur.lowerWick >= cur.body * 2 && cur.lowerWick >= cur.upperWick * 2
  const star = smallBody && cur.upperWick >= cur.body * 2 && cur.upperWick >= cur.lowerWick * 2
  if (hammer) { patterns.push('hammer (lower-wick rejection)'); bull += 1 }
  if (star) { patterns.push('shooting star (upper-wick rejection)'); bear += 1 }

  // Inside bar: this bar sits entirely inside the prior bar — a coil/pause that usually
  // precedes a breakout. Direction-neutral on its own.
  if (cur.high < prev.high && cur.low > prev.low) patterns.push('inside bar (coiling)')

  // ── Where the bar happened matters as much as its shape ──────────────────────────────
  if (atSupport) { patterns.push('at support'); bull += 1 }
  if (atResistance) { patterns.push('at resistance'); bear += 1 }

  // Breakout: a wide-range bar closing through the recent range high/low on expansion —
  // price leaving the range, not fading back in.
  const avgRange = candles.slice(-10, -1).reduce((s, c) => s + (c.high - c.low), 0) / 9
  const expansion = cur.range > avgRange * 1.5
  if (resistance != null && cur.close > resistance && expansion) { patterns.push('breaking resistance'); bull += 2 }
  if (support != null && cur.close < support && expansion) { patterns.push('breaking support'); bear += 2 }

  // Structure adds a vote with the trend.
  if (structure === 'UPTREND') bull += 1
  if (structure === 'DOWNTREND') bear += 1

  const strength = Math.max(bull, bear)
  const bias: PriceActionRead['bias'] = bull > bear + 0.5 ? 'BULLISH' : bear > bull + 0.5 ? 'BEARISH' : 'NEUTRAL'

  // A reversal bar strong enough to warn a holder: an engulfing or pin against the position.
  // Used for price-action early exits, so it must be a real reversal candle, not just bias.
  let reversalAgainst: PriceActionRead['reversalAgainst'] = null
  if (bearEngulf || (star && (atResistance || structure === 'UPTREND'))) reversalAgainst = 'LONG'
  else if (bullEngulf || (hammer && (atSupport || structure === 'DOWNTREND'))) reversalAgainst = 'SHORT'

  const note = patterns.length > 0
    ? `${patterns.join(', ')} — ${bias === 'BULLISH' ? 'buyers in control on this bar' : bias === 'BEARISH' ? 'sellers in control on this bar' : 'no clear control yet'}; ${structure.toLowerCase()}`
    : `no clean candle signal; ${structure.toLowerCase()}`

  return { patterns, bias, strength, structure, atSupport, atResistance, support, resistance, reversalAgainst, note }
}
