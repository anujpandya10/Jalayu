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

export const POSITION_SIZE_PCT = 0.20  // 20% per position — fewer, higher-conviction
export const MIN_TRADE_USD = 10        // skip micro positions that fees eat entirely

/**
 * Time exits — only leave a position early if it's already halfway to TP.
 * This stops "take a 0.01% winner at 60s" which was costing more in fees than it earned.
 */
export const TIME_EXIT_SECS  = 300    // 5 min: minimum hold before any time exit
export const STALE_EXIT_SECS = 900    // 15 min: cut a dead/losing trade, give it time first

/**
 * How long (seconds) before the engine can re-enter the same symbol after an exit.
 * Prevents the "LINK lost → immediately re-enter LINK" loop seen in practice.
 */
export const SYMBOL_COOLDOWN_SECS = 900  // 15 min cooldown per symbol after any exit

/** Minimum signal scores — raised to require real indicator confirmation */
export const MIN_LONG_SCORE  = 4.0   // was 2.5 — now requires -5%+ dip + indicator edge
export const MIN_SHORT_SCORE = -5.0  // was -4  — now requires strong overextension signal

export const SEED_CAPITAL = 500
