/**
 * Academy auto-managed orders — server-only (imports getQuote). No Anthropic
 * calls, so the monitor is cheap and never touches API credits.
 *
 * Two entry points:
 *   placeOrder()            — market (fills now) or limit (pending) entry,
 *                             optionally with a bracket plan (stop/T1/T2).
 *   monitorAcademyOrders()  — fills due limit orders and manages open bracket
 *                             positions (scaled half/half exits + stop→breakeven).
 *
 * Called by the user-facing routes AND the per-minute cron, so brackets are
 * managed whether or not the desk is open.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getQuote } from '@/lib/yahoo-finance'
import { isUsMarketOpen } from '@/lib/market-data'
import type { AssetData } from '@/lib/market-data'
import { ACADEMY_SEED_CAPITAL, ACADEMY_MIN_TRADE_USD } from '@/lib/academy-config'
import { computeAccount } from '@/lib/academy-account'
import { scoreAssetFull, filterLongEntries, filterShortEntries } from '@/lib/trading-signals'

export interface EntryGate {
  verdict: 'GOOD' | 'WEAK' | 'BAD'
  reason: string
  matchedSetup?: string
}

/**
 * Judges a human order by the exact same bar the auto-bot holds its own
 * entries to (filterLongEntries/filterShortEntries) — not a separate,
 * invented heuristic. GOOD = a real, currently-firing setup in that
 * direction. WEAK = right direction but no confirmed setup yet (a guess,
 * not an edge). BAD = the setup is actually firing the other way — this
 * specific order has no real edge and gets blocked unless overridden.
 */
async function evaluateEntryGate(
  quote: { symbol: string; name: string; price: number; changePct: number },
  direction: 'LONG' | 'SHORT',
): Promise<EntryGate> {
  const asset: AssetData = {
    symbol: quote.symbol, name: quote.name, price: quote.price,
    change24h: quote.changePct, change7d: 0, assetType: 'stock',
  }
  const sig = await scoreAssetFull(asset)
  const passes = direction === 'LONG' ? filterLongEntries([sig]).length > 0 : filterShortEntries([sig]).length > 0
  const setupLabel = sig.setupTag.replace(/_/g, ' ').toLowerCase()
  if (passes) {
    return {
      verdict: 'GOOD',
      reason: `${setupLabel} setup, score ${sig.score.toFixed(1)} — a real, currently-firing setup in this direction.`,
      matchedSetup: sig.setupTag,
    }
  }
  if (sig.direction === direction) {
    return {
      verdict: 'WEAK',
      reason: `Right direction, but nothing confirmed yet (score ${sig.score.toFixed(1)}, ${setupLabel}) — a mild lean, not a real setup.`,
    }
  }
  return {
    verdict: 'BAD',
    reason: `The read here is actually ${sig.direction === 'LONG' ? 'bullish' : 'bearish'} (score ${sig.score.toFixed(1)}, ${setupLabel}) — going ${direction.toLowerCase()} fights it. No real edge for this trade.`,
  }
}

export interface MonitorEvent {
  kind: 'FILLED' | 'T1_HALF' | 'T2_CLOSE' | 'STOP' | 'CANCELLED' | 'EXPIRED'
  symbol: string
  detail: string
  pnl?: number
}

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
export type Tif = 'DAY' | 'GTC'

const round2 = (n: number) => Math.round(n * 100) / 100
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** ISO timestamp of the next 4pm ET (session close) — for DAY order expiry. */
function nextSessionCloseISO(): string {
  let etMin: number
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date())
    const [h, m] = s.split(':').map((n) => parseInt(n, 10))
    etMin = h * 60 + m
  } catch {
    const d = new Date(); etMin = d.getUTCHours() * 60 + d.getUTCMinutes()
  }
  let minsUntil = 16 * 60 - etMin
  if (minsUntil <= 0) minsUntil += 24 * 60
  return new Date(Date.now() + minsUntil * 60_000).toISOString()
}

