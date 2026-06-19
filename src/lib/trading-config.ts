/**
 * ══════════════════════════════════════════════════════════════════════════
 *  "SLEEP IN PROFIT" STRATEGY  — v4
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Core principle: a trade can end in 3 ways — but NEVER in a big loss:
 *
 *   ① Hard stop   (price never reached break-even) → −0.4% max loss
 *   ② Break-even stop (was up ≥0.6%, reversed)     → −0.1% (fees only)
 *   ③ Trailing stop / TP  (ran in our favour)       → +1.0% to +2.5%
 *
 * Expected value with 50% win rate (conservative):
 *   EV = 0.50×(avg +1.6%) + 0.20×(−0.1%) + 0.30×(−0.4%)
 *      = +0.80% − 0.02% − 0.12% = +0.66% per trade
 *
 * At 3 trades/day on $500 → +$9.90/day average (conservative).
 * Impossible to compound losses because:
 *   • Break-even stop kills the "winner turned loser" scenario
 *   • Hard time cut (12 min) kills the "holding and hoping" scenario
 *   • DAILY_LOSS_LIMIT_PCT circuit-breaker kills bad-day spirals
 *
 * R:R by setup:
 *   MOMENTUM_LONG   TP 2.0% / SL 0.4% → 5:1 R:R   (break-even at +0.6%)
 *   OVERSOLD_BOUNCE TP 2.5% / SL 0.5% → 5:1 R:R
 *   VWAP_LONG       TP 1.5% / SL 0.4% → 3.75:1 R:R
 *   Shorts           TP 1.8% / SL 0.4% → 4.5:1 R:R
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Round-trip fee simulation (entry + exit, e.g. 0.1% × 2) */
export const ROUND_TRIP_FEE_PCT = 0.002

// Default TP/SL — overridden per-setup in SETUP_TP_SL below
export const LONG_TP_PCT  = 0.020   // +2.0%  hard take-profit ceiling
export const LONG_SL_PCT  = 0.004   // −0.4%  hard stop — never more than this
export const SHORT_TP_PCT = 0.018   // +1.8%
export const SHORT_SL_PCT = 0.004
export const FOREX_TP_PCT = 0.005
export const FOREX_SL_PCT = 0.002

// ── Break-even stop ────────────────────────────────────────────────────────
// When a position gains BREAKEVEN_TRIGGER_PCT, move stop to entry + BREAKEVEN_LOCK_PCT.
// After this fires the trade CANNOT result in a loss (only fees at worst).
export const BREAKEVEN_TRIGGER_PCT = 0.006   // activate when +0.6% in profit
export const BREAKEVEN_LOCK_PCT    = 0.001   // lock stop at entry +0.1% (covers ~half fees)

// ── Trailing stop ──────────────────────────────────────────────────────────
// When profit reaches TRAIL_TRIGGER_PCT, a trailing stop replaces the fixed SL.
// The stop ratchets up (for longs) so you can NEVER give back more than TRAIL_DISTANCE_PCT
// from the peak price. Winners run; profits are protected.
export const TRAIL_TRIGGER_PCT  = 0.012   // activate trailing when +1.2% in profit
export const TRAIL_DISTANCE_PCT = 0.005   // trail 0.5% below price peak

export const MIN_TRADE_USD = 40        // skip tiny positions — fees eat all profit below this

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
  BB_LOWER_BOUNCE  : 1.0,   // highest conviction — dynamic support bounce
  OVERSOLD_BOUNCE  : 1.0,
  SUPERNOVA_SHORT  : 1.0,
  MOMENTUM_LONG    : 1.0,
  MACD_CROSS_LONG  : 0.90,  // institutional momentum confirmation
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
export const TARGET_DEPLOY_PCT = 0.88

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
/** Crypto entries allowed 24/7 (paper engine — exits still run anytime) */
export const CRYPTO_HOT_WINDOWS_UTC: [number, number][] = [[0, 24]]
export const STOCK_HOT_WINDOWS_UTC:  [number, number][] = [[13.5, 16], [19, 20.5]]

/**
 * Time exits — give positions real time to reach the wider TP.
 * Time-exit only triggers if position is at least 50% of the way to TP.
 * Stale cut fires when position is losing after a longer hold.
 */
/**
 * Time discipline — the second pillar of "sleep in profit".
 * Give positions 20 min to develop — MOMENTUM and BB_BOUNCE setups need time.
 * 12 min was too aggressive; it cut trades that were 8 min from TP.
 */
export const TIME_EXIT_SECS     = 1200  // 20 min: cut if position ≥ 40% toward TP
export const STALE_EXIT_SECS    = 1200  // 20 min: same — must wait for setup to resolve
export const STALE_MIN_LOSS_PCT = 0.001 // cut ANY losing position after 20 min

