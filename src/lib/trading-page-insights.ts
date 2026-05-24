/**
 * Human-readable engine status for the trading dashboard.
 * Turns noisy tick events into one calm sentence.
 */

export interface TickEventLike {
  type: string
  symbol: string
  reason: string
  ts: number
}

export interface EngineInsight {
  headline: string
  detail: string
  tone: 'ok' | 'warn' | 'idle' | 'blocked'
  blockers: string[]
}

const BLOCKER_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /Daily loss limit/i, label: 'Daily loss limit reached' },
  { pattern: /Deep drawdown|Hard stop/i, label: 'Deep drawdown — micro-size entries only' },
  { pattern: /Recovery mode/i, label: 'Recovery mode — only top signals' },
  { pattern: /Cautious mode/i, label: 'Cautious mode — smaller size, higher bar' },
  { pattern: /Bear regime/i, label: 'Bear regime — crypto longs blocked' },
  { pattern: /Neutral regime/i, label: 'Neutral BTC — weak crypto signals filtered' },
  { pattern: /blocked.*crypto short/i, label: 'Shorts blocked — not in bear regime' },
  { pattern: /Multi-loss block/i, label: 'Symbol cooldown after repeated losses' },
  { pattern: /Auto-trading paused/i, label: 'Auto-trading is paused' },
  { pattern: /Apex veto/i, label: 'Apex veto on a recent setup' },
  { pattern: /hot window|high-volatility window/i, label: 'Outside crypto/stock hot window' },
]

export function extractBlockersFromEvents(events: TickEventLike[]): string[] {
  const found = new Set<string>()
  for (const e of events.slice(0, 40)) {
    if (e.type !== 'HOLD') continue
    for (const { pattern, label } of BLOCKER_PATTERNS) {
      if (pattern.test(e.reason)) found.add(label)
    }
  }
  return [...found].slice(0, 4)
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400_000)
}

export function deriveEngineInsight(params: {
  events: TickEventLike[]
  autoTradingEnabled: boolean
  openPositions: number
  lastTradeAt: string | null
  phaseLabel?: string
  cryptoActive?: boolean
}): EngineInsight {
  const blockers = extractBlockersFromEvents(params.events)
  const daysIdle = daysSince(params.lastTradeAt)

  if (!params.autoTradingEnabled) {
    return {
      headline: 'Auto-trading is off',
      detail: 'Turn it back on in Supabase or Strategy Lab when you want the engine to enter trades again.',
      tone: 'blocked',
      blockers: ['Auto-trading is paused', ...blockers],
    }
  }

  if (blockers.some((b) => b.includes('hard stop') || b.includes('Daily loss'))) {
    return {
      headline: 'Engine is protecting capital',
      detail: 'New entries are blocked until conditions reset. Exits on open positions still run.',
      tone: 'blocked',
      blockers,
    }
  }

  if (params.openPositions > 0) {
    return {
      headline: `Managing ${params.openPositions} open position${params.openPositions > 1 ? 's' : ''}`,
      detail: 'The engine is watching exits. It will not add conflicting size unless slots allow.',
      tone: 'ok',
      blockers,
    }
  }

  if (daysIdle != null && daysIdle >= 2) {
    const idleNote = daysIdle === 1
      ? 'Last trade was yesterday.'
      : `No new entries in ${daysIdle} days — scans still run every ~1 min on the server.`
    const blockerNote = blockers.length > 0
      ? ` Likely reasons: ${blockers.slice(0, 2).join('; ')}.`
      : ' No setup has cleared score, regime, and time-window filters lately.'
    return {
      headline: 'Watching — no qualifying setups',
      detail: idleNote + blockerNote + (params.cryptoActive
        ? ' Crypto markets are open 24/7; the bot only trades when rules align, not every move.'
        : ''),
      tone: 'idle',
      blockers,
    }
  }

  if (blockers.length > 0) {
    return {
      headline: 'Scanning — filters are tight right now',
      detail: blockers.join(' · '),
      tone: 'warn',
      blockers,
    }
  }

  return {
    headline: params.phaseLabel ? `Active — ${params.phaseLabel}` : 'Engine is running',
    detail: 'Waiting for a setup that passes score, regime, and risk checks.',
    tone: 'ok',
    blockers,
  }
}

/** Activity feed: trades, exits, and Apex vetoes only */
export function isSignificantEvent(e: TickEventLike): boolean {
  if (e.type === 'LONG_BUY' || e.type === 'LONG_SELL' || e.type === 'SHORT_OPEN' || e.type === 'SHORT_COVER') {
    return true
  }
  if (e.type === 'HOLD' && e.reason.includes('🛡️ Apex veto')) return true
  return false
}
