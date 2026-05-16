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
/**
 * Conviction multipliers (not % of cash — used with slot-based sizing below).
 * 1.0 = full slot; 0.5 = half slot for low-conviction setups.
 */
export const POSITION_SIZES: Record<string, number> = {
  OVERSOLD_BOUNCE  : 1.0,
  SUPERNOVA_SHORT  : 1.0,
  MOMENTUM_LONG    : 1.0,
  PUMP_SHORT       : 0.85,
  VWAP_LONG        : 0.75,
  VWAP_SHORT       : 0.75,
  FOREX_DIP        : 0.55,
  FOREX_FADE       : 0.55,
  MEAN_REVERT      : 0.50,
  UNTAGGED         : 0.35,
}
export const DEFAULT_POSITION_SIZE_PCT = 0.70  // relative conviction vs best setups

/** Target % of portfolio equity deployed across all open slots */
export const TARGET_DEPLOY_PCT = 0.78

/** Always keep a small cash buffer for fees / next entry */
export const CASH_RESERVE_PCT = 0.08

/** Max capital in a single position (% of equity) */
export const MAX_SINGLE_POSITION_PCT = 0.42

/**
 * Compute $ budget for next entry from total equity (not leftover cash × 15%).
 */
export function computeEntryBudget(
  cash: number,
  equity: number,
  slotsRemaining: number,
  setupTag: string,
): number {
  if (slotsRemaining <= 0 || cash < MIN_TRADE_USD || equity < MIN_TRADE_USD) return 0

  const reserve = equity * CASH_RESERVE_PCT
  const investableCash = Math.max(0, cash - reserve)

  const deployed = Math.max(0, equity - cash)
  const deployTarget = equity * TARGET_DEPLOY_PCT
  const room = Math.max(0, deployTarget - deployed)
  const slotBase = room / slotsRemaining

  const conviction = POSITION_SIZES[setupTag] ?? DEFAULT_POSITION_SIZE_PCT
  const mult = conviction / 1.0 // 1.0 = full slot for top setups

  const budget = Math.min(
    slotBase * mult,
    investableCash,
    equity * MAX_SINGLE_POSITION_PCT,
  )

  return parseFloat(Math.max(0, budget).toFixed(2))
}

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
/** Crypto tradable nearly 24/7 — only skip thin 07:00–09:00 UTC window */
export const CRYPTO_HOT_WINDOWS_UTC: [number, number][] = [[0, 7], [9, 24]]
export const STOCK_HOT_WINDOWS_UTC:  [number, number][] = [[13.5, 16], [19, 20.5]]

/**
 * Time exits — give positions real time to reach the wider TP.
 * Time-exit only triggers if position is at least 50% of the way to TP.
 * Stale cut fires when position is losing after a longer hold.
 */
export const TIME_EXIT_SECS  = 420    // 7 min: allow earlier profit capture in chop
export const STALE_EXIT_SECS = 5400   // 90 min: only cut slow bleeds (not quick SL trades)
export const STALE_MIN_LOSS_PCT = 0.0025  // stale only if losing more than 0.25%

/** Bank small winners in chop after min hold (between this and time-exit threshold) */
export const QUICK_WIN_MIN_PCT = 0.003   // +0.3% minimum to bank
export const QUICK_WIN_HOLD_SECS = 300   // 5 min

/** Time-exit takes partial profit at this fraction of TP (was 0.5) */
export const TIME_EXIT_TP_FRACTION = 0.35

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

/** Per-setup entry thresholds (momentum confirmed by candles can enter lower) */
export const SETUP_MIN_LONG_SCORE: Record<string, number> = {
  MOMENTUM_LONG   : 3.5,
  VWAP_LONG       : 3.8,
  OVERSOLD_BOUNCE : 4.5,
  FOREX_DIP       : 3.5,
  MEAN_REVERT     : 4.2,
  UNTAGGED        : 5.0,
}

/** Per-setup TP/SL — match strategy personality */
export const SETUP_TP_SL: Record<string, { tp: number; sl: number }> = {
  MOMENTUM_LONG   : { tp: 0.010, sl: 0.004 },  // ride trend, tight stop
  OVERSOLD_BOUNCE : { tp: 0.018, sl: 0.008 },  // wider — needs room to reverse
  VWAP_LONG       : { tp: 0.012, sl: 0.005 },
  PUMP_SHORT      : { tp: 0.014, sl: 0.006 },
  SUPERNOVA_SHORT : { tp: 0.018, sl: 0.007 },
  VWAP_SHORT      : { tp: 0.012, sl: 0.005 },
  FOREX_DIP       : { tp: 0.006, sl: 0.0025 },
  FOREX_FADE      : { tp: 0.006, sl: 0.0025 },
  MEAN_REVERT     : { tp: 0.010, sl: 0.005 },
}

export function getMinLongScore(setupTag: string): number {
  return SETUP_MIN_LONG_SCORE[setupTag] ?? MIN_LONG_SCORE
}

export function getTpSl(
  setupTag: string,
  direction: 'LONG' | 'SHORT',
  assetType: 'crypto' | 'stock' | 'forex',
): { tp: number; sl: number } {
  if (assetType === 'forex') {
    return { tp: FOREX_TP_PCT, sl: FOREX_SL_PCT }
  }
  const custom = SETUP_TP_SL[setupTag]
  if (custom) return custom
  return direction === 'SHORT'
    ? { tp: SHORT_TP_PCT, sl: SHORT_SL_PCT }
    : { tp: LONG_TP_PCT, sl: LONG_SL_PCT }
}

/** How many assets per side get full candle enrichment each tick */
export const ENRICH_TOP_N = 8

export const SEED_CAPITAL = 500
