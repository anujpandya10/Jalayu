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
import { sendPushToUser } from '@/lib/push'

export const AUTO_SEED_CAPITAL = 1000
// The "bigger winners" posture: concentrate the $1000 into a few meaningful
// positions (~$300 a name, ~$900 at work) rather than sprinkling it thin. A
// winner has to MOVE the account, not nudge it. The edge is asymmetry, not hit
// rate — losers stay tiny (tight ~0.4% stop = ~$1 a loss even at this size),
// each trade only trims a THIRD at the first target so two-thirds rides the
// runner uncapped, and the few real movers dwarf the many small losses. Win
// rate runs ~45-50% (more red trades) on purpose: wrong often, but right big.
const MAX_SLOTS = 3
const MAX_POSITION_PCT = 0.30
const COOLDOWN_MINUTES = 8        // short leash — jump back into the same name once it resets up, don't sit out
// Full-closure NYSE holidays — weekday-but-not-a-trading-day, which the Sat/Sun check alone
// misses. Needs a one-line update every December for the following year (source: nyse.com
// holiday calendar). Missing a date here just means one stray "good morning" log entry on
// a closed day, not a money-affecting bug — isUsMarketOpen() still correctly blocks any
// actual scanning/trading regardless.
const NYSE_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
])

const PREP_START_MIN_ET = 9 * 60 + 15      // 9:15am ET — 15 min before the open
const MARKET_OPEN_MIN_ET = 9 * 60 + 30
// Full-day session: the open is the most volatile window but movers show up
// all day (afternoon momentum, news-driven small caps) — stay scanning and
// in/out the whole session instead of stopping at lunch, flatten near the close.
const ENTRY_WINDOW_END_MIN_ET = 15 * 60 + 50   // no new entries after 3:50pm ET
const SESSION_FLATTEN_MIN_ET  = 15 * 60 + 55   // close anything still open at 3:55pm ET

// Risk discipline (the part that actually keeps an account alive):
const DAILY_LOSS_LIMIT_USD = 60   // down $60 on the day (−6%) → stop for the day. Higher tolerance is REQUIRED for asymmetry — you must survive the small-loss streak long enough for a runner to pay for it. Still a hard circuit-breaker, and ≤ the profit target so the day's R:R stays positive.
const DAILY_PROFIT_LOCK_USD = 100 // up $100 (+10%) → a genuinely big day is won; tighten to top-conviction only so a greedy late trade can't give it back. Set high so a single runner doesn't choke the day off early.
const MAX_TRADES_PER_DAY = 30     // active all-day rotation across the slots — the daily loss limit (not the trade count) is the real backstop if a day goes bad

// Cross-day peak-equity ratchet: DAILY_LOSS_LIMIT_USD only protects a single session — it
// says nothing about an account that was up $50 yesterday and is flat today. This defends
// the all-time high-water mark instead of letting every day start the "how am I doing"
// clock over from $1000: once a peak is set, giving back too much of ITS profit tightens
// conviction (SOFT) or stops opening new risk (HARD) until equity claws back toward it.
// Existing positions still exit on their own stops/trails either way — this only throttles
// ADDING new risk while underwater relative to the peak, it can't force a position to hold.
const PEAK_SOFT_GIVEBACK_PCT = 0.40  // give back >40% of peak profit → defense mode (tighter bar, half size)
const PEAK_HARD_GIVEBACK_PCT = 0.75  // give back >75% of peak profit → no new entries until it recovers
const PEAK_MIN_GIVEBACK_USD = 25     // floor so a trivial few-dollar peak doesn't hair-trigger defense mode
const PEAK_DEFENSE_CONVICTION_BONUS = 3 // SOFT-defense: demand |score| this much higher, on top of the usual bar
const PEAK_DEFENSE_SIZE_MULT = 0.5      // SOFT-defense: half the usual position size while proving it back out

// Let winners run — the asymmetry that actually grows an account. The first
// half comes off at T1 to bank a sure profit and pay for the trade; the BACK
// half then rides a loose trailing stop with NO upper ceiling. Most trades
// still finish as small wins, but when a real runner shows up (a name going
// +10/20% intraday, the kind that was being clipped at +1.5% before), the back
// half captures most of it — one of those pays for a long string of small
// losses. This is the Livermore/PTJ lesson the curriculum teaches, in code.
const RUNNER_TRAIL_PCT = 0.025    // the runner trails 2.5% below its peak — wide enough to survive a normal pullback and stay in a big move longer instead of being shaken out early

// "Getting close" exit warning — fires once per position per side when price is within
// this % of actually crossing the stop or first target. Unlike the buy side's fixed 60s
// countdown, exits are price-driven and can't be scheduled — this is the closest honest
// equivalent: a heads-up that it's about to happen, not a forecast of exactly when.
const NEAR_EXIT_PCT = 0.001

// Wide net, but only swing at decent pitches. The scan universe is huge now
// (every screener mover, penny to mega-cap), so the weakest marginal setups off
// random choppy small-caps drag the win rate down. Demand real conviction —
// but not SO high it sits idle: with a few slots to keep working through the
// session, the bar stays busy on the genuinely-set-up bars, not every wiggle.
const AUTO_MIN_CONVICTION = 4     // |score| ≥ 4 of 10 to enter — pickier than the base floor, loose enough to keep the slots working

// ── Pro-grade entry quality gates (the "edge" dial, not the "risk" dial) ──────────────
// Relative volume: a setup with no volume behind it is a trap — the move has no
// participation, so it stalls or reverses. Momentum/breakout setups demand real volume;
// value-zone setups (buying a dip at support) legitimately fire on quieter tape, so they
// keep a lower floor. volSpike = current vs average volume, already computed in indicators.
const RVOL_FLOOR_MOMENTUM = 1.3   // momentum/breakout/pump-fade need ≥1.3× average volume
const RVOL_FLOOR_VALUE = 0.6      // dip/bounce setups can fire quieter, just not dead
const MOMENTUM_SETUPS = new Set(['MOMENTUM_LONG', 'MACD_CROSS_LONG', 'PUMP_SHORT', 'SUPERNOVA_SHORT', 'VWAP_SHORT'])

