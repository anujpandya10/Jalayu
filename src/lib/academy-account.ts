/**
 * Webull-style account math — server-only (reads DB + quotes).
 *
 * Models a margin account at a teaching level of fidelity:
 *   • Net account value (equity) = cash + market value of positions
 *   • Buying power      = 2× equity − gross exposure   (Reg T 2:1)
 *   • Day-trade BP      = 4× equity − gross exposure   (intraday 4:1)
 *   • Cash may go negative (a margin loan) as you use buying power.
 *   • Maintenance call flagged if equity < 25% of long exposure.
 *   • PDT: a "day trade" = open+close the same symbol same day. Under
 *     $25k equity, 3 day trades in the last 5 sessions restricts opening new
 *     positions (mirrors the Pattern Day Trader rule).
 *
 * This is a faithful approximation to teach the constraints, not a prime broker.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getQuote } from '@/lib/yahoo-finance'
import { ACADEMY_SEED_CAPITAL } from '@/lib/academy-config'

export const PDT_EQUITY_THRESHOLD = 25_000
export const PDT_DAYTRADE_LIMIT = 3   // 3 used → a 4th would make you a pattern day trader

export interface AccountSummary {
  cash: number
  equity: number              // net account value
  longMarketValue: number
  shortMarketValue: number
  buyingPower: number
  dayTradeBuyingPower: number
  openPnl: number             // unrealized
  realizedToday: number
  totalPnl: number            // equity − seed
  seed: number
  dayTradesUsed: number
  pdtRestricted: boolean
  marginCall: boolean
  openPositions: number
}

function etDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/** Count day trades (open+close same symbol same ET day) over the last ~5 sessions. */
export async function countDayTrades(supabase: SupabaseClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - 9 * 86_400_000).toISOString() // ~5 business days of cushion
  const { data: trades } = await supabase
    .from('academy_trades')
    .select('symbol, pnl, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  const opensByKey = new Set<string>()
  let dayTrades = 0
  const counted = new Set<string>()
  for (const t of trades ?? []) {
    const key = `${t.symbol}|${etDateKey(new Date(t.created_at as string))}`
    if (t.pnl == null) {
      opensByKey.add(key)
    } else if (opensByKey.has(key) && !counted.has(key)) {
      dayTrades++
      counted.add(key)   // one day trade per symbol/day round-trip
    }
  }
  return dayTrades
}

export async function computeAccount(supabase: SupabaseClient, userId: string): Promise<AccountSummary> {
  const { data: pf } = await supabase.from('academy_portfolio').select('cash').eq('user_id', userId).single()
  const cash = Number(pf?.cash ?? ACADEMY_SEED_CAPITAL)

  const { data: positionsRaw } = await supabase
    .from('academy_positions').select('symbol, direction, shares, avg_entry_price').eq('user_id', userId)
  const positions = positionsRaw ?? []

  const priceMap = new Map<string, number>()
  await Promise.all([...new Set(positions.map((p) => p.symbol))].map(async (sym) => {
    try { priceMap.set(sym, (await getQuote(sym)).price) } catch { /* use entry as fallback */ }
  }))

  let longMV = 0, shortMV = 0, positionsEquity = 0, openPnl = 0
  for (const p of positions) {
    const shares = Number(p.shares)
    const entry = Number(p.avg_entry_price)
    const price = priceMap.get(p.symbol) ?? entry
    const isShort = p.direction === 'SHORT'
    const pnl = isShort ? (entry - price) * shares : (price - entry) * shares
    openPnl += pnl
    if (isShort) { shortMV += price * shares; positionsEquity += entry * shares + pnl }
    else { longMV += price * shares; positionsEquity += price * shares }
  }

  const equity = cash + positionsEquity
  const gross = longMV + shortMV
  const buyingPower = Math.max(0, 2 * equity - gross)
  const dayTradeBuyingPower = Math.max(0, 4 * equity - gross)

  // Realized P&L today (ET)
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const { data: closed } = await supabase
    .from('academy_trades').select('pnl, created_at').eq('user_id', userId).not('pnl', 'is', null).gte('created_at', since)
  const todayKey = etDateKey(new Date())
  const realizedToday = (closed ?? [])
    .filter((t) => etDateKey(new Date(t.created_at as string)) === todayKey)
    .reduce((s, t) => s + Number(t.pnl), 0)

  const dayTradesUsed = await countDayTrades(supabase, userId)
  const pdtRestricted = equity < PDT_EQUITY_THRESHOLD && dayTradesUsed >= PDT_DAYTRADE_LIMIT
  const marginCall = longMV > 0 && equity < 0.25 * longMV

  const round = (n: number) => Math.round(n * 100) / 100
  return {
    cash: round(cash),
    equity: round(equity),
    longMarketValue: round(longMV),
    shortMarketValue: round(shortMV),
    buyingPower: round(buyingPower),
    dayTradeBuyingPower: round(dayTradeBuyingPower),
    openPnl: round(openPnl),
    realizedToday: round(realizedToday),
    totalPnl: round(equity - ACADEMY_SEED_CAPITAL),
    seed: ACADEMY_SEED_CAPITAL,
    dayTradesUsed,
    pdtRestricted,
    marginCall,
    openPositions: positions.length,
  }
}

/** Buying power only — cheaper helper for the order path. */
export async function getBuyingPower(supabase: SupabaseClient, userId: string): Promise<number> {
  const acct = await computeAccount(supabase, userId)
  return acct.buyingPower
}
