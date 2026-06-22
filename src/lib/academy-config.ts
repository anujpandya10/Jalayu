export const ACADEMY_SEED_CAPITAL = 1000
export const ACADEMY_MIN_TRADE_USD = 20

/**
 * The real setup tags the coach judges against. Lives here (a dependency-free
 * config module) rather than in academy-coach.ts so client components can
 * import it WITHOUT pulling the server-only Anthropic SDK into the browser
 * bundle.
 */
export const REAL_SETUP_TAGS = [
  'MOMENTUM_LONG', 'OVERSOLD_BOUNCE', 'VWAP_LONG', 'MACD_CROSS_LONG', 'BB_LOWER_BOUNCE',
  'PUMP_SHORT', 'SUPERNOVA_SHORT', 'VWAP_SHORT',
]