// Relative strength: on a broad red day, a technical signal can still fire on a stock that's
// simply falling LESS than the index — that's beta, not a real long. Momentum/breakout
// setups have to be outperforming SPY by a real margin (shorts: underperforming it) to count
// as an actual leader/laggard — this is the mechanical answer to "find the stock that's
// genuinely green while the market's red," not just the least-red one.
const RS_MIN_EDGE_PCT = 0.5   // percentage points the candidate must beat SPY by, in its own direction

// Market regime: don't fight the tape. If SPY (the market itself) is clearly trending one
// way, taking trades against it is swimming upstream — the curriculum's Livermore lesson
// ("trade with the trend, not against it") applied to the whole market, not just one name.
const REGIME_TREND_PCT = 0.0015   // SPY EMA9 vs EMA21 gap (as % of price) that counts as a real trend, not noise

// Time of day drives how choppy/clean the tape is. The open drive and the power hour are
// where clean intraday moves happen; the lunch lull (≈11:30a–1:30p ET) is mostly noise —
// every desk knows to size down or sit out midday. Encoded as an extra conviction bar.
const LUNCH_START_MIN_ET = 11 * 60 + 30
const LUNCH_END_MIN_ET = 13 * 60 + 30
const POWER_HOUR_MIN_ET = 15 * 60
const LUNCH_CONVICTION_BONUS = 2  // during the chop, demand |score| ≥ 6, not 4 — only the cleanest setups

interface MarketRegime { regime: 'BULL' | 'BEAR' | 'NEUTRAL'; spyChangePct: number; note: string }

/** Read the market itself (SPY) once per tick so entries can refuse to fight the tape. */
async function getMarketRegime(): Promise<MarketRegime> {
  try {
    const quote = await getQuote('SPY')
    const asset: AssetData = { symbol: 'SPY', name: 'S&P 500', price: quote.price, change24h: quote.changePct, change7d: 0, assetType: 'stock' }
    const sig = await scoreAssetFull(asset)
    const ind = sig.indicators
    if (!ind) return { regime: 'NEUTRAL', spyChangePct: quote.changePct, note: 'market read unavailable' }
    const gap = (ind.ema9 - ind.ema21) / ind.currentPrice
    if (gap >= REGIME_TREND_PCT) return { regime: 'BULL', spyChangePct: quote.changePct, note: `market's trending up (SPY ${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%, EMA9>EMA21)` }
    if (gap <= -REGIME_TREND_PCT) return { regime: 'BEAR', spyChangePct: quote.changePct, note: `market's trending down (SPY ${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%, EMA9<EMA21)` }
    return { regime: 'NEUTRAL', spyChangePct: quote.changePct, note: `market's flat/chopping (SPY ${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%)` }
  } catch {
    return { regime: 'NEUTRAL', spyChangePct: 0, note: 'market read unavailable' }
  }
}

/** Which part of the session we're in, and how much extra conviction it should demand. */
function sessionPhase(minsEt: number): { phase: string; convictionBonus: number } {
  if (minsEt >= LUNCH_START_MIN_ET && minsEt < LUNCH_END_MIN_ET) return { phase: 'midday chop', convictionBonus: LUNCH_CONVICTION_BONUS }
  if (minsEt < MARKET_OPEN_MIN_ET + 90) return { phase: 'opening drive', convictionBonus: 0 }
  if (minsEt >= POWER_HOUR_MIN_ET) return { phase: 'power hour', convictionBonus: 0 }
  return { phase: 'midday', convictionBonus: 0 }
}

/** The professional unit: how many multiples of the initial risk a move is worth.
 * R = (move in your favor per share) / (risk per share fixed at entry). A fresh stop-out
 * is ≈ −1R, break-even ≈ 0R, a real runner is +10R, +20R… This is the whole game. */
function rMultiple(isLong: boolean, entry: number, price: number, riskPerShare: number | null): number | null {
  if (riskPerShare == null || riskPerShare <= 0) return null
  return r2((isLong ? price - entry : entry - price) / riskPerShare)
}
const fmtR = (r: number) => `${r >= 0 ? '+' : ''}${r.toFixed(1)}R`

// "Heads up" staging: a qualifying setup announces itself (symbol, price, shares, why)
// and waits this long before actually buying — so someone watching live on another
// screen has real time to place the same trade themselves before it executes. On
// execution it re-checks the setup is still real on a fresh quote, rather than blindly
// firing the stale plan — the announced price is a forecast, not a limit order.
const PENDING_ANNOUNCE_DELAY_MS = 60_000

// Hard backstop on top of the announce delay: a heads-up gets several retries (a flaky
// quote, the market closing mid-window) before this forces it closed. Without this a
// pending row that never resolves sits forever — frozen at 0s on the UI, and stacking
// with every later one — instead of clearing out with an honest "missed it" record.
const PENDING_MAX_AGE_MS = 5 * 60_000

// Two-stage scan. Candle-scoring every name in the (now wide) universe meant
// ~100 live Yahoo calls a tick — which Yahoo rate-limited (429s), leaving the
// bot blind and barely trading. So first rank the whole universe by who's
// actually MOVING today (change %, already in hand from the screeners — zero
// extra calls), then only pull candles + full-score this many. ~20 calls a
// tick instead of ~100: the data actually comes back, so setups get found.
const SCORE_TOP_N = 20

/** The day's biggest movers first — the only names worth spending a candle call on. */
function topMovers(assets: AssetData[], n: number): AssetData[] {
  return [...assets].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, n)
}
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
  // A rejected insert (e.g. a kind the DB check constraint doesn't allow yet) used to
  // fail completely silently — surface it to Vercel's function logs at minimum, since
  // this function IS the narration the whole UI relies on.
  const { error } = await supabase.from('academy_auto_log').insert({ user_id: userId, ...row })
  if (error) console.error('[academy-auto-trader] log() insert failed:', error.message, row)
}

const fmtEt = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit' })

/** Sweep anything that's been sitting in "heads up" for too long without resolving — a
 * quote that kept failing, or the window closing mid-resolution. Runs ahead of the market-
 * open/enabled gates below so a backlog from last session (or over a weekend) clears on the
 * very next tick instead of staying frozen forever. Silently discarded — the bot continues
 * scanning normally and will re-announce if the setup is still valid. */
