/**
 * Shared paper-trading parameters (website engine).
 * Tuned for positive expectancy: reward ≥ risk, fees included.
 */

/** Round-trip fee simulation (entry + exit), e.g. 0.1% × 2 */
export const ROUND_TRIP_FEE_PCT = 0.002

export const LONG_TP_PCT = 0.0025   // +0.25% take profit
export const LONG_SL_PCT = 0.0012   // -0.12% stop (≈ 2:1 reward:risk before fees)

export const SHORT_TP_PCT = 0.0025
export const SHORT_SL_PCT = 0.0012

export const FOREX_TP_PCT = 0.0012  // forex moves slower
export const FOREX_SL_PCT = 0.0008

export const POSITION_SIZE_PCT = 0.15 // 15% per position — fewer, larger conviction trades
export const MIN_TRADE_USD = 5
export const TIME_EXIT_SECS = 60      // take small winners after 60s
export const STALE_EXIT_SECS = 180    // cut dead trades after 3min

/** Minimum signal scores (see trading-signals.ts) */
export const MIN_LONG_SCORE = 2.5
export const MIN_SHORT_SCORE = -4

export const SEED_CAPITAL = 500
