/**
 * Shared paper-trading parameters (website engine).
 *
 * ── Fee math ────────────────────────────────────────────────────────────────
 * Old v1:  TP 0.25%  SL 0.12%  Fee 0.20% → net win 0.05%  net loss 0.32%
 *          Break-even win rate needed: 87% — impossible.
 *
 * Old v2:  TP 0.80%  SL 0.40%  Fee 0.20% → net win 0.60%  net loss 0.60%
 *          Break-even win rate needed: 50% — 1:1 R:R, only flat in best case.
 *
 * Current: TP 1.50%  SL 0.50%  Fee 0.20% → net win +1.30%  net loss −0.70%
 *          R:R = 1.86:1. Break-even win rate needed: 35%.
 *          At 40% win rate → EV = +0.40×1.30 − 0.60×0.70 = +0.10% per trade.
 *          5 trades/day on $500 → ~+$2.50/day average.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Round-trip fee simulation (entry + exit, e.g. 0.1% × 2) */
export const ROUND_TRIP_FEE_PCT = 0.002

// True 2:1 R:R after fees — fees become a tiny fraction of the move
export const LONG_TP_PCT  = 0.015   // +1.50% take profit  (net +1.30% after fees)
export const LONG_SL_PCT  = 0.005   // −0.50% stop loss    (net −0.70% after fees)

export const SHORT_TP_PCT = 0.012   // shorts move faster, tighter TP still good
export const SHORT_SL_PCT = 0.005

export const FOREX_TP_PCT = 0.005   // forex moves slower — tighter TP
export const FOREX_SL_PCT = 0.002

export const MIN_TRADE_USD = 10        // skip micro positions that fees eat entirely

/**
 * Variable position sizing by setup conviction.
 * Higher-quality setups get a larger slice of capital.
 * Fallback is DEFAULT_POSITION_SIZE_PCT for any unrecognized tag.
 */
export const POSITION_SIZES: Record<string, number> = {
  OVERSOLD_BOUNCE  : 0.40,   // strongest reversal setup — put real money here
  SUPERNOVA_SHORT  : 0.35,   // extreme pump exhaustion — high confidence short
  MOMENTUM_LONG    : 0.35,   // volume-confirmed breakout — ride the trend
  PUMP_SHORT       : 0.28,
  VWAP_LONG        : 0.20,
  VWAP_SHORT       : 0.20,
  FOREX_DIP        : 0.15,
  FOREX_FADE       : 0.15,
  MEAN_REVERT      : 0.15,
  UNTAGGED         : 0.10,   // lowest conviction — smallest bet
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
 * Crypto: tradeable almost 24/7 — only avoid the Asia dead zone (8–10 UTC).
 *   [0, 8]  = midnight–8am UTC  (Asia/Pacific session)
 *   [10, 23] = 10am–11pm UTC  (Europe open through US close)
 *
 * Stocks: US session momentum windows only.
 *   [13.5, 16] = 9:30am–12pm ET (open momentum)
 *   [19, 20.5] = 3pm–4:30pm ET  (close momentum)
 */
export const CRYPTO_HOT_WINDOWS_UTC: [number, number][] = [[0, 8], [10, 23]]
export const STOCK_HOT_WINDOWS_UTC:  [number, number][] = [[13.5, 16], [19, 20.5]]

/**
 * Time exits — give positions real time to reach the wider TP.
 * Time-exit only triggers if position is at least 50% of the way to TP.
 * Stale cut fires when position is losing after a longer hold.
 */
export const TIME_EXIT_SECS  = 600    // 10 min: min hold before any early exit
export const STALE_EXIT_SECS = 2700   // 45 min: cut a dead/losing trade

/**
 * How long before the engine can re-enter the same symbol after an exit.
 * Short cooldown — don't miss a second good signal on the same asset.
 */
export const SYMBOL_COOLDOWN_SECS = 180  // 3 min cooldown per symbol

/**
 * Minimum signal scores to open a position.
 * Higher than before — only enter when Stage 2 indicators actually confirm.
 * Weak Stage-1-only signals (score 3–4) won't fire without candle confirmation.
 */
export const MIN_LONG_SCORE  = 4.0
export const MIN_SHORT_SCORE = -4.5

export const SEED_CAPITAL = 500
