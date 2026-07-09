/**
 * Three named, pre-tuned risk postures — Cautious / Balanced / Aggressive —
 * instead of a settings panel of raw sliders. A user answers "how would you
 * feel about a drawdown," not "what should your trailing-stop % be."
 *
 * BALANCED is a verbatim copy of the constants that were previously hardcoded
 * in trading-config.ts and academy-auto-trader.ts — the validated posture
 * this whole app was originally tuned around. Zero behavior change for any
 * user on the default tier.
 *
 * Only constants that express a risk POSTURE live here (position size, stop/
 * target %, loss tolerance, conviction bar). Account mechanics that are the
 * same for everyone regardless of risk appetite — seed capital, min trade
 * size, forex TP/SL, market-regime detection — stay as global constants in
 * trading-config.ts / academy-auto-trader.ts.
 *
 * Setup-relative conviction (POSITION_SIZES' ranking of which setups deserve
 * more size than others) is a signal-quality judgment, not a risk-posture
 * one — it's identical across all three tiers. What varies by tier is the
 * ENVELOPE around it (max single position %, total deploy %, cash reserve).
 */

export type RiskTier = 'cautious' | 'balanced' | 'aggressive'

export interface RiskProfileBundle {
  tier: RiskTier
  label: string
  tagline: string

  // ── Shared entry-gate thresholds (trading-signals.ts) ──
  minLongScore: number
  minShortScore: number
  setupMinLongScore: Record<string, number>

  // ── Main bot sizing (trading-config.ts / trading-engine.ts) ──
  positionSizes: Record<string, number>
  defaultPositionSizePct: number
  targetDeployPct: number
  cashReservePct: number
  maxSinglePositionPct: number
  dailyLossLimitPct: number
  setupTpSl: Record<string, { tp: number; sl: number }>
  longTpPct: number
  longSlPct: number
  shortTpPct: number
  shortSlPct: number
  breakevenTriggerPct: number
  breakevenLockPct: number
  trailTriggerPct: number
  trailDistancePct: number
  symbolCooldownSecs: number
  timeExitSecs: number

  // ── Academy Auto Trader (academy-auto-trader.ts) ──
  maxSlots: number
  maxPositionPct: number
  dailyLossLimitUsd: number
  dailyProfitLockUsd: number
  maxTradesPerDay: number
  peakSoftGivebackPct: number
  peakHardGivebackPct: number
  peakMinGivebackUsd: number
  peakDefenseConvictionBonus: number
  peakDefenseSizeMult: number
  runnerTrailPct: number
  autoMinConviction: number
  rvolFloorMomentum: number
  rvolFloorValue: number
  rsMinEdgePct: number
  lunchConvictionBonus: number
  cooldownMinutes: number
  learnBadWinrate: number
  learnGreatWinrate: number
}

// Setup-relative sizing ranking — identical across tiers, see file header.
const POSITION_SIZES: Record<string, number> = {
  BB_LOWER_BOUNCE: 1.0, OVERSOLD_BOUNCE: 1.0, SUPERNOVA_SHORT: 1.0, MOMENTUM_LONG: 1.0,
  MACD_CROSS_LONG: 0.90, PUMP_SHORT: 0.85, VWAP_LONG: 0.75, VWAP_SHORT: 0.75,
  FOREX_DIP: 0.55, FOREX_FADE: 0.55, MEAN_REVERT: 0.50, UNTAGGED: 0.35,
}

// Forex entries stay identical across tiers — forex TP/SL is asset-mechanics
// (getTpSl's forex branch uses FOREX_TP_PCT/FOREX_SL_PCT directly and never
// reaches these anyway), not part of the three risk-managed equity curves.
const FOREX_TP_SL = { FOREX_DIP: { tp: 0.006, sl: 0.002 }, FOREX_FADE: { tp: 0.006, sl: 0.002 } }

