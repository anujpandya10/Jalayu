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
import { getAllAssets, fetchExpandedStockUniverse, isUsMarketOpen, type AssetData } from '@/lib/market-data'
import { getQuote } from '@/lib/yahoo-finance'
import { scoreAssetFull, filterLongEntries, filterShortEntries, type Signal } from '@/lib/trading-signals'
import {
  getTpSl, MIN_TRADE_USD, BREAKEVEN_LOCK_PCT, TRAIL_TRIGGER_PCT,
} from '@/lib/trading-config'
import { ACADEMY_CURRICULUM } from '@/lib/academy-curriculum'

export const AUTO_SEED_CAPITAL = 1000
// Concentrate the $1000 into a couple of meaningful positions instead of
// sprinkling it across many tiny ones — a win has to move the account, not
// nudge it. Two ~$460 positions deploy ~92% of equity; the tight per-trade
// stop (≈0.4%) keeps the downside of that size to only a few dollars a trade,
// while the now-uncapped back half is what turns a real runner into a $20-80
// win. Bigger size barely changes the loss, but massively changes the win.
const MAX_SLOTS = 2
const MAX_POSITION_PCT = 0.46
const COOLDOWN_MINUTES = 8        // short leash — jump back into the same name once it resets up, don't sit out
const PREP_START_MIN_ET = 9 * 60 + 15      // 9:15am ET — 15 min before the open
const MARKET_OPEN_MIN_ET = 9 * 60 + 30
// Full-day session: the open is the most volatile window but movers show up
// all day (afternoon momentum, news-driven small caps) — stay scanning and
// in/out the whole session instead of stopping at lunch, flatten near the close.
const ENTRY_WINDOW_END_MIN_ET = 15 * 60 + 50   // no new entries after 3:50pm ET
const SESSION_FLATTEN_MIN_ET  = 15 * 60 + 55   // close anything still open at 3:55pm ET

// Risk discipline (the part that actually keeps an account alive):
const DAILY_LOSS_LIMIT_USD = 30   // down $30 on the day (−3%) → stop for the day, protect capital
const DAILY_PROFIT_LOCK_USD = 60  // up $60 (+6%) → strong day secured, tighten to top-conviction only (high enough that one good runner doesn't choke the day off)
const MAX_TRADES_PER_DAY = 16     // many small in/out trades, not a handful of big swings — cut losers fast, stack small wins

// Let winners run — the asymmetry that actually grows an account. The first
// half comes off at T1 to bank a sure profit and pay for the trade; the BACK
// half then rides a loose trailing stop with NO upper ceiling. Most trades
// still finish as small wins, but when a real runner shows up (a name going
// +10/20% intraday, the kind that was being clipped at +1.5% before), the back
// half captures most of it — one of those pays for a long string of small
// losses. This is the Livermore/PTJ lesson the curriculum teaches, in code.
const RUNNER_TRAIL_PCT = 0.02     // back half trails 2% below its peak — wide enough to survive a normal pullback and stay in the move
// Self-learning: judge each setup by its own realized record and adapt.
const LEARN_MIN_SAMPLES = 6
const LEARN_BAD_WINRATE = 0.35    // <35% over enough tries → stop taking that setup
const LEARN_GREAT_WINRATE = 0.60  // >60% → size it up

const r2 = (n: number) => Math.round(n * 100) / 100
const r6 = (n: number) => Math.round(n * 1e6) / 1e6
const fmt = (n: number) => `$${n.toFixed(2)}`