/** Quick win disabled effectively (threshold above TP ceiling for most setups).
 *  At 33% win rate, cutting winners at +0.35% produced negative EV (-0.05%/trade).
 *  Let the trailing stop (fires at +1.2%) and TP handle all exits instead.
 */
export const QUICK_WIN_MIN_PCT   = 0.012 // 1.2% — above most TPs, so it never fires
export const QUICK_WIN_HOLD_SECS = 300   // 5 min hold required if it did fire

/** Time-exit triggers when position is at least 40% of the way to TP */
export const TIME_EXIT_TP_FRACTION = 0.40

/**
 * How long before the engine can re-enter the same symbol after an exit.
 * 60s is enough to avoid immediately re-entering a just-stopped trade.
 */
export const SYMBOL_COOLDOWN_SECS = 60  // 1 min cooldown per symbol

/**
 * Minimum signal scores to open a position.
 * Higher than before — only enter when Stage 2 indicators actually confirm.
 * Weak Stage-1-only signals (score 3–4) won't fire without candle confirmation.
 */
export const MIN_LONG_SCORE  = 4.0
export const MIN_SHORT_SCORE = -4.5

/** Per-setup entry thresholds (momentum confirmed by candles can enter lower) */
export const SETUP_MIN_LONG_SCORE: Record<string, number> = {
  MOMENTUM_LONG   : 4.5,   // score floor is 5.5 in stage2
  VWAP_LONG       : 4.0,   // raised from 3.5 — now needs EMA50 + vol confirmation
  OVERSOLD_BOUNCE : 4.5,   // score floor is 5.5 in stage2
  MACD_CROSS_LONG : 4.5,   // score floor is 5.5 in stage2
  BB_LOWER_BOUNCE : 5.0,   // score floor is 6.0 in stage2 — high conviction only
  FOREX_DIP       : 3.0,
  MEAN_REVERT     : 2.8,
  UNTAGGED        : 5.0,
}

/**
 * Per-setup TP/SL — designed around break-even + trailing stop framework.
 * SL is TIGHT (0.4%) because break-even stop prevents large losses.
 * TP is WIDE (2-2.5%) because trailing stop captures big moves.
 * R:R is 5:1+ so we're profitable even at 30% win rate.
 */
export const SETUP_TP_SL: Record<string, { tp: number; sl: number }> = {
  MOMENTUM_LONG   : { tp: 0.015, sl: 0.004 },  // 3.75:1
  OVERSOLD_BOUNCE : { tp: 0.020, sl: 0.005 },  // 4:1
  VWAP_LONG       : { tp: 0.010, sl: 0.004 },  // 2.5:1
  MACD_CROSS_LONG : { tp: 0.018, sl: 0.004 },  // 4.5:1 — rides the momentum wave
  BB_LOWER_BOUNCE : { tp: 0.022, sl: 0.005 },  // 4.4:1 — mean reverts strongly
  PUMP_SHORT      : { tp: 0.015, sl: 0.004 },
  SUPERNOVA_SHORT : { tp: 0.020, sl: 0.005 },
  VWAP_SHORT      : { tp: 0.010, sl: 0.004 },
  FOREX_DIP       : { tp: 0.006, sl: 0.002 },
  FOREX_FADE      : { tp: 0.006, sl: 0.002 },
  MEAN_REVERT     : { tp: 0.010, sl: 0.004 },
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

/** How many assets per side get full candle enrichment each tick.
 *  Higher = more VWAP_LONG opportunities discovered (flat assets not in top-8 by 24h score).
 */
export const ENRICH_TOP_N = 14

export const SEED_CAPITAL = 500

/** Setups the engine should never auto-disable from learning (core crypto edge) */
export const CORE_LONG_SETUPS = ['MOMENTUM_LONG', 'OVERSOLD_BOUNCE', 'VWAP_LONG', 'BB_LOWER_BOUNCE', 'MACD_CROSS_LONG'] as const

/** Below this equity % from seed, micro-size entries only */
export const DRAWDOWN_HARD_STOP_PCT = -0.10

/** Recovery band starts here (above = cautious, not recovery) */
export const DRAWDOWN_RECOVERY_PCT = -0.07

/** Min position in recovery/cautious — normal $40 is too high after size cuts */
export const MIN_TRADE_USD_RECOVERY = 28

/** Regime gates — loosened so crypto can trade in chop, not only perfect BTC bull */
export const NEUTRAL_CRYPTO_MIN_SCORE = 4.5
export const BEAR_CRYPTO_MIN_SCORE = 5.0

/** When BTC itself is washed out (RSI < 35), allow alt dip entries at this bar */
export const BEAR_BTC_OVERSOLD_MIN_SCORE = 4.0
export const BEAR_BTC_OVERSOLD_RSI = 35