export const RISK_PROFILES: Record<RiskTier, RiskProfileBundle> = {
  balanced: {
    tier: 'balanced', label: 'Balanced', tagline: 'Small losses, uncapped winners — the validated default.',
    minLongScore: 4.0, minShortScore: -4.5,
    setupMinLongScore: {
      MOMENTUM_LONG: 4.5, VWAP_LONG: 4.0, OVERSOLD_BOUNCE: 4.5, MACD_CROSS_LONG: 4.5,
      BB_LOWER_BOUNCE: 5.0, FOREX_DIP: 3.0, MEAN_REVERT: 2.8, UNTAGGED: 5.0,
    },
    positionSizes: POSITION_SIZES, defaultPositionSizePct: 0.70, targetDeployPct: 0.88,
    cashReservePct: 0.08, maxSinglePositionPct: 0.42, dailyLossLimitPct: 0.03,
    setupTpSl: {
      MOMENTUM_LONG: { tp: 0.015, sl: 0.004 }, OVERSOLD_BOUNCE: { tp: 0.020, sl: 0.005 },
      VWAP_LONG: { tp: 0.010, sl: 0.004 }, MACD_CROSS_LONG: { tp: 0.018, sl: 0.004 },
      BB_LOWER_BOUNCE: { tp: 0.022, sl: 0.005 }, PUMP_SHORT: { tp: 0.015, sl: 0.004 },
      SUPERNOVA_SHORT: { tp: 0.020, sl: 0.005 }, VWAP_SHORT: { tp: 0.010, sl: 0.004 },
      MEAN_REVERT: { tp: 0.010, sl: 0.004 }, ...FOREX_TP_SL,
    },
    longTpPct: 0.020, longSlPct: 0.004, shortTpPct: 0.018, shortSlPct: 0.004,
    breakevenTriggerPct: 0.006, breakevenLockPct: 0.001,
    trailTriggerPct: 0.012, trailDistancePct: 0.005,
    symbolCooldownSecs: 60, timeExitSecs: 1200,
    maxSlots: 3, maxPositionPct: 0.30,
    dailyLossLimitUsd: 60, dailyProfitLockUsd: 100, maxTradesPerDay: 30,
    peakSoftGivebackPct: 0.40, peakHardGivebackPct: 0.75, peakMinGivebackUsd: 25,
    peakDefenseConvictionBonus: 3, peakDefenseSizeMult: 0.5,
    runnerTrailPct: 0.025, autoMinConviction: 4,
    rvolFloorMomentum: 1.3, rvolFloorValue: 0.6, rsMinEdgePct: 0.5,
    lunchConvictionBonus: 2, cooldownMinutes: 8,
    learnBadWinrate: 0.35, learnGreatWinrate: 0.60,
  },

  cautious: {
    tier: 'cautious', label: 'Cautious', tagline: 'Protect what you have — smaller size, tighter stops, defends gains fast.',
    minLongScore: 5.0, minShortScore: -5.5,
    setupMinLongScore: {
      MOMENTUM_LONG: 5.5, VWAP_LONG: 5.0, OVERSOLD_BOUNCE: 5.5, MACD_CROSS_LONG: 5.5,
      BB_LOWER_BOUNCE: 6.0, FOREX_DIP: 4.0, MEAN_REVERT: 3.8, UNTAGGED: 6.0,
    },
    positionSizes: POSITION_SIZES, defaultPositionSizePct: 0.50, targetDeployPct: 0.65,
    cashReservePct: 0.15, maxSinglePositionPct: 0.25, dailyLossLimitPct: 0.015,
    setupTpSl: {
      MOMENTUM_LONG: { tp: 0.012, sl: 0.003 }, OVERSOLD_BOUNCE: { tp: 0.016, sl: 0.0035 },
      VWAP_LONG: { tp: 0.008, sl: 0.003 }, MACD_CROSS_LONG: { tp: 0.014, sl: 0.003 },
      BB_LOWER_BOUNCE: { tp: 0.018, sl: 0.0035 }, PUMP_SHORT: { tp: 0.012, sl: 0.003 },
      SUPERNOVA_SHORT: { tp: 0.016, sl: 0.0035 }, VWAP_SHORT: { tp: 0.008, sl: 0.003 },
      MEAN_REVERT: { tp: 0.008, sl: 0.003 }, ...FOREX_TP_SL,
    },
    longTpPct: 0.014, longSlPct: 0.003, shortTpPct: 0.013, shortSlPct: 0.003,
    breakevenTriggerPct: 0.004, breakevenLockPct: 0.001,
    trailTriggerPct: 0.008, trailDistancePct: 0.003,
    symbolCooldownSecs: 90, timeExitSecs: 900,
    maxSlots: 2, maxPositionPct: 0.18,
    dailyLossLimitUsd: 30, dailyProfitLockUsd: 50, maxTradesPerDay: 20,
    peakSoftGivebackPct: 0.20, peakHardGivebackPct: 0.40, peakMinGivebackUsd: 15,
    peakDefenseConvictionBonus: 4, peakDefenseSizeMult: 0.4,
    runnerTrailPct: 0.015, autoMinConviction: 6,
    rvolFloorMomentum: 1.5, rvolFloorValue: 0.7, rsMinEdgePct: 0.7,
    lunchConvictionBonus: 3, cooldownMinutes: 12,
    learnBadWinrate: 0.40, learnGreatWinrate: 0.60,
  },

  aggressive: {
    tier: 'aggressive', label: 'Aggressive', tagline: 'Bigger swings, wider room to run — still a real circuit breaker, never off.',
    minLongScore: 3.0, minShortScore: -3.5,
    setupMinLongScore: {
      MOMENTUM_LONG: 4.0, VWAP_LONG: 3.5, OVERSOLD_BOUNCE: 4.0, MACD_CROSS_LONG: 4.0,
      BB_LOWER_BOUNCE: 4.5, FOREX_DIP: 2.5, MEAN_REVERT: 2.3, UNTAGGED: 4.5,
    },
    positionSizes: POSITION_SIZES, defaultPositionSizePct: 0.85, targetDeployPct: 0.95,
    cashReservePct: 0.05, maxSinglePositionPct: 0.55, dailyLossLimitPct: 0.05,
    setupTpSl: {
      MOMENTUM_LONG: { tp: 0.020, sl: 0.005 }, OVERSOLD_BOUNCE: { tp: 0.026, sl: 0.006 },
      VWAP_LONG: { tp: 0.013, sl: 0.005 }, MACD_CROSS_LONG: { tp: 0.024, sl: 0.005 },
      BB_LOWER_BOUNCE: { tp: 0.028, sl: 0.006 }, PUMP_SHORT: { tp: 0.020, sl: 0.005 },
      SUPERNOVA_SHORT: { tp: 0.026, sl: 0.006 }, VWAP_SHORT: { tp: 0.013, sl: 0.005 },
      MEAN_REVERT: { tp: 0.013, sl: 0.005 }, ...FOREX_TP_SL,
    },
    longTpPct: 0.026, longSlPct: 0.005, shortTpPct: 0.024, shortSlPct: 0.005,
    breakevenTriggerPct: 0.009, breakevenLockPct: 0.001,
    trailTriggerPct: 0.018, trailDistancePct: 0.008,
    symbolCooldownSecs: 45, timeExitSecs: 1500,
    maxSlots: 4, maxPositionPct: 0.40,
    dailyLossLimitUsd: 90, dailyProfitLockUsd: 150, maxTradesPerDay: 40,
    peakSoftGivebackPct: 0.55, peakHardGivebackPct: 0.85, peakMinGivebackUsd: 35,
    peakDefenseConvictionBonus: 2, peakDefenseSizeMult: 0.6,
    runnerTrailPct: 0.035, autoMinConviction: 3,
    rvolFloorMomentum: 1.1, rvolFloorValue: 0.5, rsMinEdgePct: 0.3,
    lunchConvictionBonus: 1, cooldownMinutes: 5,
    learnBadWinrate: 0.30, learnGreatWinrate: 0.60,
  },
}

// Capital protection is non-negotiable regardless of posture — no tier may ever ship with a
// disabled circuit breaker. Runs once at module load, not per-call: a bug here should fail
// loudly at boot, not silently at 3am when the auto-trader cron ticks an unprotected account.
for (const bundle of Object.values(RISK_PROFILES)) {
  if (bundle.dailyLossLimitUsd <= 0 || bundle.dailyLossLimitPct <= 0) {
    throw new Error(`[risk-profiles] tier "${bundle.tier}" has a disabled daily-loss circuit breaker — this is never allowed`)
  }
}

export function resolveRiskProfile(tier: RiskTier | null | undefined): RiskProfileBundle {
  return RISK_PROFILES[tier ?? 'balanced'] ?? RISK_PROFILES.balanced
}