function etDateKeyOf(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Win rate + sample count per setup tag from this account's own closed trades. */
async function learnSetupStats(supabase: SupabaseClient, userId: string): Promise<Map<string, { wins: number; total: number; winRate: number }>> {
  const { data } = await supabase
    .from('academy_auto_trades').select('setup_tag, pnl').eq('user_id', userId).not('pnl', 'is', null).order('created_at', { ascending: false }).limit(120)
  const byTag = new Map<string, { wins: number; total: number; winRate: number }>()
  for (const t of data ?? []) {
    const tag = t.setup_tag ?? 'UNTAGGED'
    const cur = byTag.get(tag) ?? { wins: 0, total: 0, winRate: 0 }
    cur.total++
    if (Number(t.pnl) > 0) cur.wins++
    byTag.set(tag, cur)
  }
  for (const v of byTag.values()) v.winRate = v.total > 0 ? v.wins / v.total : 0
  return byTag
}

/**
 * The bot's actual scan universe: the curated watchlist (always scored)
 * plus a wide, multi-screener sweep (gainers, losers, most-active,
 * small/penny-cap) — every name's headline % move gets checked cheaply
 * every tick (no network beyond the screener calls), but only the biggest
 * movers from that sweep go on to the expensive full candle+indicator score,
 * so a mover outside the fixed list (a SPCX-type name) still gets caught
 * without fanning out hundreds of Yahoo candle requests per minute and
 * tripping the same rate-limiting that already shows up as 429s.
 */
const EXPANDED_SCORE_CAP = 50

async function getStockScanUniverse(): Promise<AssetData[]> {
  const [fixed, expanded] = await Promise.all([getAllAssets(), fetchExpandedStockUniverse()])
  const seen = new Set<string>()
  const out: AssetData[] = []
  for (const a of fixed.filter((x) => x.assetType === 'stock')) {
    if (!seen.has(a.symbol)) { seen.add(a.symbol); out.push(a) }
  }
  const rest = expanded
    .filter((a) => !seen.has(a.symbol))
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    .slice(0, EXPANDED_SCORE_CAP)
  for (const a of rest) { seen.add(a.symbol); out.push(a) }
  return out
}

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
    const assets = await getStockScanUniverse()
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

  // ── 1. Manage open positions: half-close at T1 + move stop to breakeven, then let the back half RUN on a loose trailing stop (no ceiling) — exit only on the trail/stop ──
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
    const halfClosed = !!pos.half_closed

    // Back half rides a loose trailing stop once it's running — no upper target,
    // so a genuine runner is captured instead of being sold at a fixed ceiling.
    const pnlPct = isLong ? (price - entry) / entry : (entry - price) / entry
    if (halfClosed && pnlPct >= TRAIL_TRIGGER_PCT) {
      const trail = isLong ? price * (1 - RUNNER_TRAIL_PCT) : price * (1 + RUNNER_TRAIL_PCT)
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

    if (hitStop) { await closeAll('STOP_HIT', halfClosed ? 'the trailing stop locked the run in' : 'the stop-loss line was hit'); continue }

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

  const { minutesOfDay: minsNow, dateKey: todayEt } = nowEt()

  // ── 2. End-of-morning flatten: close everything still open once the window's over ──
  if (minsNow >= SESSION_FLATTEN_MIN_ET) {
    const { data: leftoverRaw } = await supabase.from('academy_auto_positions').select('*').eq('user_id', userId)
    for (const pos of leftoverRaw ?? []) {
      const sig = signalBySymbol.get(pos.symbol)
      let price = sig?.asset.price
      if (price == null) { try { price = (await getQuote(pos.symbol)).price } catch { continue } }
      const isLong = pos.direction === 'LONG'
      const entry = Number(pos.avg_entry_price)
      const shares = Number(pos.shares)
      const pnl = r2(isLong ? (price - entry) * shares : (entry - price) * shares)
      await supabase.from('academy_auto_trades').insert({
        user_id: userId, symbol: pos.symbol, name: pos.name, action: isLong ? 'SELL' : 'BUY', direction: pos.direction,
        shares, price, total: r2(price * shares), pnl, setup_tag: pos.setup_tag, reason: 'End of morning session — flattened',
        ema9: sig?.indicators?.ema9 ?? null, ema21: sig?.indicators?.ema21 ?? null, vwap: sig?.indicators?.vwap ?? null, rsi: sig?.indicators?.rsi ?? null,
      })
      await supabase.from('academy_auto_positions').delete().eq('id', pos.id)
      cash = r2(cash + (isLong ? price * shares : entry * shares + pnl))
      await log(supabase, userId, {
        symbol: pos.symbol, kind: 'EXIT_FULL', price, shares, pnl,
        note: `${pos.symbol}: closed ${shares} shares at ${fmt(price)} (${pnl >= 0 ? '+' : ''}${fmt(pnl)}) — end of the morning session. I trade the active first few hours, not the slow afternoon chop, and I don't hold overnight.`,
      })
      events.push(`Flattened ${pos.symbol} ${pnl >= 0 ? '+' : ''}${fmt(pnl)} (session end)`)
    }
    await supabase.from('academy_auto_portfolio').update({ cash, updated_at: new Date().toISOString() }).eq('user_id', userId)
    return { ran: true, events }
  }

  // ── 3. Entry gates: morning-only window + daily risk discipline ──
  if (minsNow >= ENTRY_WINDOW_END_MIN_ET) return { ran: true, events } // past the entry window; just managing now

  const { data: todayTradesRaw } = await supabase
    .from('academy_auto_trades').select('pnl, action, created_at').eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 16 * 3600_000).toISOString())
  const todayTrades = (todayTradesRaw ?? []).filter((t) => etDateKeyOf(new Date(t.created_at as string)) === todayEt)
  const realizedToday = todayTrades.filter((t) => t.pnl != null).reduce((s, t) => s + Number(t.pnl), 0)
  const entriesToday = todayTrades.filter((t) => t.pnl == null).length

  if (realizedToday <= -DAILY_LOSS_LIMIT_USD) return { ran: true, events } // hit the daily stop — capital protection, done for today
  if (entriesToday >= MAX_TRADES_PER_DAY) return { ran: true, events }      // don't overtrade
  const greenLockActive = realizedToday >= DAILY_PROFIT_LOCK_USD            // up enough → only top-conviction from here

  // ── 4. Scan for a new entry if a slot is free ──
  const { data: stillOpenRaw } = await supabase.from('academy_auto_positions').select('symbol, shares, avg_entry_price').eq('user_id', userId)
  const heldSymbols = new Set((stillOpenRaw ?? []).map((p) => p.symbol))
  let slotsFree = MAX_SLOTS - heldSymbols.size
  if (slotsFree <= 0) return { ran: true, events }

  // Size every new position off the WHOLE account's equity (cash + what's
  // already deployed), not just the cash left lying around — otherwise each
  // successive position this session shrinks as cash gets tied up, which is
  // exactly why entries were coming out tiny.
  const heldValue = (stillOpenRaw ?? []).reduce((s, p) => s + Number(p.shares) * Number(p.avg_entry_price), 0)
  const accountEquity = cash + heldValue

  const { data: recentRaw } = await supabase
    .from('academy_auto_trades').select('symbol, created_at').eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString())
  const cooling = new Set((recentRaw ?? []).map((r) => r.symbol))

  const learned = await learnSetupStats(supabase, userId)

  const assets = (await getStockScanUniverse()).filter((a) => !heldSymbols.has(a.symbol) && !cooling.has(a.symbol))
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

    // Self-learning: a setup that's been losing for THIS account gets benched;
    // a proven one gets sized up. Green-lock day demands top conviction.
    const stat = learned.get(sig.setupTag)
    if (stat && stat.total >= LEARN_MIN_SAMPLES && stat.winRate < LEARN_BAD_WINRATE) continue
    if (greenLockActive && Math.abs(sig.score) < 6) continue
    const learnMult = stat && stat.total >= LEARN_MIN_SAMPLES
      ? (stat.winRate >= LEARN_GREAT_WINRATE ? 1.2 : stat.winRate < 0.45 ? 0.6 : 1.0)
      : 1.0

    // Target size is a fixed slice of total equity; cash is just the hard
    // ceiling we can't spend past (no margin on this account).
    const budget = Math.min(accountEquity * MAX_POSITION_PCT * learnMult, cash * 0.92)
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
    const learnNote = stat && stat.total >= LEARN_MIN_SAMPLES
      ? ` (My record on this setup so far: ${stat.wins}/${stat.total} = ${Math.round(stat.winRate * 100)}% — ${learnMult > 1 ? 'sizing it up' : learnMult < 1 ? 'sizing it down' : 'normal size'}.)`
      : ''
    await log(supabase, userId, {
      symbol: sig.asset.symbol, kind: 'ENTRY', price, shares, pnl: 0,
      ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
      note: `${isLong ? 'Bought' : 'Shorted'} ${shares} shares of ${sig.asset.symbol} at ${fmt(price)} — ${sig.setupTag.replace(/_/g, ' ').toLowerCase()} setup (score ${sig.score.toFixed(1)}). ${trendNote}, RSI ${ind.rsi.toFixed(0)}, VWAP ${fmt(ind.vwap)}. Stop at ${fmt(stop)}, I'll sell half at ${fmt(target1)} to bank a sure profit, then let the rest run on a trailing stop — no ceiling, so if it turns into a real mover I stay in for it.${legendNote}${learnNote}`,
    })
    events.push(`Entered ${sig.asset.symbol} (${sig.setupTag}) at ${fmt(price)}`)
    void trade // id not currently needed downstream; kept for clarity/future linking
    slotsFree--
  }

  return { ran: true, events }
}