async function expireStalePending(supabase: SupabaseClient, userId: string, events: string[]) {
  const cutoff = new Date(Date.now() - PENDING_MAX_AGE_MS).toISOString()
  const { data: staleRaw } = await supabase
    .from('academy_auto_pending_entries').select('id, symbol').eq('user_id', userId).lt('planned_at', cutoff)
  for (const p of staleRaw ?? []) {
    await supabase.from('academy_auto_pending_entries').delete().eq('id', p.id)
    events.push(`Heads-up for ${p.symbol} expired (quote window closed)`)
  }
}

/** "Did you also place this trade?" — one prompt per real shadow-able moment (a followed-
 * through entry, a full close, a partial trim). Not for flatten/sweep cleanups — those
 * aren't moments anyone would realistically be mirroring live. */
async function promptShadowFeedback(
  supabase: SupabaseClient, userId: string, eventType: 'ENTRY' | 'EXIT', symbol: string, detail: string,
) {
  await supabase.from('academy_auto_shadow_feedback').insert({ user_id: userId, event_type: eventType, symbol, detail })
}

/** End-of-day desk recap — fires once, after the session flattens. The kind of review a
 * real prop trader does every afternoon: what worked, what didn't, the day in R. */
async function maybeWriteDailyDebrief(supabase: SupabaseClient, userId: string, todayEt: string, marketNote: string) {
  // Once-per-day guard: bail if a debrief already exists for today.
  const { data: existing } = await supabase
    .from('academy_auto_log').select('id, created_at').eq('user_id', userId).eq('kind', 'DEBRIEF')
    .gte('created_at', new Date(Date.now() - 16 * 3600_000).toISOString())
  if ((existing ?? []).some((r) => etDateKeyOf(new Date(r.created_at as string)) === todayEt)) return

  const { data: tradesRaw } = await supabase
    .from('academy_auto_trades').select('symbol, pnl, shares, setup_tag, risk_per_share, created_at').eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 16 * 3600_000).toISOString())
  const closed = (tradesRaw ?? []).filter((t) => t.pnl != null && etDateKeyOf(new Date(t.created_at as string)) === todayEt)
  if (closed.length === 0) {
    await log(supabase, userId, { kind: 'DEBRIEF', note: `📋 Session done. No trades closed today — ${marketNote}. No setups cleared the bar worth risking money on, and not forcing trades on a day like that is itself the right call.` })
    return
  }

  let net = 0, totalR = 0, wins = 0
  let best: { sym: string; r: number } | null = null
  let worst: { sym: string; r: number } | null = null
  const bySetup = new Map<string, { pnl: number; n: number }>()
  for (const t of closed) {
    const pnl = Number(t.pnl)
    net += pnl
    if (pnl > 0) wins++
    const rps = t.risk_per_share != null ? Number(t.risk_per_share) : null
    const shares = Number(t.shares)
    const R = rps != null && rps > 0 && shares > 0 ? pnl / (rps * shares) : null
    if (R != null) {
      totalR += R
      if (!best || R > best.r) best = { sym: t.symbol as string, r: R }
      if (!worst || R < worst.r) worst = { sym: t.symbol as string, r: R }
    }
    const tag = (t.setup_tag as string) ?? 'UNTAGGED'
    const cur = bySetup.get(tag) ?? { pnl: 0, n: 0 }
    cur.pnl += pnl; cur.n++; bySetup.set(tag, cur)
  }
  const winPct = Math.round((wins / closed.length) * 100)
  const bestSetup = [...bySetup.entries()].sort((a, b) => b[1].pnl - a[1].pnl)[0]
  const worstSetup = [...bySetup.entries()].sort((a, b) => a[1].pnl - b[1].pnl)[0]

  const parts: string[] = []
  parts.push(`📋 Session debrief — ${closed.length} trade${closed.length === 1 ? '' : 's'} closed, ${wins} green / ${closed.length - wins} red (${winPct}% win), net ${net >= 0 ? '+' : ''}${fmt(net)}${totalR !== 0 ? ` (${fmtR(totalR)})` : ''}.`)
  if (best && best.r > 0) parts.push(`Best: ${best.sym} ${fmtR(best.r)} — that one runner is what the whole approach is built around.`)
  if (worst && worst.r < -0.5) parts.push(`Worst: ${worst.sym} ${fmtR(worst.r)} — a defined, small loss, exactly as planned.`)
  if (bestSetup && bestSetup[1].pnl > 0) parts.push(`${bestSetup[0].replace(/_/g, ' ').toLowerCase()} carried the day (${bestSetup[1].pnl >= 0 ? '+' : ''}${fmt(bestSetup[1].pnl)} across ${bestSetup[1].n}).`)
  if (worstSetup && worstSetup[0] !== bestSetup?.[0] && worstSetup[1].pnl < 0) parts.push(`${worstSetup[0].replace(/_/g, ' ').toLowerCase()} didn't work today (${fmt(worstSetup[1].pnl)}).`)
  parts.push(`The market: ${marketNote}.`)
  await log(supabase, userId, { kind: 'DEBRIEF', note: parts.join(' ') })
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
  if (NYSE_HOLIDAYS_2026.has(dateKey)) return // weekday but market's actually closed — don't burn the once-a-day kickoff on a day with no real session
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
    const assets = topMovers(await getStockScanUniverse(), SCORE_TOP_N)
    const scored = await Promise.allSettled(assets.map((a) => scoreAssetFull(a)))
    const signals = scored.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<Signal>).value)
    const ranked = signals.filter((s) => s.setupTag !== 'UNTAGGED').sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 5)

    if (ranked.length === 0) {
      await log(supabase, userId, { kind: 'SCAN', note: `Scanned ${assets.length} stocks — nothing with a confirmed setup yet. I'll keep watching as the open gets closer.` })
    } else {
      for (const sig of ranked) {
        const ind = sig.indicators
        await log(supabase, userId, {
          symbol: sig.asset.symbol, kind: 'SCAN', price: sig.asset.price,
          ema9: ind?.ema9 ?? null, ema21: ind?.ema21 ?? null, vwap: ind?.vwap ?? null, rsi: ind?.rsi ?? null,
          note: `Watching ${sig.asset.symbol} for the open (score ${sig.score.toFixed(1)}, ${sig.setupTag.replace(/_/g, ' ').toLowerCase()}) — ${sig.reason}.`,
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
  await expireStalePending(supabase, userId, events)

  if (!isUsMarketOpen()) return { ran: events.length > 0, reason: 'Market closed', events }
  if (!portfolio.enabled) return { ran: false, reason: 'Auto trader is off', events }

  // The 1-minute cron and the client's own 25s poll both call this for the same user with
  // zero coordination — cash is a plain read-then-write, so two overlapping ticks could
  // clobber each other's debit/credit. A short, self-expiring TTL lock turns "overlapping
  // tick" into a clean no-op instead of a race: only one tick can hold it at a time, and a
  // crashed tick can't deadlock the account since the lock expires on its own.
  const lockUntil = new Date(Date.now() + 50_000).toISOString()
  const { data: lockRows } = await supabase.from('academy_auto_portfolio')
    .update({ tick_lock_until: lockUntil })
    .eq('user_id', userId)
    .or(`tick_lock_until.is.null,tick_lock_until.lt.${new Date().toISOString()}`)
    .select('user_id')
  if (!lockRows || lockRows.length === 0) {
    return { ran: false, reason: 'another tick is already in progress', events }
  }

  try {
    return await runLiveTick(supabase, userId, portfolio, events)
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}`.slice(0, 1500) : String(err)
    await log(supabase, userId, { kind: 'ERROR', note: `Tick failed: ${msg}` })
    return { ran: false, reason: 'error', events }
  } finally {
    await supabase.from('academy_auto_portfolio').update({ tick_lock_until: null }).eq('user_id', userId)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runLiveTick(supabase: SupabaseClient, userId: string, portfolio: any, events: string[]): Promise<RunResult> {
  let cash = Number(portfolio.cash)

  const { data: openRaw } = await supabase.from('academy_auto_positions').select('*').eq('user_id', userId)
  const allOpen = openRaw ?? []

  // Safety net: a position still open from a PRIOR trading day means that day's
  // end-of-session flatten missed it — a transient miss (e.g. a deploy mid-session,
  // a flaky quote) leaves it stuck forever otherwise, silently eating one of only
  // MAX_SLOTS positions for every day after. Sweep it the instant the bot wakes up
  // today, before anything else, rather than waiting on its own stop/target to
  // eventually (or never) resolve it.
  const { dateKey: wakeDateEt } = nowEt()
  const staleOvernight = allOpen.filter((p) => etDateKeyOf(new Date(p.created_at)) !== wakeDateEt)
  for (const pos of staleOvernight) {
    const isLong = pos.direction === 'LONG'
    const entry = Number(pos.avg_entry_price)
    const shares = Number(pos.shares)
    // A carried-over position MUST close — never skip it just because a quote call failed.
    // Best-effort live price, but fall back to the entry price (a break-even close) rather
    // than leave it stranded another day. This is the bug that left positions stuck for days.
    let price = entry
    let priceNote = ''
    try { price = (await getQuote(pos.symbol)).price } catch { priceNote = ' (no live quote available — closed at entry to free the slot)' }
    const pnl = r2(isLong ? (price - entry) * shares : (entry - price) * shares)
    await supabase.from('academy_auto_trades').insert({
      user_id: userId, symbol: pos.symbol, name: pos.name, action: isLong ? 'SELL' : 'BUY', direction: pos.direction,
      shares, price, total: r2(price * shares), pnl, setup_tag: pos.setup_tag, risk_per_share: pos.risk_per_share != null ? Number(pos.risk_per_share) : null,
      reason: "Carried past its own session — yesterday's flatten missed it, swept on wake",
    })
    await supabase.from('academy_auto_positions').delete().eq('id', pos.id)
    cash = r2(cash + (isLong ? price * shares : entry * shares + pnl))
    await log(supabase, userId, {
      symbol: pos.symbol, kind: 'EXIT_FULL', price, shares, pnl,
      note: `${pos.symbol}: closed ${shares} shares at ${fmt(price)} (${pnl >= 0 ? '+' : ''}${fmt(pnl)}) — carried over from a prior session (a flatten got missed), so I closed it on wake instead of leaving it stuck.${priceNote}`,
    })
    events.push(`Swept stale ${pos.symbol} ${pnl >= 0 ? '+' : ''}${fmt(pnl)} (carried overnight)`)
  }
  const open = allOpen.filter((p) => !staleOvernight.some((s) => s.id === p.id))

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

    // "Getting close" — a one-shot heads-up before the line actually gets crossed. Unlike
    // the buy side this isn't a fixed countdown (price-driven exits can't be scheduled),
    // just an early signal that something's about to happen soon. NEAR_EXIT_PCT is how
    // close (as a % of price) counts as "about to."
    if (!hitStop && !pos.warned_near_stop && stop != null) {
      const distToStop = isLong ? (price - stop) / price : (stop - price) / price
      if (distToStop > 0 && distToStop <= NEAR_EXIT_PCT) {
        await supabase.from('academy_auto_positions').update({ warned_near_stop: true }).eq('id', pos.id)
        await sendPushToUser(supabase, userId, {
          title: `Jalayu — ${pos.symbol} is closing in on its stop`,
          body: `$${price.toFixed(2)}, stop at $${stop.toFixed(2)} — could close any moment.`,
          url: '/dashboard',
        })
      }
    }
    if (!hitT1 && !halfClosed && !pos.warned_near_target && t1 != null) {
      const distToT1 = isLong ? (t1 - price) / price : (price - t1) / price
      if (distToT1 > 0 && distToT1 <= NEAR_EXIT_PCT) {
        await supabase.from('academy_auto_positions').update({ warned_near_target: true }).eq('id', pos.id)
        await sendPushToUser(supabase, userId, {
          title: `Jalayu — ${pos.symbol} is closing in on its first target`,
          body: `$${price.toFixed(2)}, target at $${t1.toFixed(2)} — might trim soon.`,
          url: '/dashboard',
        })
      }
    }

    const rps = pos.risk_per_share != null ? Number(pos.risk_per_share) : null
    const closeAll = async (kind: 'STOP_HIT' | 'EXIT_FULL', why: string) => {
      const pnl = r2(isLong ? (price - entry) * shares : (entry - price) * shares)
      const R = rMultiple(isLong, entry, price, rps)
      const rNote = R != null ? ` [${fmtR(R)}]` : ''
      await supabase.from('academy_auto_trades').insert({
        user_id: userId, symbol: pos.symbol, name: pos.name, action: isLong ? 'SELL' : 'BUY', direction: pos.direction,
        shares, price, total: r2(price * shares), pnl, setup_tag: pos.setup_tag, reason: why, risk_per_share: rps,
        ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
      })
      await supabase.from('academy_auto_positions').delete().eq('id', pos.id)
      cash = r2(cash + (isLong ? price * shares : entry * shares + pnl))
      await log(supabase, userId, {
        symbol: pos.symbol, kind, price, shares, pnl,
        ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
        note: `${pos.symbol}: closed the remaining ${shares} shares at ${fmt(price)} (${pnl >= 0 ? '+' : ''}${fmt(pnl)})${rNote} — ${why}.`,
      })
      events.push(`Closed ${pos.symbol} ${pnl >= 0 ? '+' : ''}${fmt(pnl)}`)
      // The instant "it happened" ping — no need to watch for this at all, just get told.
      await sendPushToUser(supabase, userId, {
        title: `Jalayu — closed ${pos.symbol}`,
        body: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}${rNote} — ${why}`,
        url: '/dashboard',
      })
      await promptShadowFeedback(supabase, userId, 'EXIT', pos.symbol, `Closed @ ${fmt(price)} (${pnl >= 0 ? '+' : ''}${fmt(pnl)})`)
    }

    if (hitStop) { await closeAll('STOP_HIT', halfClosed ? 'the trailing stop locked the run in' : 'the stop-loss line was hit'); continue }

    // Read the bars for the EXIT, not just the stop: if we're in real profit and a strong
    // reversal candle prints against us (a bearish engulfing / shooting star at the highs on
    // a long), take the profit AT the turn instead of giving a chunk back waiting for the
    // mechanical trailing stop to catch up. This is the price-action exit — exiting on what
    // the candle says, the way a discretionary trader reads the top of a move.
    const pa = sig.priceAction
    if (!hitStop && pnlPct >= TRAIL_TRIGGER_PCT && pa && pa.reversalAgainst === pos.direction) {
      const pat = pa.patterns.filter((p) => /engulf|star|hammer|resistance|support/.test(p)).join(', ') || 'a reversal candle'
      await closeAll('EXIT_FULL', `the bars turned — ${pat} after a run in our favour, so I took the profit at the reversal instead of giving it back to the trailing stop`)
      continue
    }

    if (hitT1 && !halfClosed && t1 != null) {
      // "Bigger winners" posture: trim only a THIRD here to bank a sure profit,
      // leaving two-thirds to ride the runner uncapped.
      const trim = Math.min(original / 3, shares)
      if (trim <= 0) continue
      const remaining = r6(shares - trim)
      const pnl = r2(isLong ? (price - entry) * trim : (entry - price) * trim)
      const R = rMultiple(isLong, entry, price, rps)
      const rNote = R != null ? ` [${fmtR(R)}]` : ''
      const newStop = isLong ? entry * (1 + BREAKEVEN_LOCK_PCT) : entry * (1 - BREAKEVEN_LOCK_PCT)
      await supabase.from('academy_auto_trades').insert({
        user_id: userId, symbol: pos.symbol, name: pos.name, action: isLong ? 'SELL' : 'BUY', direction: pos.direction,
        shares: trim, price, total: r2(price * trim), pnl, setup_tag: pos.setup_tag, reason: 'Target 1 — trimmed a third, stop moved to break-even', risk_per_share: rps,
        ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
      })
      await supabase.from('academy_auto_positions').update({ shares: r6(remaining), half_closed: true, stop_price: r2(newStop) }).eq('id', pos.id)
      cash = r2(cash + (isLong ? price * trim : entry * trim + pnl))
      await log(supabase, userId, {
        symbol: pos.symbol, kind: 'TAKE_HALF', price, shares: trim, pnl,
        ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
        note: `${pos.symbol}: hit the first target, so I sold a third (${trim} shares) at ${fmt(price)} (+${fmt(pnl)})${rNote} and moved the stop on the other ${remaining} from ${pos.stop_price != null ? fmt(Number(pos.stop_price)) : '—'} up to ${fmt(newStop)} — break-even. The remaining two-thirds can't turn into a real loss from here; now I let it run for the big move.`,
      })
      events.push(`${pos.symbol}: trimmed a third at ${fmt(price)}, stop to break-even`)
      await sendPushToUser(supabase, userId, {
        title: `Jalayu — trimmed a third of ${pos.symbol}`,
        body: `+$${pnl.toFixed(2)} banked at the first target, stop moved to break-even on the rest.`,
        url: '/dashboard',
      })
      await promptShadowFeedback(supabase, userId, 'EXIT', pos.symbol, `Trimmed a third @ ${fmt(price)} (+${fmt(pnl)})`)
    }
  }

  await supabase.from('academy_auto_portfolio').update({ cash, updated_at: new Date().toISOString() }).eq('user_id', userId)

  const { minutesOfDay: minsNow, dateKey: todayEt } = nowEt()

  // Read the market itself once — gates entries below (don't fight the tape) and colours
  // the end-of-day debrief.
  const market = await getMarketRegime()

  // ── 2. End-of-morning flatten: close everything still open once the window's over ──
  if (minsNow >= SESSION_FLATTEN_MIN_ET) {
    const { data: leftoverRaw } = await supabase.from('academy_auto_positions').select('*').eq('user_id', userId)
    for (const pos of leftoverRaw ?? []) {
      const sig = signalBySymbol.get(pos.symbol)
      const isLong = pos.direction === 'LONG'
      const entry = Number(pos.avg_entry_price)
      const shares = Number(pos.shares)
      // The flatten MUST flatten — never skip a position because the quote failed (that's the
      // exact bug that left positions open for days). Best-effort live price, else fall back
      // to the entry price (break-even close) so the position cannot survive the session.
      let price = sig?.asset.price
      let priceNote = ''
      if (price == null) { try { price = (await getQuote(pos.symbol)).price } catch { price = entry; priceNote = ' (no live quote — closed at entry so it never carries over)' } }
      const pnl = r2(isLong ? (price - entry) * shares : (entry - price) * shares)
      const fRps = pos.risk_per_share != null ? Number(pos.risk_per_share) : null
      const fR = rMultiple(isLong, entry, price, fRps)
      const fRNote = fR != null ? ` [${fmtR(fR)}]` : ''
      await supabase.from('academy_auto_trades').insert({
        user_id: userId, symbol: pos.symbol, name: pos.name, action: isLong ? 'SELL' : 'BUY', direction: pos.direction,
        shares, price, total: r2(price * shares), pnl, setup_tag: pos.setup_tag, reason: 'End of session — flattened', risk_per_share: fRps,
        ema9: sig?.indicators?.ema9 ?? null, ema21: sig?.indicators?.ema21 ?? null, vwap: sig?.indicators?.vwap ?? null, rsi: sig?.indicators?.rsi ?? null,
      })
      await supabase.from('academy_auto_positions').delete().eq('id', pos.id)
      cash = r2(cash + (isLong ? price * shares : entry * shares + pnl))
      await log(supabase, userId, {
        symbol: pos.symbol, kind: 'EXIT_FULL', price, shares, pnl,
        note: `${pos.symbol}: closed ${shares} shares at ${fmt(price)} (${pnl >= 0 ? '+' : ''}${fmt(pnl)})${fRNote} — end of the session. I don't hold overnight; flat into the close.${priceNote}`,
      })
      events.push(`Flattened ${pos.symbol} ${pnl >= 0 ? '+' : ''}${fmt(pnl)} (session end)`)
    }
    await supabase.from('academy_auto_portfolio').update({ cash, updated_at: new Date().toISOString() }).eq('user_id', userId)
    await maybeWriteDailyDebrief(supabase, userId, todayEt, market.note)
    return { ran: true, events }
  }

  // ── 3. Entry gates: morning-only window + daily risk discipline ──
  if (minsNow >= ENTRY_WINDOW_END_MIN_ET) return { ran: true, events } // past the entry window; just managing now

  // 30h, not 16 — the etDateKeyOf filter below does the real narrowing to "today," this is
  // only a query prefilter. 16h could clip trades from earlier in TODAY's ET session if the
  // bot resumed unusually late after downtime (the loss/profit limits and MAX_TRADES_PER_DAY
  // would then undercount what's actually been risked today).
  const { data: todayTradesRaw } = await supabase
    .from('academy_auto_trades').select('pnl, action, created_at').eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 30 * 3600_000).toISOString())
  const todayTrades = (todayTradesRaw ?? []).filter((t) => etDateKeyOf(new Date(t.created_at as string)) === todayEt)
  const realizedToday = todayTrades.filter((t) => t.pnl != null).reduce((s, t) => s + Number(t.pnl), 0)
  const entriesToday = todayTrades.filter((t) => t.pnl == null).length

  if (realizedToday <= -DAILY_LOSS_LIMIT_USD) return { ran: true, events } // hit the daily stop — capital protection, done for today
  if (entriesToday >= MAX_TRADES_PER_DAY) return { ran: true, events }      // don't overtrade
  const greenLockActive = realizedToday >= DAILY_PROFIT_LOCK_USD            // up enough → only top-conviction from here

  // ── 3.5 Follow through on any "heads up" entries that are now due ──
  const { data: pendingRaw } = await supabase.from('academy_auto_pending_entries').select('*').eq('user_id', userId)
  const allPending = pendingRaw ?? []
  const duePending = allPending.filter((p) => Date.now() - new Date(p.planned_at as string).getTime() >= PENDING_ANNOUNCE_DELAY_MS)
  for (const p of duePending) {
    try {
      const quote = await getQuote(p.symbol as string)
      const asset: AssetData = { symbol: p.symbol, name: quote.name ?? p.name ?? p.symbol, price: quote.price, change24h: quote.changePct, change7d: 0, assetType: 'stock' }
      const sig = await scoreAssetFull(asset)
      const direction = p.direction as 'LONG' | 'SHORT'
      const stillQualifies = sig.indicators != null && sig.direction === direction && Math.abs(sig.score) >= AUTO_MIN_CONVICTION
      if (!stillQualifies) {
        await supabase.from('academy_auto_pending_entries').delete().eq('id', p.id)
        await log(supabase, userId, { symbol: p.symbol, kind: 'INFO', note: `Passed on ${p.symbol} — the setup faded in the minute since I called it, so I didn't chase it.` })
        events.push(`Passed on ${p.symbol} (setup faded before it was due)`)
        continue
      }
      const ind = sig.indicators!
      const price = sig.asset.price
      const isLong = direction === 'LONG'
      const setupTag = (p.setup_tag as string) ?? sig.setupTag
      const { tp, sl } = getTpSl(setupTag, direction, 'stock')
      const stop = r2(isLong ? price * (1 - sl) : price * (1 + sl))
      const target2 = r2(isLong ? price * (1 + tp) : price * (1 - tp))
      const target1 = r2(isLong ? price + (target2 - price) / 2 : price - (price - target2) / 2)
      const riskPerShare = r2(Math.abs(price - stop)) // fixed at entry — every later R is measured against this
      const shares = Number(p.planned_shares)
      const total = r2(price * shares)
      if (total > cash || total < MIN_TRADE_USD) {
        await supabase.from('academy_auto_pending_entries').delete().eq('id', p.id)
        await log(supabase, userId, { symbol: p.symbol, kind: 'INFO', note: `Couldn't follow through on ${p.symbol} — not enough cash left by the time it was due.` })
        continue
      }

      const { error: posErr } = await supabase.from('academy_auto_positions').insert({
        user_id: userId, symbol: p.symbol, name: p.name ?? p.symbol, direction,
        shares, original_shares: shares, avg_entry_price: price,
        stop_price: stop, target1_price: target1, target2_price: target2, half_closed: false, risk_per_share: riskPerShare,
        setup_tag: setupTag, entry_ema9: ind.ema9, entry_ema21: ind.ema21, entry_vwap: ind.vwap, entry_rsi: ind.rsi,
      })
      if (posErr) { await supabase.from('academy_auto_pending_entries').delete().eq('id', p.id); continue } // already holding it somehow

      await supabase.from('academy_auto_trades').insert({
        user_id: userId, symbol: p.symbol, name: p.name ?? p.symbol, action: 'BUY', direction,
        shares, price, total, pnl: null, setup_tag: setupTag, reason: p.reason, risk_per_share: riskPerShare,
        ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
      })
      await supabase.from('academy_auto_pending_entries').delete().eq('id', p.id)

      cash = r2(cash - total)
      await supabase.from('academy_auto_portfolio').update({ cash, updated_at: new Date().toISOString() }).eq('user_id', userId)

      const trendNote = ind.ema9 >= ind.ema21 ? `EMA9 (${ind.ema9.toFixed(2)}) above EMA21 (${ind.ema21.toFixed(2)}) — trend is up` : `EMA9 (${ind.ema9.toFixed(2)}) below EMA21 (${ind.ema21.toFixed(2)}) — trend is down`
      const priceDrift = p.planned_price ? r2(price - Number(p.planned_price)) : 0
      const driftNote = Math.abs(priceDrift) >= 0.01 ? ` (called at ${fmt(Number(p.planned_price))}, moved ${priceDrift >= 0 ? '+' : ''}${fmt(priceDrift)} by the time it filled — that gap is real slippage.)` : ''
      const chapter = legendFor(setupTag)
      const legendNote = chapter ? ` This is ${chapter.trader}'s territory — ${chapter.coreIdea}` : ''
      // "Bars: ..." is parsed back out on the frontend into its own line on the trade card,
      // so the candle read is part of the permanent record, not just the live heads-up.
      const barNote = sig.priceAction && sig.priceAction.patterns.length > 0 ? ` Bars: ${sig.priceAction.note}.` : ''
      // Same shape as a direct entry's note (setup tag, score, legend) so the trade-log's
      // "Why bought" parsing still works for trades that went through the heads-up stage —
      // just with the called-ahead framing folded in instead of a separate sentence.
      await log(supabase, userId, {
        symbol: p.symbol, kind: 'ENTRY', price, shares, pnl: 0,
        ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
        note: `${isLong ? 'Bought' : 'Shorted'} ${shares} shares of ${p.symbol} at ${fmt(price)} — ${setupTag.replace(/_/g, ' ').toLowerCase()} setup (score ${sig.score.toFixed(1)}), exactly what I called about a minute ago.${driftNote} ${trendNote}, RSI ${ind.rsi.toFixed(0)}, VWAP ${fmt(ind.vwap)}.${barNote}${legendNote}`,
      })
      events.push(`Entered ${p.symbol} (followed through on the heads-up)`)
      await promptShadowFeedback(supabase, userId, 'ENTRY', p.symbol, `${isLong ? 'Bought' : 'Shorted'} ${shares} sh @ ${fmt(price)}`)
    } catch { /* quote failed this tick — leave the pending row in place, retry next tick rather than silently dropping a plan I already announced; expireStalePending forces it closed if this keeps failing past PENDING_MAX_AGE_MS */ }
  }
  const stillPendingSymbols = new Set(allPending.filter((p) => !duePending.some((d) => d.id === p.id)).map((p) => p.symbol))

  // ── 4. Scan for a new entry if a slot is free ──
  const { data: stillOpenRaw } = await supabase.from('academy_auto_positions').select('symbol, shares, avg_entry_price').eq('user_id', userId)
  const heldSymbols = new Set((stillOpenRaw ?? []).map((p) => p.symbol))
  // A pending "heads up" entry will become a real position soon — count it against the
  // slot budget now, not just once it executes, so the scan can't out-commit MAX_SLOTS.
  let slotsFree = MAX_SLOTS - heldSymbols.size - stillPendingSymbols.size
  if (slotsFree <= 0) return { ran: true, events }

  // Size every new position off the WHOLE account's equity (cash + what's
  // already deployed), not just the cash left lying around — otherwise each
  // successive position this session shrinks as cash gets tied up, which is
  // exactly why entries were coming out tiny.
  const heldValue = (stillOpenRaw ?? []).reduce((s, p) => s + Number(p.shares) * Number(p.avg_entry_price), 0)
  const accountEquity = cash + heldValue

  // Peak-equity ratchet: update the all-time high-water mark, then measure how much of ITS
  // profit has been given back. profitAtPeak == 0 means the account has never cleared seed
  // capital, so there's nothing to defend yet — normal rules apply.
  const priorPeak = Number(portfolio.peak_equity ?? AUTO_SEED_CAPITAL)
  const peak = Math.max(priorPeak, accountEquity)
  if (peak > priorPeak) await supabase.from('academy_auto_portfolio').update({ peak_equity: r2(peak) }).eq('user_id', userId)
  const profitAtPeak = Math.max(0, peak - AUTO_SEED_CAPITAL)
  const givenBack = Math.max(0, peak - accountEquity)
  const softBudget = Math.max(profitAtPeak * PEAK_SOFT_GIVEBACK_PCT, PEAK_MIN_GIVEBACK_USD)
  const hardBudget = Math.max(profitAtPeak * PEAK_HARD_GIVEBACK_PCT, PEAK_MIN_GIVEBACK_USD * 1.5)
  const peakState: 'NONE' | 'SOFT' | 'HARD' = profitAtPeak <= 0 ? 'NONE' : givenBack >= hardBudget ? 'HARD' : givenBack >= softBudget ? 'SOFT' : 'NONE'
  const priorPeakState = portfolio.profit_defense_state ?? 'NONE'
  if (peakState !== priorPeakState) {
    await supabase.from('academy_auto_portfolio').update({ profit_defense_state: peakState }).eq('user_id', userId)
    portfolio.profit_defense_state = peakState
    const note = peakState === 'HARD'
      ? `Peak equity ${fmt(peak)}, now ${fmt(accountEquity)} — given back ${fmt(givenBack)} of that profit, past the line I defend. No new entries until this claws back toward the peak; open positions still manage normally.`
      : peakState === 'SOFT'
        ? `Peak equity ${fmt(peak)}, now ${fmt(accountEquity)} — given back ${fmt(givenBack)} of that profit. Tightening up: higher conviction bar, half size, until it recovers.`
        : `Back above the profit-defense line (peak ${fmt(peak)}, now ${fmt(accountEquity)}) — normal size and conviction bar restored.`
    await log(supabase, userId, { kind: 'INFO', note })
    events.push(`Profit-defense: ${priorPeakState} → ${peakState}`)
    if (peakState === 'HARD') {
      await sendPushToUser(supabase, userId, { title: 'Jalayu — defending the peak', body: `Given back ${fmt(givenBack)} of the $${peak.toFixed(0)} peak — pausing new entries until it recovers.`, url: '/dashboard' })
    }
  }
  if (peakState === 'HARD') return { ran: true, events }

  const { data: recentRaw } = await supabase
    .from('academy_auto_trades').select('symbol, created_at').eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString())
  const cooling = new Set((recentRaw ?? []).map((r) => r.symbol))

  const learned = await learnSetupStats(supabase, userId)

  const universe = (await getStockScanUniverse()).filter((a) => !heldSymbols.has(a.symbol) && !cooling.has(a.symbol) && !stillPendingSymbols.has(a.symbol))
  const assets = topMovers(universe, SCORE_TOP_N)
  if (assets.length === 0) return { ran: true, events }

  const scored = await Promise.allSettled(assets.map((a) => scoreAssetFull(a)))
  const signals = scored.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<Signal>).value)
  const longs = filterLongEntries(signals)
  const shorts = filterShortEntries(signals)

  // Time-of-day: demand more conviction during the midday chop (the worst tape of the day),
  // normal during the opening drive and power hour where clean moves actually happen.
  const phase = sessionPhase(minsNow)
  const convictionBar = AUTO_MIN_CONVICTION + phase.convictionBonus + (peakState === 'SOFT' ? PEAK_DEFENSE_CONVICTION_BONUS : 0)

  const candidates = [...longs, ...shorts]
    .filter((s) => Math.abs(s.score) >= convictionBar)   // only the clearly-set-up bars, stricter in chop
    // Relative volume: a move with no volume behind it is a trap. Breakout/momentum setups
    // demand real participation; value-zone dips can fire quieter.
    .filter((s) => {
      const v = s.indicators?.volSpike ?? 0
      return v >= (MOMENTUM_SETUPS.has(s.setupTag) ? RVOL_FLOOR_MOMENTUM : RVOL_FLOOR_VALUE)
    })
    // Don't fight the tape: skip longs when the market's clearly rolling over and shorts when
    // it's clearly ripping — unless the individual setup is exceptional (|score| ≥ 7), which
    // can override the market read.
    .filter((s) => {
      if (Math.abs(s.score) >= 7) return true
      if (s.direction === 'LONG' && market.regime === 'BEAR') return false
      if (s.direction === 'SHORT' && market.regime === 'BULL') return false
      return true
    })
    // Relative strength: for momentum/breakout setups, demand the stock is actually beating
    // (or, for shorts, lagging) SPY by RS_MIN_EDGE_PCT — the real leader/laggard, not just a
    // name riding the index's own move. Value-zone dip-buys are exempt: buying a pullback in
    // a good name legitimately shows a flat/red 24h change even when the setup is sound.
    .filter((s) => {
      if (!MOMENTUM_SETUPS.has(s.setupTag)) return true
      const edge = s.direction === 'LONG' ? s.asset.change24h - market.spyChangePct : market.spyChangePct - s.asset.change24h
      return edge >= RS_MIN_EDGE_PCT
    })
    // Read the actual bars: don't buy right as a bearish reversal candle prints (or short
    // right as a bullish one does) — the indicators say "go" but the last bar says "wait."
    // Timing the entry to the candle, not just the threshold. Exceptional scores override.
    .filter((s) => Math.abs(s.score) >= 7 || s.priceAction?.reversalAgainst !== s.direction)
    // Among the survivors, prefer the ones whose bars CONFIRM the direction (bullish
    // candle/structure for a long) — when slots are scarce, the candle agreeing is the edge.
    .sort((a, b) => {
      const confirm = (s: Signal) => ((s.direction === 'LONG' && s.priceAction?.bias === 'BULLISH') || (s.direction === 'SHORT' && s.priceAction?.bias === 'BEARISH')) ? 0.6 : 0
      return (Math.abs(b.score) + confirm(b)) - (Math.abs(a.score) + confirm(a))
    })

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
    // ceiling we can't spend past (no margin on this account). Half size while in
    // profit-defense — prove the setup back out before betting full size again.
    const sizeMult = peakState === 'SOFT' ? PEAK_DEFENSE_SIZE_MULT : 1.0
    const budget = Math.min(accountEquity * MAX_POSITION_PCT * learnMult * sizeMult, cash * 0.92)
    if (budget < MIN_TRADE_USD) continue
    const shares = r6(budget / price)
    const total = r2(price * shares)
    if (total > cash || total < MIN_TRADE_USD) continue

    const isLong = direction === 'LONG'

    // Announce, don't execute yet — this is the "heads up" stage (see PENDING_ANNOUNCE_DELAY_MS):
    // someone following along live gets a real plan (symbol, price, shares, why) and ~60s to
    // place the same trade themselves before it actually fills. Resolved in step 3.5 above
    // on a FRESH quote next tick, not blindly off this stale plan.
    await supabase.from('academy_auto_pending_entries').insert({
      user_id: userId, symbol: sig.asset.symbol, name: sig.asset.name, direction,
      planned_shares: shares, planned_price: price, setup_tag: sig.setupTag, reason: sig.reason,
      ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
    })

    const learnNote = stat && stat.total >= LEARN_MIN_SAMPLES
      ? ` · ${stat.wins}/${stat.total} (${Math.round(stat.winRate * 100)}%) on this setup`
      : ''
    const barLine = sig.priceAction && sig.priceAction.patterns.length > 0 ? ` · ${sig.priceAction.note}` : ''
    const marketShort = market.regime === 'NEUTRAL' ? 'market flat' : market.regime === 'BULL' ? 'market trending up' : 'market trending down'
    await log(supabase, userId, {
      symbol: sig.asset.symbol, kind: 'PLANNED', price, shares,
      ema9: ind.ema9, ema21: ind.ema21, vwap: ind.vwap, rsi: ind.rsi,
      note: `${sig.setupTag.replace(/_/g, ' ').toLowerCase()} setup (score ${sig.score.toFixed(1)}). RSI ${ind.rsi.toFixed(0)}, VWAP ${fmt(ind.vwap)}, ${ind.volSpike.toFixed(1)}× vol · ${marketShort}${barLine}${learnNote}.`,
    })
    // So nobody has to sit and stare at the tab to catch the ~60s shadow-trading window.
    await sendPushToUser(supabase, userId, {
      title: `Jalayu — about to ${isLong ? 'buy' : 'short'} ${sig.asset.symbol}`,
      body: `${shares} sh @ ~${fmt(price)} (${fmt(total)}) in ~60s — ${sig.setupTag.replace(/_/g, ' ').toLowerCase()}`,
      url: '/dashboard',
    })
    events.push(`Heads up: about to enter ${sig.asset.symbol} (${sig.setupTag})`)
    slotsFree--
  }

  return { ran: true, events }
}
