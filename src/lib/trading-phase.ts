export type TradingPhase =
  | 'CRYPTO_NIGHT'    // 8pm–4am ET: crypto only, build capital
  | 'PREMARKET'       // 4am–9:30am ET: crypto + prep for open
  | 'STOCK_MARKET'    // 9:30am–4pm ET: stocks priority + crypto + forex
  | 'AFTER_HOURS'     // 4pm–8pm ET: after-hours stocks + crypto + forex
  | 'FOREX_NIGHT'     // (same as CRYPTO_NIGHT for now, but forex also active)

export interface PhaseInfo {
  phase: TradingPhase
  label: string
  emoji: string
  description: string
  minutesUntilNext: number
  nextPhaseName: string
  cryptoActive: boolean
  stocksActive: boolean
  forexActive: boolean
}

// All times in UTC. ET = UTC-4 (EDT, summer) or UTC-5 (EST, winter).
// Use UTC-4 (EDT) as the standard approximation.
// Pre-market: 08:00–13:30 UTC
// Market:     13:30–20:00 UTC
// After-hours:20:00–00:00 UTC
// Overnight:  00:00–08:00 UTC

export function getCurrentPhase(): PhaseInfo {
  const now = new Date()
  const utcH = now.getUTCHours()
  const utcM = now.getUTCMinutes()
  const totalMinutes = utcH * 60 + utcM
  const dayOfWeek = now.getUTCDay() // 0=Sun, 6=Sat

  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5
  const PREMARKET_START  = 8 * 60        // 08:00 UTC = 4am ET
  const MARKET_OPEN      = 13 * 60 + 30  // 13:30 UTC = 9:30am ET
  const MARKET_CLOSE     = 20 * 60       // 20:00 UTC = 4pm ET
  const AFTER_HOURS_END  = 24 * 60       // 00:00 UTC next day = 8pm ET

  function minsUntil(target: number): number {
    return target > totalMinutes ? target - totalMinutes : (1440 - totalMinutes) + target
  }

  if (!isWeekday || totalMinutes >= AFTER_HOURS_END || totalMinutes < PREMARKET_START) {
    return {
      phase: 'CRYPTO_NIGHT',
      label: 'Crypto Night Mode',
      emoji: '🌙',
      description: 'Building capital overnight. Crypto scalping 24/7.',
      minutesUntilNext: minsUntil(PREMARKET_START),
      nextPhaseName: 'Pre-Market',
      cryptoActive: true, stocksActive: false, forexActive: true,
    }
  }
  if (totalMinutes >= PREMARKET_START && totalMinutes < MARKET_OPEN) {
    return {
      phase: 'PREMARKET',
      label: 'Pre-Market',
      emoji: '🌅',
      description: 'Market opens soon. Crypto running, scanning for opening plays.',
      minutesUntilNext: MARKET_OPEN - totalMinutes,
      nextPhaseName: 'Market Open',
      cryptoActive: true, stocksActive: false, forexActive: true,
    }
  }
  if (totalMinutes >= MARKET_OPEN && totalMinutes < MARKET_CLOSE) {
    return {
      phase: 'STOCK_MARKET',
      label: 'Market Hours',
      emoji: '📈',
      description: 'US market open. Stocks, penny stocks, pump & dump shorts, crypto & forex all active.',
      minutesUntilNext: MARKET_CLOSE - totalMinutes,
      nextPhaseName: 'After Hours',
      cryptoActive: true, stocksActive: true, forexActive: true,
    }
  }
  // After hours
  return {
    phase: 'AFTER_HOURS',
    label: 'After Hours',
    emoji: '🌆',
    description: 'Market closed. After-hours movers, crypto & forex active.',
    minutesUntilNext: minsUntil(AFTER_HOURS_END % 1440 === 0 ? 0 : AFTER_HOURS_END),
    nextPhaseName: 'Crypto Night',
    cryptoActive: true, stocksActive: false, forexActive: true,
  }
}