async function getCash(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase.from('academy_portfolio').select('cash').eq('user_id', userId).single()
  if (data) return Number(data.cash)
  await supabase.from('academy_portfolio').insert({ user_id: userId, cash: ACADEMY_SEED_CAPITAL })
  return ACADEMY_SEED_CAPITAL
}
async function setCash(supabase: SupabaseClient, userId: string, cash: number): Promise<void> {
  await supabase.from('academy_portfolio')
    .update({ cash: round2(cash), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
}

export interface PlaceOrderParams {
  symbol: string
  direction: 'LONG' | 'SHORT'
  shares: number
  /** Webull order type. MARKET fills now; the rest rest as working orders. */
  orderType: OrderType
  tif?: Tif
  limitPrice?: number | null     // LIMIT / STOP_LIMIT
  stopTrigger?: number | null    // STOP / STOP_LIMIT trigger price
  // optional bracket plan applied on fill
  stopPrice?: number | null
  target1Price?: number | null
  target2Price?: number | null
  /** Resubmit with this after a BAD-gate rejection to place it anyway. */
  overrideGate?: boolean
}

export interface PlaceOrderResult {
  ok: boolean
  error?: string
  status: number
  filled?: boolean
  message?: string
  gate?: EntryGate
  needsOverride?: boolean
}

/** Place a market (immediate) or limit (pending) order, optionally bracketed. */
export async function placeOrder(
  supabase: SupabaseClient,
  userId: string,
  p: PlaceOrderParams,
): Promise<PlaceOrderResult> {
  const symbol = p.symbol.toUpperCase().trim()
  if (!/^[A-Z.]{1,10}$/.test(symbol)) return { ok: false, error: 'Enter a valid ticker', status: 400 }
  if (!(p.shares > 0)) return { ok: false, error: 'Shares must be greater than 0', status: 400 }

  // Stocks-only practice: no orders when the US market is closed.
  if (!isUsMarketOpen()) {
    return { ok: false, error: 'US market is closed (opens 9:30am–4:00pm ET, weekdays). Orders can only be placed during market hours.', status: 409 }
  }

  const hasBracket = p.stopPrice != null || p.target1Price != null || p.target2Price != null

  let quote
  try { quote = await getQuote(symbol) } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Quote failed', status: 502 }
  }

  // Already have a position in this symbol? (one per symbol, like the engine)
  const { data: existing } = await supabase
    .from('academy_positions').select('id').eq('user_id', userId).eq('symbol', symbol).maybeSingle()
  if (existing) return { ok: false, error: `Already have an open position in ${symbol} — close it first.`, status: 409 }

  // Account state: PDT + buying power gate every opening order.
  const account = await computeAccount(supabase, userId)
  if (account.pdtRestricted) {
    return { ok: false, error: `Pattern Day Trader rule: you've used ${account.dayTradesUsed} day trades in 5 sessions and your equity is under $${(25000).toLocaleString()}. You can't open new positions until that clears (close-only).`, status: 403 }
  }

  const tif: Tif = p.tif === 'GTC' ? 'GTC' : 'DAY'

  // Same bar the bot holds its own entries to — block a no-edge order unless
  // explicitly overridden; let GOOD/WEAK through (WEAK still gets surfaced).
  const gate = await evaluateEntryGate(quote, p.direction)
  if (gate.verdict === 'BAD' && !p.overrideGate) {
    return { ok: false, error: gate.reason, status: 422, gate, needsOverride: true }
  }

  // ── Working orders (LIMIT / STOP / STOP_LIMIT) → rest until triggered ──
  if (p.orderType !== 'MARKET') {
    if ((p.orderType === 'LIMIT' || p.orderType === 'STOP_LIMIT') && !(Number(p.limitPrice) > 0)) {
      return { ok: false, error: 'Enter a limit price', status: 400 }
    }
    if ((p.orderType === 'STOP' || p.orderType === 'STOP_LIMIT') && !(Number(p.stopTrigger) > 0)) {
      return { ok: false, error: 'Enter a stop trigger price', status: 400 }
    }
    const { error } = await supabase.from('academy_orders').insert({
      user_id: userId, symbol, name: quote.name, direction: p.direction,
      order_type: p.orderType, tif,
      shares: round6(p.shares),
      limit_price: p.orderType === 'STOP' ? null : p.limitPrice,
      stop_trigger: p.stopTrigger ?? null,
      stop_price: p.stopPrice ?? null, target1_price: p.target1Price ?? null, target2_price: p.target2Price ?? null,
      status: 'PENDING',
      expires_at: tif === 'DAY' ? nextSessionCloseISO() : null,
    })
    if (error) return { ok: false, error: error.message, status: 500 }
    const trigWord = p.orderType === 'STOP' || p.orderType === 'STOP_LIMIT'
      ? `triggers at $${Number(p.stopTrigger).toFixed(2)}`
      : `fills when ${symbol} ${p.direction === 'LONG' ? 'drops to' : 'rises to'} $${Number(p.limitPrice).toFixed(2)}`
    return { ok: true, status: 200, filled: false, message: `${p.orderType.replace('_', ' ')} order working (${tif}) — ${trigWord}.`, gate }
  }

  // ── MARKET entry → fill now ──
  const price = quote.price
  const shares = round6(p.shares)
  const cost = round2(price * shares)
  if (cost < ACADEMY_MIN_TRADE_USD) return { ok: false, error: `Order too small (min $${ACADEMY_MIN_TRADE_USD})`, status: 400 }
  if (cost > account.buyingPower) {
    return { ok: false, error: `Exceeds buying power ($${account.buyingPower.toFixed(2)} available with 2× margin)`, status: 400 }
  }
  const cash = await getCash(supabase, userId)   // may go negative (margin loan)

  const { data: trade } = await supabase.from('academy_trades').insert({
    user_id: userId, symbol, name: quote.name, action: 'BUY', direction: p.direction,
    shares, price, total: cost, pnl: null,
    declared_stop_loss: p.stopPrice ?? null, declared_take_profit: p.target1Price ?? null,
    thesis: hasBracket ? 'Auto-managed bracket entry' : 'Market entry',
  }).select('id').single()

  const { error: posErr } = await supabase.from('academy_positions').insert({
    user_id: userId, symbol, name: quote.name, direction: p.direction,
    shares, avg_entry_price: price, entry_trade_id: trade?.id ?? null,
    managed: hasBracket, original_shares: shares, half_closed: false,
    stop_price: p.stopPrice ?? null, target1_price: p.target1Price ?? null, target2_price: p.target2Price ?? null,
    declared_stop_loss: p.stopPrice ?? null, declared_take_profit: p.target1Price ?? null,
  })
  if (posErr) return { ok: false, error: posErr.message, status: 500 }

  await setCash(supabase, userId, cash - cost)
  return {
    ok: true, status: 200, filled: true, gate,
    message: hasBracket ? `Bought ${shares} ${symbol} @ $${price.toFixed(2)} — bracket is now being managed.` : `Bought ${shares} ${symbol} @ $${price.toFixed(2)}.`,
  }
}

/** Fill due limit orders + manage open bracket positions for one user. */
export async function monitorAcademyOrders(
  supabase: SupabaseClient,
  userId: string,
): Promise<MonitorEvent[]> {
  const events: MonitorEvent[] = []

  const { data: orders } = await supabase
    .from('academy_orders').select('*').eq('user_id', userId).eq('status', 'PENDING')
  const { data: positions } = await supabase
    .from('academy_positions').select('*').eq('user_id', userId).eq('managed', true)

  const pending = orders ?? []
  const managed = positions ?? []
  if (pending.length === 0 && managed.length === 0) return events

  // Price every symbol once
  const symbols = [...new Set([...pending.map((o) => o.symbol), ...managed.map((p) => p.symbol)])]
  const priceMap = new Map<string, number>()
  await Promise.all(symbols.map(async (sym) => {
    try { priceMap.set(sym, (await getQuote(sym)).price) } catch { /* skip this tick */ }
  }))

  let cash = await getCash(supabase, userId)

  const nowMs = Date.now()

  // ── 1. Trigger/fill working orders (LIMIT / STOP / STOP_LIMIT) ──
  for (const o of pending) {
    // DAY orders expire at the session close
    if (o.tif === 'DAY' && o.expires_at && new Date(o.expires_at).getTime() < nowMs) {
      await supabase.from('academy_orders').update({ status: 'CANCELLED', note: 'Expired (DAY)' }).eq('id', o.id)
      events.push({ kind: 'EXPIRED', symbol: o.symbol, detail: `${o.symbol} day order expired unfilled.` })
      continue
    }

    const price = priceMap.get(o.symbol)
    if (price == null) continue
    const isLong = o.direction === 'LONG'
    const orderType = (o.order_type as OrderType) ?? 'LIMIT'
    const limit = o.limit_price != null ? Number(o.limit_price) : null
    const trigger = o.stop_trigger != null ? Number(o.stop_trigger) : null

    let doFill = false
    let fillPrice = price
    if (orderType === 'LIMIT' && limit != null) {
      doFill = isLong ? price <= limit : price >= limit
      fillPrice = limit
    } else if (orderType === 'STOP' && trigger != null) {
      doFill = isLong ? price >= trigger : price <= trigger   // buy-stop / sell-stop → market on trigger
      fillPrice = price
    } else if (orderType === 'STOP_LIMIT' && trigger != null && limit != null) {
      const triggered = isLong ? price >= trigger : price <= trigger
      const withinLimit = isLong ? price <= limit : price >= limit
      doFill = triggered && withinLimit
      fillPrice = limit
    }
    if (!doFill) continue

    const shares = Number(o.shares)
    const cost = round2(fillPrice * shares)
    // Margin account: filling may draw cash negative (a margin loan). Buying
    // power was gated at placement; we let resting orders fill here.
    const hasBracket = o.stop_price != null || o.target1_price != null || o.target2_price != null
    const { data: trade } = await supabase.from('academy_trades').insert({
      user_id: userId, symbol: o.symbol, name: o.name, action: isLong ? 'BUY' : 'SELL', direction: o.direction,
      shares, price: fillPrice, total: cost, pnl: null, thesis: `${orderType} order filled`,
    }).select('id').single()
    await supabase.from('academy_positions').insert({
      user_id: userId, symbol: o.symbol, name: o.name, direction: o.direction,
      shares, avg_entry_price: fillPrice, entry_trade_id: trade?.id ?? null,
      managed: hasBracket, original_shares: shares, half_closed: false,
      stop_price: o.stop_price, target1_price: o.target1_price, target2_price: o.target2_price,
      declared_stop_loss: o.stop_price, declared_take_profit: o.target1_price,
    })
    await supabase.from('academy_orders').update({ status: 'FILLED', filled_at: new Date().toISOString() }).eq('id', o.id)
    cash = round2(cash - cost)
    events.push({ kind: 'FILLED', symbol: o.symbol, detail: `${o.symbol} filled: ${shares} @ $${fillPrice.toFixed(2)}.` })
  }

  // ── 2. Manage open bracket positions ──
  for (const pos of managed) {
    const price = priceMap.get(pos.symbol)
    if (price == null) continue
    const isLong = pos.direction !== 'SHORT'
    const entry = Number(pos.avg_entry_price)
    const shares = Number(pos.shares)
    const original = Number(pos.original_shares ?? shares)
    let stop = pos.stop_price != null ? Number(pos.stop_price) : null
    const t1 = pos.target1_price != null ? Number(pos.target1_price) : null
    const t2 = pos.target2_price != null ? Number(pos.target2_price) : null
    const halfClosed = !!pos.half_closed

    // Trailing stop: ratchet the anchor toward favorable price, derive a
    // trailing stop level, and treat it as the (tighter) effective stop.
    const trailPct = pos.trail_percent != null ? Number(pos.trail_percent) : null
    if (trailPct != null && trailPct > 0) {
      const prevAnchor = pos.trail_anchor != null ? Number(pos.trail_anchor) : entry
      const anchor = isLong ? Math.max(prevAnchor, price) : Math.min(prevAnchor, price)
      const trailStop = isLong ? anchor * (1 - trailPct / 100) : anchor * (1 + trailPct / 100)
      if (anchor !== prevAnchor) {
        await supabase.from('academy_positions').update({ trail_anchor: round2(anchor) }).eq('id', pos.id)
      }
      // Effective stop is the tighter of hard stop and trailing stop
      stop = stop == null ? trailStop : (isLong ? Math.max(stop, trailStop) : Math.min(stop, trailStop))
    }

    const hitStop = stop != null && (isLong ? price <= stop : price >= stop)
    const hitT2 = t2 != null && (isLong ? price >= t2 : price <= t2)
    const hitT1 = t1 != null && (isLong ? price >= t1 : price <= t1)

    const closeAll = async (reason: MonitorEvent['kind'], label: string) => {
      const pnl = round2(isLong ? (price - entry) * shares : (entry - price) * shares)
      await supabase.from('academy_trades').insert({
        user_id: userId, symbol: pos.symbol, name: pos.name,
        action: isLong ? 'SELL' : 'BUY', direction: pos.direction,
        shares, price, total: round2(price * shares), pnl,
        thesis: label, entry_trade_id: pos.entry_trade_id ?? null,
      })
      await supabase.from('academy_positions').delete().eq('id', pos.id)
      cash = round2(cash + (isLong ? price * shares : entry * shares + pnl))
      events.push({ kind: reason, symbol: pos.symbol, detail: `${label} — ${shares} @ $${price.toFixed(2)}`, pnl })
    }

    if (hitStop) { await closeAll('STOP', halfClosed ? 'Stop at break-even' : 'Stop loss hit'); continue }
    if (hitT2) { await closeAll('T2_CLOSE', 'Target 2 — closed remainder'); continue }

    if (hitT1 && !halfClosed && t1 != null) {
      const half = round6(Math.min(original / 2, shares))
      if (half <= 0) continue
      const remaining = round6(shares - half)
      const pnl = round2(isLong ? (price - entry) * half : (entry - price) * half)
      await supabase.from('academy_trades').insert({
        user_id: userId, symbol: pos.symbol, name: pos.name,
        action: isLong ? 'SELL' : 'BUY', direction: pos.direction,
        shares: half, price, total: round2(price * half), pnl,
        thesis: 'Target 1 — sold half, stop moved to break-even', entry_trade_id: pos.entry_trade_id ?? null,
      })
      // Remaining half: stop moves to break-even (entry)
      await supabase.from('academy_positions').update({
        shares: remaining, half_closed: true, stop_price: entry,
        declared_stop_loss: entry,
      }).eq('id', pos.id)
      cash = round2(cash + (isLong ? price * half : entry * half + pnl))
      events.push({ kind: 'T1_HALF', symbol: pos.symbol, detail: `Target 1 hit: sold ${half} @ $${price.toFixed(2)}, stop moved to break-even ($${entry.toFixed(2)}).`, pnl })
    }
  }

  await setCash(supabase, userId, cash)
  return events
}
