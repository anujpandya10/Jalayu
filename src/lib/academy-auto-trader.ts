/**
 * Academy Auto Trader — a fully separate $1000 paper account that trades
 * itself: US stocks only, market hours only, using the exact same setup
 * logic the curriculum teaches (trading-signals.ts) and the same
 * break-even/trailing-stop risk discipline the main bot runs on
 * (trading-config.ts). Every decision is narrated to academy_auto_log in
 * plain English with the EMA9/EMA21/VWAP/RSI snapshot that drove it, so it
 * can be watched and learned from, not just trusted blindly.
 *
 * Fully isolated from academy_positions (manual desk) and paper_positions
 * (main multi-asset bot) — none of the three ever touch each other.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAllAssets, isUsMarketOpen, type AssetData } from '@/lib/market-data'
import { getQuote } from '@/lib/yahoo-finance'
import { scoreAssetFull, filterLongEntries, filterShortEntries, type Signal } from '@/lib/trading-signals'
import {
  getTpSl, MIN_TRADE_USD, BREAKEVEN_LOCK_PCT, TRAIL_TRIGGER_PCT, TRAIL_DISTANCE_PCT,
} from '@/lib/trading-config'
import { ACADEMY_CURRICULUM } from '@/lib/academy-curriculum'

export const AUTO_SEED_CAPITAL = 1000
const MAX_SLOTS = 3
const MAX_POSITION_PCT = 0.32
const COOLDOWN_MINUTES = 20
const PREP_START_MIN_ET = 9 * 60 + 15  // 9:15am ET — 15 min before the open
const MARKET_OPEN_MIN_ET = 9 * 60 + 30

const r2 = (n: number) => Math.round(n * 100) / 100
const r6 = (n: number) => Math.round(n * 1e6) / 1e6
const fmt = (n: number) => `$${n.toFixed(2)}`

/** The curriculum chapter (legendary trader) behind a given setup tag, if any. */
function legendFor(setupTag: string) {
  return ACADEMY_CURRICULUM.find((c) => c.mappedSetupTags.includes(setupTag)) ?? null
}

