/**
 * Shared paper-trading parameters (website engine).
 *
 * ── Fee math (why the old numbers were losing) ─────────────────────────────
 * Old:  TP 0.25%  SL 0.12%  Fee 0.20% → net win 0.05%  net loss 0.32%
 *       Break-even win rate needed: 87% — impossible.
 *
 * New:  TP 0.80%  SL 0.40%  Fee 0.20% → net win 0.60%  net loss 0.60%
 *       Break-even win rate needed: 50% — achievable with real signals.
 *       True 2:1 R:R after fees requires 34% win rate — comfortable margin.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Round-trip fee simulation (entry + exit, e.g. 0.1% × 2) */
export const ROUND_TRIP_FEE_PCT = 0.002

// Wider targets so fees are a small fraction of the move
export const LONG_TP_PCT  = 0.008   // +0.80% take profit  (net +0.60% after fees)
export const LONG_SL_PCT  = 0.004   // −0.40% stop loss    (net −0.60% after fees)

export const SHORT_TP_PCT = 0.008
export const SHORT_SL_PCT = 0.004

export const FOREX_TP_PCT = 0.004   // forex moves slower — tighter is OK for TP
export const FOREX_SL_PCT = 0.002

export const MIN_TRADE_USD = 10        // skip micro positions that fees eat entirely

/**
 * Variable position sizing by setup conviction.
 * Higher-quality setups (OVERSOLD_BOUNCE) get a larger slice of capital.
 * Fallback is DEFAULT_POSITION_SIZE_PCT for any unrecognized tag.
 */
export const POSITION_SIZES: Record<string, number> = {
  OVERSOLD_BOUNCE : 0.35,   // strongest reversal setup — put real money here
  SUPERNOVA_SHORT : 0.30,   // extreme pump exhaustion — high confidence
  MOMENTUM_LONG   : 0.25,
  PUMP_SHORT      : 0.25,
  VWAP_LONG       : 0.18,
  VWAP_SHORT      : 0.18,
  FOREX_DIP       : 0.15,
  FOREX_FADE      : 0.15,
  MEAN_REVERT     : 0.15,
  UNTAGGED        : 0.12,   // lowest conviction — smallest bet
}
export const DEFAULT_POSITION_SIZE_PCT = 0.20  // fallback for new tags

/**
 * Daily loss circuit breaker.
 * If total realized P&L for today hits this level (as % of seed), stop all new entries.
 * Prevents compounding losses on bad market days.
 */
export const DAILY_LOSS_LIMIT_PCT = 0.03   // 3% of SEED_CAPITAL = $15 max daily loss

/**
 * High-volatility time windows (UTC hours, inclusive start, exclusive end).
 * Only open NEW positions during these windows — exit logic runs any time.
 *
 * Crypto peak: 8pm–2am ET  = 00:00–06:00 UTC  (Binance US / Asia session)
 *              6am–9am ET  = 10:00–13:00 UTC  (Europe open)
 * Stock peak:  9:30–11am ET = 13:30–15:00 UTC (open momentum)
 *              3pm–4pm ET  = 19:00–20:00 UTC  (close momentum)
 */
export const CRYPTO_HOT_WINDOWS_UTC: [number, number][] = [[0, 6], [10, 13]]
export const STOCK_HOT_WINDOWS_UTC:  [number, number][] = [[13, 15], [19, 20]]

/**
 * Time exits — only leave a position early if it's already halfway to TP.
 */
export const TIME_EXIT_SECS  = 300    // 5 min: minimum hold before any time exit
export const STALE_EXIT_SECS = 900    // 15 min: cut a dead/losing trade

/**
 * How long before the engine can re-enter the same symbol after an exit.
 */
export const SYMBOL_COOLDOWN_SECS = 900  // 15 min cooldown per symbol

/**
 * Minimum signal scores.
 * Lower than before so Stage-2-confirmed moderate dips (e.g. -5% + RSI<35)
 * can enter.  Crypto signals without candles are still blocked below 5.0
 * in scoreAssetFull to prevent buying falling knives blindly.
 */
export const MIN_LONG_SCORE  = 3.0
export const MIN_SHORT_SCORE = -3.5

export const SEED_CAPITAL = 500
