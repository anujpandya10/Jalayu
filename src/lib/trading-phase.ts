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

  function minsUntil(target: number): number {
    return target > totalMinutes ? target - totalMinutes : (1440 - totalMinutes) + target
  }

  // Minutes until next Monday 08:00 UTC (used over weekends)
  function minsUntilMondayPremarket(): number {
    const daysUntilMon = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7 // Sun→1, Sat→2
    const minsToMidnight = 1440 - totalMinutes
    return minsToMidnight + (daysUntilMon - 1) * 1440 + PREMARKET_START
  }

  if (!isWeekday || totalMinutes >= MARKET_CLOSE || totalMinutes < PREMARKET_START) {
    // On weekends, count to next Monday pre-market instead of next midnight cycle
    const minsUntilNext = !isWeekday
      ? minsUntilMondayPremarket()
      : minsUntil(PREMARKET_START)
    return {
      phase: 'CRYPTO_NIGHT',
      label: 'Crypto Night Mode',
      emoji: '🌙',
      description: 'Building capital overnight. Crypto scalping 24/7.',
      minutesUntilNext: minsUntilNext,
      nextPhaseName: 'Pre-Market',
      cryptoActive: true, stocksActive: false, forexActive: true,
    }
  }
  if (totalMinutes >= PREMARKET_START && totalMinutes < MARKET_OPEN) {
    return {
      phase: 'PREMARKET',
      label: 'Pre-Market',
      emoji: '🌅',
      description: 'US pre-market open. Scanning stocks, crypto & forex for opening plays.',
      minutesUntilNext: MARKET_OPEN - totalMinutes,
      nextPhaseName: 'Market Open',
      // Stocks ARE fetched and scanned during pre-market — reflect that in the badge
      cryptoActive: true, stocksActive: true, forexActive: true,
    }
  }
  if (totalMinutes >= MARKET_OPEN && totalMinutes < MARKET_CLOSE) {
    return {
      phase: 'STOCK_MARKET',
      label: 'Market Hours',
      emoji: '📈',
      description: 'US market open. Stocks, crypto & forex all active.',
      minutesUntilNext: MARKET_CLOSE - totalMinutes,
      nextPhaseName: 'After Hours',
      cryptoActive: true, stocksActive: true, forexActive: true,
    }
  }
  // After hours (20:00–00:00 UTC)
  return {
    phase: 'AFTER_HOURS',
    label: 'After Hours',
    emoji: '🌆',
    description: 'Market closed. After-hours movers, crypto & forex active.',
    minutesUntilNext: 1440 - totalMinutes, // mins until midnight → CRYPTO_NIGHT
    nextPhaseName: 'Crypto Night',
    cryptoActive: true, stocksActive: false, forexActive: true,
  }
}