function nowEt(): { minutesOfDay: number; dateKey: string; weekday: string } {
  const fmtParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => fmtParts.find((p) => p.type === t)?.value ?? ''
  const hh = parseInt(get('hour'), 10)
  const mm = parseInt(get('minute'), 10)
  return { minutesOfDay: hh * 60 + mm, dateKey: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday') }
}

async function getPortfolio(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('academy_auto_portfolio').select('*').eq('user_id', userId).maybeSingle()
  if (data) return data
  const { data: created } = await supabase
    .from('academy_auto_portfolio').insert({ user_id: userId, cash: AUTO_SEED_CAPITAL, enabled: false }).select().single()
  return created
}

async function log(
  supabase: SupabaseClient, userId: string,
  row: { symbol?: string; kind: string; note: string; price?: number; shares?: number; pnl?: number; ema9?: number | null; ema21?: number | null; vwap?: number | null; rsi?: number | null },
) {
  await supabase.from('academy_auto_log').insert({ user_id: userId, ...row })
}

interface RunResult { ran: boolean; reason?: string; events: string[] }

/**
 * Once per trading day, at/after 9:15am ET: arm the bot for the day (so it
 * starts itself without a manual click) and narrate a pre-market watchlist —
 * the same "scan, pick a few, explain why" routine before any order goes in.
 * Gated by last_session_date so it only fires once per day no matter how
 * often the cron/client tick calls in. Mutates `portfolio` in place so the
 * rest of this tick sees the freshly-armed state immediately.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function maybeRunMorningKickoff(supabase: SupabaseClient, userId: string, portfolio: any, events: string[]) {
  if (!portfolio.auto_start) return
  const { minutesOfDay, dateKey, weekday } = nowEt()
  if (weekday === 'Sat' || weekday === 'Sun') return
  if (minutesOfDay < PREP_START_MIN_ET) return
  if (portfolio.last_session_date === dateKey) return

  await supabase.from('academy_auto_portfolio')
    .update({ enabled: true, last_session_date: dateKey, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  portfolio.enabled = true
  portfolio.last_session_date = dateKey

  const minsToOpen = MARKET_OPEN_MIN_ET - minutesOfDay
  await log(supabase, userId, {
    kind: 'INFO',
    note: minsToOpen > 0
      ? `Good morning. Markets open in ${minsToOpen} minute${minsToOpen === 1 ? '' : 's'} — starting pre-market prep. Today's plan is the same as every day: small, defined losses are fine and expected — the discipline is letting winners run further than the losers cost. Let's see how it goes.`
      : `Good morning. Markets are already open — starting today's session. Small, defined losses are fine — the discipline is letting winners run further than losers cost.`,
  })
  events.push('Started morning prep')

  try {
    const assets = (await getAllAssets()).filter((a) => a.assetType === 'stock')
    const scored = await Promise.allSettled(assets.map((a) => scoreAssetFull(a)))
    const signals = scored.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<Signal>).value)
    const ranked = signals.filter((s) => s.setupTag !== 'UNTAGGED').sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 5)

    if (ranked.length === 0) {
      await log(supabase, userId, { kind: 'SCAN', note: `Scanned ${assets.length} stocks — nothing with a confirmed setup yet. I'll keep watching as the open gets closer.` })
    } else {
      for (const sig of ranked) {
        const chapter = legendFor(sig.setupTag)
        const ind = sig.indicators
        const legendNote = chapter ? ` This is ${chapter.trader}'s territory — ${chapter.coreIdea}` : ''
        await log(supabase, userId, {
          symbol: sig.asset.symbol, kind: 'SCAN', price: sig.asset.price,
          ema9: ind?.ema9 ?? null, ema21: ind?.ema21 ?? null, vwap: ind?.vwap ?? null, rsi: ind?.rsi ?? null,
          note: `Watching ${sig.asset.symbol} for the open (score ${sig.score.toFixed(1)}, ${sig.setupTag.replace(/_/g, ' ').toLowerCase()}) — ${sig.reason}.${legendNote}`,
        })
      }
      events.push(`Built today's watchlist: ${ranked.map((s) => s.asset.symbol).join(', ')}`)
    }
  } catch {
    // best effort — a failed morning scan shouldn't block the rest of the tick
  }
}

export async function runAutoTraderTick(supabase: SupabaseClient, userId: string): Promise<RunResult> {
  const events: string[] = []
  const portfolio = await getPortfolio(supabase, userId)
  if (!portfolio) return { ran: false, reason: 'no portfolio', events }

  await maybeRunMorningKickoff(supabase, userId, portfolio, events)

  if (!isUsMarketOpen()) return { ran: events.length > 0, reason: 'Market closed', events }
  if (!portfolio.enabled) return { ran: false, reason: 'Auto trader is off', events }

  let cash = Number(portfolio.cash)

  const { data: openRaw } = await supabase.from('academy_auto_positions').select('*').eq('user_id', userId)
  const open = openRaw ?? []

  // Price every open symbol once via a live quote, then run it through the
  // real engine read (gives indicators too). Works for any ticker, not just
  // the bot's fixed scan universe.
  const signalBySymbol = new Map<string, Signal>()
  await Promise.all(open.map(async (pos) => {
    try {
      const quote = await getQuote(pos.symbol)
      const asset: AssetData = { symbol: pos.symbol, name: quote.name ?? pos.name ?? pos.symbol, price: quote.price, change24h: quote.changePct, change7d: 0, assetType: 'stock' }
      const sig = await scoreAssetFull(asset)
      signalBySymbol.set(pos.symbol, sig)
    } catch { /* skip this symbol this tick */ }
  }))

  // ── 1. Manage open positions: half-close at T1 + move stop to breakeven, trail, exit at T2/stop ──
  for (const pos of open) {
    const sig = signalBySymbol.get(pos.symbol)
    if (!sig?.indicators) continue
    const price = sig.asset.price
    const ind = sig.indicators
    const isLong = pos.direction === 'LONG'
    const entry = Number(pos.avg_entry_price)
    const shares = Number(pos.shares)
    const original = Number(pos.original_shares)
    let stop = pos.stop_price != null ? Number(pos.stop_price) : null
    const t1 = pos.target1_price != null ? Number(pos.target1_price) : null
    const t2 = pos.target2_price != null ? Number(pos.target2_price) : null
    const halfClosed = !!pos.half_closed

    // Trailing stop once the remaining half is running (post break-even)
    const pnlPct = isLong ? (price - entry) / entry : (entry - price) / entry
    if (halfClosed && pnlPct >= TRAIL_TRIGGER_PCT) {
      const trail = isLong ? price * (1 - TRAIL_DISTANCE_PCT) : price * (1 + TRAIL_DISTANCE_PCT)
      const improved = stop == null || (isLong ? trail > stop : trail < stop)
      if (improved) {
        const old = stop
        stop = trail
        await supabase.from('academy_auto_positions').update({ stop_price: r2(stop) }).eq('id', pos.id)
        await log(supabase, userId, {
          symbol: pos.symbol, kind: 'STOP_MOVED', price, shares,
          ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
          note: `${pos.symbol}: trailing the stop up to ${fmt(stop)} (was ${old != null ? fmt(old) : '—'}) — it's run far enough that locking in more profit matters more than giving it room.`,
        })
        events.push(`Trailed stop on ${pos.symbol} to ${fmt(stop)}`)
      }
    }

    const hitStop = stop != null && (isLong ? price <= stop : price >= stop)
    const hitT2 = t2 != null && (isLong ? price >= t2 : price <= t2)
    const hitT1 = t1 != null && (isLong ? price >= t1 : price <= t1)

    const closeAll = async (kind: 'STOP_HIT' | 'EXIT_FULL', why: string) => {
      const pnl = r2(isLong ? (price - entry) * shares : (entry - price) * shares)
      await supabase.from('academy_auto_trades').insert({
        user_id: userId, symbol: pos.symbol, name: pos.name, action: isLong ? 'SELL' : 'BUY', direction: pos.direction,
        shares, price, total: r2(price * shares), pnl, setup_tag: pos.setup_tag, reason: why,
        ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
      })
      await supabase.from('academy_auto_positions').delete().eq('id', pos.id)
      cash = r2(cash + (isLong ? price * shares : entry * shares + pnl))
      await log(supabase, userId, {
        symbol: pos.symbol, kind, price, shares, pnl,
        ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
        note: `${pos.symbol}: closed the remaining ${shares} shares at ${fmt(price)} (${pnl >= 0 ? '+' : ''}${fmt(pnl)}) — ${why}.`,
      })
      events.push(`Closed ${pos.symbol} ${pnl >= 0 ? '+' : ''}${fmt(pnl)}`)
    }

    if (hitStop) { await closeAll('STOP_HIT', halfClosed ? 'stop (now at break-even or better) was hit' : 'the stop-loss line was hit'); continue }
    if (hitT2) { await closeAll('EXIT_FULL', 'price reached the final target'); continue }

    if (hitT1 && !halfClosed && t1 != null) {
      const half = Math.min(original / 2, shares)
      if (half <= 0) continue
      const remaining = r6(shares - half)
      const pnl = r2(isLong ? (price - entry) * half : (entry - price) * half)
      const newStop = isLong ? entry * (1 + BREAKEVEN_LOCK_PCT) : entry * (1 - BREAKEVEN_LOCK_PCT)
      await supabase.from('academy_auto_trades').insert({
        user_id: userId, symbol: pos.symbol, name: pos.name, action: isLong ? 'SELL' : 'BUY', direction: pos.direction,
        shares: half, price, total: r2(price * half), pnl, setup_tag: pos.setup_tag, reason: 'Target 1 — sold half, stop moved to break-even',
        ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
      })
      await supabase.from('academy_auto_positions').update({ shares: r6(remaining), half_closed: true, stop_price: r2(newStop) }).eq('id', pos.id)
      cash = r2(cash + (isLong ? price * half : entry * half + pnl))
      await log(supabase, userId, {
        symbol: pos.symbol, kind: 'TAKE_HALF', price, shares: half, pnl,
        ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
        note: `${pos.symbol}: hit the first target, so I sold half (${half} shares) at ${fmt(price)} (+${fmt(pnl)}) and moved the stop on the other ${remaining} from ${pos.stop_price != null ? fmt(Number(pos.stop_price)) : '—'} up to ${fmt(newStop)} — break-even. The rest can't turn into a real loss from here; I'm just letting it run for free now.`,
      })
      events.push(`${pos.symbol}: took half at ${fmt(price)}, stop to break-even`)
    }
  }

  await supabase.from('academy_auto_portfolio').update({ cash, updated_at: new Date().toISOString() }).eq('user_id', userId)

  // ── 2. Scan for a new entry if a slot is free ──
  const { data: stillOpenRaw } = await supabase.from('academy_auto_positions').select('symbol').eq('user_id', userId)
  const heldSymbols = new Set((stillOpenRaw ?? []).map((p) => p.symbol))
  let slotsFree = MAX_SLOTS - heldSymbols.size
  if (slotsFree <= 0) return { ran: true, events }

  const { data: recentRaw } = await supabase
    .from('academy_auto_trades').select('symbol, created_at').eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString())
  const cooling = new Set((recentRaw ?? []).map((r) => r.symbol))

  const assets = (await getAllAssets()).filter((a) => a.assetType === 'stock' && !heldSymbols.has(a.symbol) && !cooling.has(a.symbol))
  if (assets.length === 0) return { ran: true, events }

  const scored = await Promise.allSettled(assets.map((a) => scoreAssetFull(a)))
  const signals = scored.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<Signal>).value)
  const longs = filterLongEntries(signals)
  const shorts = filterShortEntries(signals)
  const candidates = [...longs, ...shorts].sort((a, b) => Math.abs(b.score) - Math.abs(a.score))

  for (const sig of candidates) {
    if (slotsFree <= 0) break
    if (!sig.indicators) continue
    const direction: 'LONG' | 'SHORT' = sig.direction
    const price = sig.asset.price
    const ind = sig.indicators

    const equity = cash // approx: cash is the binding constraint for new entries
    const budget = Math.min(equity * MAX_POSITION_PCT, cash * 0.9)
    if (budget < MIN_TRADE_USD) continue
    const shares = r6(budget / price)
    const total = r2(price * shares)
    if (total > cash || total < MIN_TRADE_USD) continue

    const { tp, sl } = getTpSl(sig.setupTag, direction, 'stock')
    const isLong = direction === 'LONG'
    const stop = r2(isLong ? price * (1 - sl) : price * (1 + sl))
    const target2 = r2(isLong ? price * (1 + tp) : price * (1 - tp))
    const target1 = r2(isLong ? price + (target2 - price) / 2 : price - (price - target2) / 2)

    const { data: trade } = await supabase.from('academy_auto_trades').insert({
      user_id: userId, symbol: sig.asset.symbol, name: sig.asset.name, action: 'BUY', direction,
      shares, price, total, pnl: null, setup_tag: sig.setupTag, reason: sig.reason,
      ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
    }).select('id').single()

    const { error: posErr } = await supabase.from('academy_auto_positions').insert({
      user_id: userId, symbol: sig.asset.symbol, name: sig.asset.name, direction,
      shares, original_shares: shares, avg_entry_price: price,
      stop_price: stop, target1_price: target1, target2_price: target2, half_closed: false,
      setup_tag: sig.setupTag, entry_ema9: ind.ema9, entry_ema21: ind.ema21, entry_vwap: ind.vwap, entry_rsi: ind.rsi,
    })
    if (posErr) continue // symbol likely raced into a position already; skip

    cash = r2(cash - total)
    await supabase.from('academy_auto_portfolio').update({ cash, updated_at: new Date().toISOString() }).eq('user_id', userId)

    const trendNote = ind.ema9 >= ind.ema21 ? `EMA9 (${ind.ema9.toFixed(2)}) above EMA21 (${ind.ema21.toFixed(2)}) — trend is up` : `EMA9 (${ind.ema9.toFixed(2)}) below EMA21 (${ind.ema21.toFixed(2)}) — trend is down`
    const chapter = legendFor(sig.setupTag)
    const legendNote = chapter ? ` This is ${chapter.trader}'s territory — ${chapter.coreIdea}` : ''
    await log(supabase, userId, {
      symbol: sig.asset.symbol, kind: 'ENTRY', price, shares, pnl: 0,
      ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
      note: `${isLong ? 'Bought' : 'Shorted'} ${shares} shares of ${sig.asset.symbol} at ${fmt(price)} — ${sig.setupTag.replace(/_/g, ' ').toLowerCase()} setup (score ${sig.score.toFixed(1)}). ${trendNote}, RSI ${ind.rsi.toFixed(0)}, VWAP ${fmt(ind.vwap)}. Stop at ${fmt(stop)}, I'll sell half at ${fmt(target1)} and let the rest run to ${fmt(target2)}.${legendNote}`,
    })
    events.push(`Entered ${sig.asset.symbol} (${sig.setupTag}) at ${fmt(price)}`)
    void trade // id not currently needed downstream; kept for clarity/future linking
    slotsFree--
  }

  return { ran: true, events }
}
