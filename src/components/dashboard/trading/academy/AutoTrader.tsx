'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bot, Play, Pause, RotateCcw, Loader2 } from 'lucide-react'
import { isUsMarketOpenNow } from '@/lib/market-hours'
import { useIsDesktop } from '@/lib/useIsDesktop'
import TradingChart from './TradingChart'
import ChartErrorBoundary from './ChartErrorBoundary'

interface AutoPosition {
  symbol: string; name: string; direction: 'LONG' | 'SHORT'
  shares: number; originalShares: number; avgEntryPrice: number; currentPrice: number
  value: number; pnl: number; pnlPct: number; setupTag: string | null; halfClosed: boolean
  stopPrice: number | null; target1Price: number | null; target2Price: number | null
  entryEma9: number | null; entryEma21: number | null; entryVwap: number | null; entryRsi: number | null
}
interface AutoPortfolio {
  cash: number; enabled: boolean; autoStart: boolean; lastSessionDate: string | null
  positions: AutoPosition[]
  totalValue: number; totalPnL: number; totalPnLPct: number; seedCapital: number
}
interface LogRow {
  id: string; symbol: string | null; kind: string; note: string
  price: number | null; shares: number | null; pnl: number | null
  ema9: number | null; ema21: number | null; vwap: number | null; rsi: number | null
  created_at: string
}

interface TradeRow {
  id: string; symbol: string; direction: 'LONG' | 'SHORT'; shares: number; price: number
  pnl: number | null; setup_tag: string | null; created_at: string
}

interface PendingEntry {
  id: string; symbol: string; direction: 'LONG' | 'SHORT'
  planned_shares: number; planned_price: number; setup_tag: string | null
  reason: string | null; planned_at: string
}

interface ShadowPrompt {
  id: string; event_type: 'ENTRY' | 'EXIT'; symbol: string; detail: string; created_at: string
}
interface ShadowBucket { yes: number; no: number; missed: number; total: number; keptUpPct: number | null }
interface ShadowStats { entry: ShadowBucket; exit: ShadowBucket }

interface AutoStats {
  equityCurve: number[]; seedCapital: number
  totalClosed: number; wins: number; winRatePct: number
  totalRealized: number; realizedToday: number
  avgR: number | null; totalR: number | null; bestR: number | null; rSamples: number
  setupStats: { setupTag: string; total: number; wins: number; winRatePct: number; pnl: number }[]
}

const KIND_META: Record<string, { label: string; color: string }> = {
  ENTRY: { label: 'Bought/Shorted', color: '#3B82F6' },
  TAKE_HALF: { label: 'Sold a third', color: '#16A34A' },
  EXIT_FULL: { label: 'Closed', color: '#15803d' },
  STOP_HIT: { label: 'Stopped out', color: '#DC2626' },
  STOP_MOVED: { label: 'Moved stop', color: '#D97706' },
  SCAN: { label: 'Watchlist', color: '#8B5CF6' },
  INFO: { label: 'Note', color: 'var(--text-3)' },
  PLANNED: { label: 'Heads up', color: '#D97706' },
  DEBRIEF: { label: 'Debrief', color: '#0EA5E9' },
}

/** The engine bakes the R-multiple into exit notes as "[+18.5R]" — pull it back out for a
 * clean badge. R = how many units of initial risk the trade returned; the pro's scoreboard. */
function parseRMultiple(note: string): number | null {
  const m = note.match(/\[([+-]?\d+(?:\.\d+)?)R\]/)
  return m ? parseFloat(m[1]) : null
}

/** ENTRY rows cover both buys and shorts — the backend's note always leads with the real verb. */
function entryVerb(note: string): 'Bought' | 'Shorted' {
  return note.startsWith('Shorted') ? 'Shorted' : 'Bought'
}

const fmtExact = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })

/** A one-line, scannable fact: what happened, at what price — built from the clean structured
 * columns (not parsed from prose), so it's always exact. Used for rows with no paired entry
 * to show as a round trip (a bare ENTRY, a SCAN, a stop-move). */
function actionSummary(row: LogRow): string {
  const sym = row.symbol ?? ''
  const shares = row.shares != null ? `${row.shares.toFixed(2)} ` : ''
  const price = row.price != null ? `$${row.price.toFixed(2)}` : '—'
  const pnl = row.pnl != null ? ` → ${row.pnl >= 0 ? '+' : ''}$${row.pnl.toFixed(2)}` : ''
  switch (row.kind) {
    case 'ENTRY': return `${entryVerb(row.note)} ${shares}${sym} @ ${price}`
    case 'TAKE_HALF': return `Sold a third ${shares}@ ${price}${pnl}`
    case 'EXIT_FULL': return `Closed ${shares}@ ${price}${pnl}`
    case 'STOP_HIT': return `Stopped out @ ${price}${pnl}`
    case 'STOP_MOVED': return `Moved stop on ${sym} to ${price}`
    case 'SCAN': return `Watching ${sym}`
    case 'PLANNED': return `Called ${shares}${sym} @ ~${price}`
    default: return ''
  }
}

/** Pull the clean teaching bits back out of the entry note's fixed template — the setup name,
 * the legendary trader + their one-line idea, and the raw-bar read ("Bars: …") — instead of
 * dumping the whole paragraph. */
function parseEntryWhy(note: string): { setup: string | null; trader: string | null; idea: string | null; bars: string | null } {
  const setupMatch = note.match(/—\s*([a-z0-9 ]+?)\s+setup\s*\(score/i)
  const legendMatch = note.match(/This is ([^']+)'s territory — ([^(]+?)(?:\s*\(My record)?\s*$/)
  const barsMatch = note.match(/Bars:\s*([^.]+(?:\.[^.]*)?)\./)
  return {
    setup: setupMatch ? setupMatch[1].trim() : null,
    trader: legendMatch ? legendMatch[1].trim() : null,
    idea: legendMatch ? legendMatch[2].trim().replace(/\.$/, '') : null,
    bars: barsMatch ? barsMatch[1].trim() : null,
  }
}

/** Same idea for the close — the reason always sits after the last " — " in the note. */
function parseCloseWhy(kind: string, note: string): string {
  if (kind === 'TAKE_HALF') return 'Hit the first target — banked a third of the position, moved the stop to break-even, let the rest ride.'
  const idx = note.lastIndexOf(' — ')
  if (idx === -1) return note.replace(/\.$/, '')
  return note.slice(idx + 3).replace(/\.$/, '').trim()
}

const EXIT_KIND_LABEL: Record<string, string> = { TAKE_HALF: 'Trimmed a third', EXIT_FULL: 'Closed', STOP_HIT: 'Stopped out' }

/** Pull the setup name + score out of a SCAN row's fixed template, for "practice for
 * tomorrow" — same parsing approach as parseEntryWhy, applied to the watchlist instead. */
function parseScanRow(note: string): { setupLabel: string; setupTag: string; score: number } | null {
  const m = note.match(/\(score ([-\d.]+),\s*([a-z0-9 ]+)\)/i)
  if (!m) return null
  return { score: parseFloat(m[1]), setupLabel: m[2].trim(), setupTag: m[2].trim().toUpperCase().replace(/ /g, '_') }
}

// The engine's real, fixed risk shape (trading-config.ts) — not invented per-symbol numbers.
const REAL_STOP_PCT = 0.004      // -0.4% hard stop, every setup
const REAL_T1_PCT_LONG = 0.010   // long T1 ≈ half of the 2.0% TP ceiling
const REAL_T1_PCT_SHORT = 0.009  // short T1 ≈ half of the 1.8% TP ceiling

/** The actual teaching unit: bought here because X, closed here because Y — as a small
 * vertical timeline instead of one run-on paragraph, with exact-to-the-second timestamps
 * on both legs and the held duration between them. */
function RoundTrip({ entryRow, exitRow, onView }: { entryRow: LogRow; exitRow: LogRow; onView?: () => void }) {
  const why = parseEntryWhy(entryRow.note)
  const closeWhy = parseCloseWhy(exitRow.kind, exitRow.note)
  const heldMs = new Date(exitRow.created_at).getTime() - new Date(entryRow.created_at).getTime()
  const heldMin = Math.max(0, Math.round(heldMs / 60000))
  const held = heldMin < 60 ? `${heldMin}m` : heldMin < 1440 ? `${Math.floor(heldMin / 60)}h ${heldMin % 60}m` : `${Math.floor(heldMin / 1440)}d ${Math.floor((heldMin % 1440) / 60)}h`
  const isLong = entryRow.note.startsWith('Bought')
  const up = exitRow.pnl == null || exitRow.pnl >= 0
  const rMult = parseRMultiple(exitRow.note)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 320 }}>
      {/* Entry leg */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 1, width: 16, height: 16, borderRadius: 99, background: isLong ? '#16A34A' : '#7C3AED', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isLong ? 'B' : 'S'}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
            {entryVerb(entryRow.note)} {entryRow.shares?.toFixed(2)} sh @ ${entryRow.price?.toFixed(2)}
            <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> · {fmtExact(entryRow.created_at)}</span>
          </div>
          {(why.setup || why.idea) && (
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1, lineHeight: 1.4 }}>
              <strong style={{ color: 'var(--text-2)' }}>Why bought:</strong>{' '}
              {why.setup && <span style={{ textTransform: 'capitalize' }}>{why.setup}</span>}
              {why.idea && <> — {why.idea}{why.trader && ` (${why.trader})`}</>}
            </div>
          )}
          {why.bars && (
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1, lineHeight: 1.4 }}>
              <strong style={{ color: 'var(--text-2)' }}>The bars:</strong> {why.bars}
            </div>
          )}
        </div>
      </div>
      {/* Connector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 7, paddingLeft: 1 }}>
        <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
        <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>held {held}</span>
      </div>
      {/* Exit leg */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 1, width: 16, height: 16, borderRadius: 99, background: up ? '#16A34A' : '#DC2626', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{up ? '✓' : '✕'}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
            {EXIT_KIND_LABEL[exitRow.kind] ?? 'Closed'} {exitRow.shares != null ? `${exitRow.shares.toFixed(2)} sh ` : ''}@ ${exitRow.price?.toFixed(2)}
            {exitRow.pnl != null && <span style={{ color: exitRow.pnl >= 0 ? '#16A34A' : '#DC2626' }}> → {exitRow.pnl >= 0 ? '+' : ''}${exitRow.pnl.toFixed(2)}</span>}
            {rMult != null && (
              <span title="R-multiple: profit measured in units of the risk you took at entry" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: rMult >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.13)', color: rMult >= 0 ? '#16A34A' : '#DC2626' }}>
                {rMult >= 0 ? '+' : ''}{rMult.toFixed(1)}R
              </span>
            )}
            <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> · {fmtExact(exitRow.created_at)}</span>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1, lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--text-2)' }}>Why closed:</strong> {closeWhy}
          </div>
          {onView && (
            <button type="button" onClick={onView}
              style={{ marginTop: 4, padding: 0, border: 'none', background: 'none', color: 'var(--accent)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              View on chart →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const TICK_MS = 25_000
const REFRESH_MS = 20_000
// Mirrors PENDING_ANNOUNCE_DELAY_MS in academy-auto-trader.ts — purely cosmetic for the
// countdown display; the real delay is enforced server-side regardless of this value.
const PENDING_DELAY_SECS = 60
// Looser than the backend's push-notification threshold (0.1%) on purpose — this just
// decides when the collapsed chart pops back open, so it's fine (better, even) to expand
// a little earlier than the actual "about to fire" push.
const NEAR_EXIT_UI_PCT = 0.003

/**
 * Auto Trader — a fully separate $1000 account that trades itself: US
 * stocks, market hours only, the same setup logic the curriculum teaches.
 * The log below narrates every decision in plain English with the exact
 * EMA9/EMA21/VWAP/RSI it acted on — watch it, then apply the same read
 * yourself on the Practice desk.
 */
export default function AutoTrader() {
  const isDesktop = useIsDesktop()
  const [portfolio, setPortfolio] = useState<AutoPortfolio | null>(null)
  const [log, setLog] = useState<LogRow[]>([])
  const [stats, setStats] = useState<AutoStats | null>(null)
  const [history, setHistory] = useState<TradeRow[]>([])
  const [pending, setPending] = useState<PendingEntry[]>([])
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [reviewSymbol, setReviewSymbol] = useState<string | null>(null)
  const [chartMode, setChartMode] = useState<'live' | 'review'>('live')
  const [logExpanded, setLogExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const [shadowPrompts, setShadowPrompts] = useState<ShadowPrompt[]>([])
  const [shadowStats, setShadowStats] = useState<ShadowStats | null>(null)
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  // Collapsed by default — most of the time there's nothing urgent, so the chart stays
  // out of the way until there's an actual heads-up or a position closing in on its exit.
  const [chartCollapsed, setChartCollapsed] = useState(true)
  const autoExpandSigRef = useRef<string>('')
  const chartSectionRef = useRef<HTMLDivElement>(null)

  // Personal notes, local to this browser only (no account sync) — jot down your own read
  // while reviewing a trade, separate from the bot's own narration.
  useEffect(() => { setNotes(localStorage.getItem('jalayu-auto-trader-notes') ?? '') }, [])

  // Drives the "heads up" countdown below — ticks every second purely client-side so the
  // banner counts down smoothly between the 20s server polls, not in visible jumps.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const updateNotes = (v: string) => { setNotes(v); localStorage.setItem('jalayu-auto-trader-notes', v) }

  const openTradeOnChart = (symbol: string) => {
    setChartMode('review')
    setReviewSymbol(symbol)
    chartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  const tickingRef = useRef(false)

  const loadPortfolio = useCallback(async () => {
    const res = await fetch('/api/academy/auto/portfolio', { cache: 'no-store' })
    if (res.ok) setPortfolio(await res.json())
  }, [])
  const loadLog = useCallback(async () => {
    const res = await fetch('/api/academy/auto/log', { cache: 'no-store' })
    if (res.ok) setLog(await res.json())
  }, [])
  const loadStats = useCallback(async () => {
    const res = await fetch('/api/academy/auto/stats', { cache: 'no-store' })
    if (res.ok) setStats(await res.json())
  }, [])
  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/academy/auto/history', { cache: 'no-store' })
    if (res.ok) {
      const rows = await res.json() as TradeRow[]
      setHistory(rows)
      setReviewSymbol((cur) => cur ?? rows[0]?.symbol ?? null)
    }
  }, [])
  const loadPending = useCallback(async () => {
    const res = await fetch('/api/academy/auto/pending', { cache: 'no-store' })
    if (res.ok) setPending(await res.json())
  }, [])
  const loadShadowPrompts = useCallback(async () => {
    const res = await fetch('/api/academy/auto/shadow-feedback', { cache: 'no-store' })
    if (res.ok) setShadowPrompts(await res.json())
  }, [])
  const loadShadowStats = useCallback(async () => {
    const res = await fetch('/api/academy/auto/shadow-stats', { cache: 'no-store' })
    if (res.ok) setShadowStats(await res.json())
  }, [])

  useEffect(() => {
    void (async () => { await Promise.all([loadPortfolio(), loadLog(), loadStats(), loadHistory(), loadPending(), loadShadowPrompts(), loadShadowStats()]); setLoading(false) })()
  }, [loadPortfolio, loadLog, loadStats, loadHistory, loadPending, loadShadowPrompts, loadShadowStats])

  useEffect(() => {
    const id = setInterval(() => {
      void loadPortfolio(); void loadLog(); void loadStats(); void loadHistory(); void loadPending(); void loadShadowPrompts(); void loadShadowStats()
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [loadPortfolio, loadLog, loadStats, loadHistory, loadPending, loadShadowPrompts, loadShadowStats])

  const answerShadow = async (id: string, answer: 'YES' | 'NO') => {
    setAnsweringId(id)
    setShadowPrompts((cur) => cur.filter((p) => p.id !== id)) // optimistic
    try {
      await fetch('/api/academy/auto/shadow-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, answer }),
      })
      await loadShadowStats()
    } finally {
      setAnsweringId(null)
    }
  }

  // Client-side tick while the tab is open, for an instant feel. The cron
  // covers it the rest of the time.
  useEffect(() => {
    const tick = async () => {
      if (tickingRef.current || !portfolio?.enabled) return
      tickingRef.current = true
      try {
        const res = await fetch('/api/academy/auto/tick', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          if (data.events?.length > 0) {
            setLastEvent(data.events[data.events.length - 1])
            await Promise.all([loadPortfolio(), loadLog(), loadHistory()])
          }
        }
      } catch { /* best effort */ } finally { tickingRef.current = false }
    }
    void tick()
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [portfolio?.enabled, loadPortfolio, loadLog, loadHistory])

  const toggle = async () => {
    if (!portfolio) return
    setToggling(true)
    try {
      const res = await fetch('/api/academy/auto/toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !portfolio.enabled }),
      })
      if (res.ok) await loadPortfolio()
    } finally { setToggling(false) }
  }

  const reset = async () => {
    if (!confirm('Reset the Auto Trader? This closes the books on its trades, log, and resets it to $1000 (and turns it off).')) return
    setResetting(true)
    try {
      await fetch('/api/academy/auto/reset', { method: 'POST' })
      setLastEvent(null)
      await Promise.all([loadPortfolio(), loadLog()])
    } finally { setResetting(false) }
  }

  const toggleAutoStart = async () => {
    if (!portfolio) return
    const next = !portfolio.autoStart
    setPortfolio({ ...portfolio, autoStart: next }) // optimistic
    await fetch('/api/academy/auto/autostart', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoStart: next }),
    })
    await loadPortfolio()
  }

  // Auto-expand the (default-collapsed) chart for a genuinely NEW heads-up or a position
  // newly closing in on its exit — but only once per distinct event, via a signature, so
  // it doesn't keep fighting a manual re-collapse every 20s poll while the same event is
  // still active.
  useEffect(() => {
    if (!portfolio) return
    const nearExit = portfolio.positions.filter((p) => {
      if (p.stopPrice == null && p.target1Price == null) return false
      const dStop = p.stopPrice != null ? (p.direction === 'LONG' ? (p.currentPrice - p.stopPrice) / p.currentPrice : (p.stopPrice - p.currentPrice) / p.currentPrice) : Infinity
      const dT1 = !p.halfClosed && p.target1Price != null ? (p.direction === 'LONG' ? (p.target1Price - p.currentPrice) / p.currentPrice : (p.currentPrice - p.target1Price) / p.currentPrice) : Infinity
      return (dStop > 0 && dStop <= NEAR_EXIT_UI_PCT) || (dT1 > 0 && dT1 <= NEAR_EXIT_UI_PCT)
    })
    const sig = [...pending.map((p) => `P:${p.id}`), ...nearExit.map((p) => `N:${p.symbol}`)].sort().join(',')
    if (sig && sig !== autoExpandSigRef.current) {
      autoExpandSigRef.current = sig
      setChartCollapsed(false)
    } else if (!sig) {
      autoExpandSigRef.current = ''
    }
  }, [portfolio, pending])

  if (loading || !portfolio) {
    return <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '24px 0' }}>Loading the auto trader…</div>
  }

  const marketOpen = isUsMarketOpenNow()
  const positive = portfolio.totalPnL >= 0

  // What the monitor chart watches: whatever it's holding, else the first name
  // from today's watchlist, else a sensible default.
  const todayScan = log.find((r) => r.kind === 'SCAN' && r.symbol)
  const heldPos = portfolio.positions[0] ?? null
  const chartSymbol = heldPos?.symbol ?? todayScan?.symbol ?? 'SPY'
  const chartPosition = heldPos ? {
    direction: heldPos.direction, shares: heldPos.shares, avgEntryPrice: heldPos.avgEntryPrice,
    currentPrice: heldPos.currentPrice, pnl: heldPos.pnl, pnlPct: heldPos.pnlPct,
    managed: true, stopPrice: heldPos.stopPrice, target1Price: heldPos.target1Price, target2Price: heldPos.target2Price,
  } : null

  // Which ENTRY row each exit (TAKE_HALF/EXIT_FULL/STOP_HIT) actually closed out — only one
  // position per symbol is ever open at a time, so walking the log forward in time and
  // remembering "the last ENTRY seen for this symbol" reliably pairs them back up.
  const entryForRow = new Map<string, LogRow>()
  {
    const bySymbol = new Map<string, LogRow>()
    const asc = [...log].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    for (const row of asc) {
      if (!row.symbol) continue
      if (row.kind === 'ENTRY') {
        bySymbol.set(row.symbol, row)
      } else if (row.kind === 'TAKE_HALF' || row.kind === 'EXIT_FULL' || row.kind === 'STOP_HIT') {
        const entry = bySymbol.get(row.symbol)
        if (entry) entryForRow.set(row.id, entry)
        if (row.kind === 'EXIT_FULL' || row.kind === 'STOP_HIT') bySymbol.delete(row.symbol)
      }
    }
  }

  // The most recent morning prep's watchlist — real candidates the bot actually flagged,
  // with a real stop/target/odds attached, so "practice for tomorrow" isn't made-up tickers.
  const latestScanDate = log.find((r) => r.kind === 'SCAN')?.created_at
  const latestScanDay = latestScanDate ? new Date(latestScanDate).toDateString() : null
  const todayWatchlist = log
    .filter((r) => r.kind === 'SCAN' && r.symbol && r.price != null && new Date(r.created_at).toDateString() === latestScanDay)
    .slice(0, 3)
    .map((r) => {
      const parsed = parseScanRow(r.note)
      if (!parsed) return null
      const direction: 'LONG' | 'SHORT' = parsed.score >= 0 ? 'LONG' : 'SHORT'
      const price = r.price as number
      const stop = direction === 'LONG' ? price * (1 - REAL_STOP_PCT) : price * (1 + REAL_STOP_PCT)
      const t1pct = direction === 'LONG' ? REAL_T1_PCT_LONG : REAL_T1_PCT_SHORT
      const target = direction === 'LONG' ? price * (1 + t1pct) : price * (1 - t1pct)
      const stat = stats?.setupStats.find((s) => s.setupTag === parsed.setupTag)
      return { row: r, ...parsed, direction, price, stop, target, stat }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // Every symbol it's ever traded, most-recent first, for the "review a past trade" picker.
  const tradedSymbols = Array.from(new Set(history.map((t) => t.symbol)))

  // Every real fill on the symbol being reviewed, placed at its exact price + time —
  // an entry is pnl == null, an exit (trim/stop/close) carries the realized pnl.
  const reviewMarkers = history
    .filter((t) => t.symbol === reviewSymbol)
    .map((t) => {
      const isEntry = t.pnl == null
      // Short on purpose — dense 5m candles leave little room before adjacent
      // markers' text starts overlapping. Full price/P&L is still in the table above.
      const label = isEntry
        ? `${t.direction === 'LONG' ? 'B' : 'Sh'} $${t.price.toFixed(2)}`
        : `${t.pnl! >= 0 ? '+' : ''}$${t.pnl!.toFixed(2)}`
      return {
        time: Math.floor(new Date(t.created_at).getTime() / 1000),
        price: t.price,
        kind: isEntry ? ('BUY' as const) : ('SELL' as const),
        label,
      }
    })

  return (
    <div>
      {/* "Heads up" — about to trade, real plan, ~60s before it actually fires. The whole
          point: pull up the same symbol on another screen and place it yourself in that
          window, so you're trading at the same pace instead of reading about it after. */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pending.map((p) => {
            const elapsedMs = nowTick - new Date(p.planned_at).getTime()
            const secsLeft = Math.max(0, Math.ceil((PENDING_DELAY_SECS * 1000 - elapsedMs) / 1000))
            const isLong = p.direction === 'LONG'
            return (
              <div key={p.id} style={{
                padding: '14px 16px', borderRadius: 14, border: '2px solid #F59E0B',
                background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>⏳ Heads up — about to trade</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
                    {isLong ? 'Buy' : 'Short'} {p.planned_shares.toFixed(2)} sh of {p.symbol} @ ~${p.planned_price.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#D97706', marginTop: 1 }}>
                    ≈ ${(p.planned_shares * p.planned_price).toFixed(2)} going in
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    {p.setup_tag?.replace(/_/g, ' ').toLowerCase()} setup — pull it up on your own screen now
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', fontVariantNumeric: 'tabular-nums' }}>
                  {secsLeft}s
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* "Did you do it too?" — one prompt per real entry/exit, so there's actual data on
          where the pacing breaks down (e.g. keeping up with entries but missing exits)
          instead of just a feeling about it. */}
      {shadowPrompts.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shadowPrompts.map((p) => (
            <div key={p.id} style={{
              padding: '12px 16px', borderRadius: 14, border: '1px solid #3B82F6',
              background: 'rgba(59,130,246,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {p.event_type === 'ENTRY' ? 'Did you also buy in' : 'Did you also sell'} {p.symbol}?
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{p.detail}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" disabled={answeringId === p.id} onClick={() => void answerShadow(p.id, 'YES')}
                  style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none', background: '#16A34A', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Yes
                </button>
                <button type="button" disabled={answeringId === p.id} onClick={() => void answerShadow(p.id, 'NO')}
                  style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  No
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '14px 16px', borderRadius: 14, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Bot size={16} color="var(--accent)" />
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Auto Trader</h2>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>US stocks · market hours only · its own $1,000</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 10px' }}>
          Trades itself every morning at 9:15am ET — tight stops, runners left uncapped. Small losses are normal here.
        </p>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 12, fontSize: 11.5, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={portfolio.autoStart} onChange={() => void toggleAutoStart()} style={{ accentColor: 'var(--accent)' }} />
          Auto-start every trading day at 9:15am ET (no need to click Start) — keeps running after you close this tab
        </label>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>${portfolio.totalValue.toFixed(2)}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: positive ? '#15803d' : '#b91c1c' }}>
              {positive ? '+' : '−'}${Math.abs(portfolio.totalPnL).toFixed(2)} ({positive ? '+' : ''}{portfolio.totalPnLPct.toFixed(2)}%) from $1,000
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
              background: marketOpen ? 'rgba(34,197,94,0.12)' : 'rgba(120,113,108,0.14)', color: marketOpen ? '#15803d' : 'var(--text-3)' }}>
              {marketOpen ? '● Market open' : '○ Market closed'}
            </span>
            <button type="button" onClick={() => void reset()} disabled={resetting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)', cursor: resetting ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {resetting ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Reset
            </button>
            <button type="button" onClick={() => void toggle()} disabled={toggling}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, border: 'none',
                background: portfolio.enabled ? '#DC2626' : '#16A34A', color: '#fff', cursor: toggling ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {toggling ? <Loader2 size={12} className="animate-spin" /> : portfolio.enabled ? <Pause size={12} /> : <Play size={12} />}
              {portfolio.enabled ? 'Stop' : 'Start'} auto trader
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
          Cash ${portfolio.cash.toFixed(2)} · {portfolio.positions.length} open
          {lastEvent && <> · <span style={{ color: 'var(--text-2)' }}>{lastEvent}</span></>}
        </div>
        {!portfolio.enabled && (
          <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 8, background: 'var(--morning)', border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text-2)' }}>
            Off. Hit Start to let it scan and trade during market hours — it'll keep running even after you close this tab.
          </div>
        )}
      </div>

      {/* One chart, two modes — Live (what it's holding/watching right now) and Review
          (any past trade's real fills plotted on the actual bars). Used to be two separate
          chart cards; clicking "View on chart" on any closed trade below jumps here and
          switches to Review automatically, so there's one place to look, not two. */}
      <div ref={chartSectionRef} style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: chartCollapsed ? 0 : 10 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Chart{chartCollapsed && <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> — collapsed, pops open on a heads-up or a close call</span>}
          </h3>
          <button type="button" onClick={() => setChartCollapsed((v) => !v)}
            style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            {chartCollapsed ? 'Show ▾' : 'Hide ▴'}
          </button>
        </div>

        {!chartCollapsed && (
        <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 9, background: 'var(--morning)', border: '1px solid var(--border)' }}>
            <button type="button" onClick={() => setChartMode('live')}
              style={{ padding: '6px 12px', fontSize: 11.5, fontWeight: 700, borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: chartMode === 'live' ? 'var(--surface)' : 'transparent', color: chartMode === 'live' ? 'var(--text)' : 'var(--text-3)' }}>
              ● Live
            </button>
            <button type="button" onClick={() => setChartMode('review')} disabled={tradedSymbols.length === 0}
              style={{ padding: '6px 12px', fontSize: 11.5, fontWeight: 700, borderRadius: 7, border: 'none', cursor: tradedSymbols.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: chartMode === 'review' ? 'var(--surface)' : 'transparent', color: chartMode === 'review' ? 'var(--text)' : 'var(--text-3)', opacity: tradedSymbols.length === 0 ? 0.5 : 1 }}>
              Review a past trade
            </button>
          </div>
          {chartMode === 'live' ? (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>What it&apos;s holding or watching right now</span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              <span style={{ color: '#16A34A', fontWeight: 700 }}>▲ green</span> = bought in · <span style={{ color: '#DC2626', fontWeight: 700 }}>▼ red</span> = sold out — hover an arrow for the exact fill
            </span>
          )}
        </div>

        {chartMode === 'review' && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            {tradedSymbols.map((s) => (
              <button key={s} type="button" onClick={() => setReviewSymbol(s)}
                style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, background: reviewSymbol === s ? 'var(--accent)' : 'var(--morning)', color: reviewSymbol === s ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit' }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Desktop: chart sits beside open positions + scoreboard — what's actually in
            flight right now lives right where you're already looking, not in a separate
            section you have to scroll to find. */}
        {(() => {
          const positions = portfolio.positions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Open now ({portfolio.positions.length})</div>
              {portfolio.positions.map((pos) => <OpenPositionMini key={pos.symbol} pos={pos} />)}
            </div>
          )
          const scoreboard = stats && (
            <>
              <StatTile label="Today's P&L" value={`${stats.realizedToday >= 0 ? '+' : ''}$${stats.realizedToday.toFixed(2)}`} color={stats.realizedToday >= 0 ? '#16A34A' : '#DC2626'} />
              <StatTile label="Total P&L" value={`${stats.totalRealized >= 0 ? '+' : ''}$${stats.totalRealized.toFixed(2)}`} color={stats.totalRealized >= 0 ? '#16A34A' : '#DC2626'} />
              <StatTile label="Win rate" value={`${stats.winRatePct}%`} sub={`${stats.wins}/${stats.totalClosed} trades`} />
              {stats.avgR != null && (
                <StatTile
                  label="Expectancy (avg R)"
                  value={`${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(1)}R`}
                  color={stats.avgR >= 0 ? '#16A34A' : '#DC2626'}
                  sub={`${stats.totalR != null && stats.totalR >= 0 ? '+' : ''}${stats.totalR?.toFixed(1)}R total · best ${stats.bestR != null && stats.bestR >= 0 ? '+' : ''}${stats.bestR?.toFixed(1)}R`}
                />
              )}
              <div style={{ gridColumn: isDesktop ? undefined : 'span 2', minWidth: 200, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Equity curve (realized)</div>
                <EquityCurve points={stats.equityCurve} seed={stats.seedCapital} />
              </div>
              {shadowStats && (shadowStats.entry.total > 0 || shadowStats.exit.total > 0) && (
                <div style={{ gridColumn: isDesktop ? undefined : 'span 2', minWidth: 200, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Keeping pace</div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{shadowStats.entry.keptUpPct ?? '—'}{shadowStats.entry.keptUpPct != null ? '%' : ''}</div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-3)' }}>entries ({shadowStats.entry.yes}/{shadowStats.entry.total})</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{shadowStats.exit.keptUpPct ?? '—'}{shadowStats.exit.keptUpPct != null ? '%' : ''}</div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-3)' }}>exits ({shadowStats.exit.yes}/{shadowStats.exit.total})</div>
                    </div>
                  </div>
                  {shadowStats.entry.keptUpPct != null && shadowStats.exit.keptUpPct != null && Math.abs(shadowStats.entry.keptUpPct - shadowStats.exit.keptUpPct) >= 15 && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5, lineHeight: 1.4 }}>
                      You&apos;re keeping up with {shadowStats.entry.keptUpPct > shadowStats.exit.keptUpPct ? 'entries' : 'exits'} a lot better than {shadowStats.entry.keptUpPct > shadowStats.exit.keptUpPct ? 'exits' : 'entries'}.
                    </div>
                  )}
                </div>
              )}
            </>
          )
          const chart = chartMode === 'live' ? (
            <ChartErrorBoundary label="The monitor chart">
              <TradingChart symbol={chartSymbol} position={chartPosition} readOnly />
            </ChartErrorBoundary>
          ) : reviewSymbol ? (
            <ChartErrorBoundary label="The review chart">
              <TradingChart key={reviewSymbol} symbol={reviewSymbol} tradeMarkers={reviewMarkers} readOnly />
            </ChartErrorBoundary>
          ) : null
          return isDesktop ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
              <div>{chart}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{positions}{scoreboard}</div>
            </div>
          ) : (
            <>
              {positions && <div style={{ marginBottom: 10 }}>{positions}</div>}
              {scoreboard && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>{scoreboard}</div>}
              <div>{chart}</div>
            </>
          )
        })()}
        </>
        )}
      </div>

      {/* Personal notes — local to this browser only, your own read before checking the bot's. */}
      <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>My notes</h3>
        <textarea value={notes} onChange={(e) => updateNotes(e.target.value)} placeholder="e.g. VRNS — I'd have called the BB bounce too, RSI was at 34..."
          style={{ width: '100%', minHeight: 60, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>

      {/* Per-setup learning table */}
      {stats && stats.setupStats.length > 0 && (
        <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>What it&apos;s learning</h3>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 10px' }}>
            Each setup&apos;s real record on this account. Below ~35% over enough tries, it benches that setup; above 60%, it sizes it up. This is how it gets sharper over time.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {stats.setupStats.map((s) => {
              const benched = s.total >= 6 && s.winRatePct < 35
              const favored = s.total >= 6 && s.winRatePct >= 60
              return (
                <div key={s.setupTag} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, alignItems: 'center', padding: '7px 10px', borderRadius: 8, background: 'var(--morning)', fontSize: 11.5 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{s.setupTag.replace(/_/g, ' ')}</span>
                  <span style={{ color: 'var(--text-3)' }}>{s.wins}/{s.total}</span>
                  <span style={{ fontWeight: 700, color: s.winRatePct >= 50 ? '#16A34A' : '#DC2626' }}>{s.winRatePct}%</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, minWidth: 58, textAlign: 'center',
                    background: benched ? 'rgba(239,68,68,0.12)' : favored ? 'rgba(34,197,94,0.12)' : 'transparent',
                    color: benched ? '#DC2626' : favored ? '#16A34A' : 'var(--text-3)' }}>
                    {benched ? 'Benched' : favored ? 'Favored' : 'Normal'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* End-of-day desk recap — the most recent session debrief, surfaced as its own card. */}
      {(() => {
        const debrief = log.find((r) => r.kind === 'DEBRIEF')
        if (!debrief) return null
        return (
          <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 14, border: '1px solid #0EA5E9', background: 'rgba(14,165,233,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Today&apos;s debrief</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{debrief.note.replace(/^📋\s*/, '')}</div>
          </div>
        )
      })()}

      {/* The narrated trade log — collapsed to the last 5 by default; this used to be the
          whole page. Full history is one click away, not the default view. */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>What it&apos;s been doing</h3>
          {log.filter((r) => r.kind !== 'DEBRIEF').length > 5 && (
            <button type="button" onClick={() => setLogExpanded((v) => !v)}
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
              {logExpanded ? 'Show last 5' : `Show all ${log.filter((r) => r.kind !== 'DEBRIEF').length}`}
            </button>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 12px' }}>Last 5 by default — every entry, trim, stop, and exit.</p>

        {log.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', borderRadius: 10, border: '1px dashed var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
            Nothing yet. Hit Start during market hours and check back.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>Time</th>
                  <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>Symbol</th>
                  <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>Action</th>
                  <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>Shares</th>
                  <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>Price</th>
                  <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>P&amp;L</th>
                  <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>EMA9</th>
                  <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>EMA21</th>
                  <th style={{ padding: '0 8px 8px 0', fontWeight: 600 }}>VWAP</th>
                  <th style={{ padding: '0 0 8px 0', fontWeight: 600 }}>What happened</th>
                </tr>
              </thead>
              <tbody>
                {(() => { const rows = log.filter((r) => r.kind !== 'DEBRIEF'); return logExpanded ? rows : rows.slice(0, 5) })().map((row) => {
                  const meta = row.kind === 'ENTRY'
                    ? { label: entryVerb(row.note), color: entryVerb(row.note) === 'Bought' ? '#3B82F6' : '#7C3AED' }
                    : KIND_META[row.kind] ?? { label: row.kind, color: 'var(--text-2)' }
                  const pairedEntry = entryForRow.get(row.id)
                  const isPairedExit = pairedEntry && (row.kind === 'TAKE_HALF' || row.kind === 'EXIT_FULL' || row.kind === 'STOP_HIT')
                  const summary = actionSummary(row)
                  return (
                    <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {new Date(row.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td style={{ padding: '7px 8px 7px 0', fontWeight: 700, color: 'var(--text)' }}>{row.symbol ?? '—'}</td>
                      <td style={{ padding: '7px 8px 7px 0', fontWeight: 700, color: meta.color, whiteSpace: 'nowrap' }}>{meta.label}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-2)' }}>{row.shares != null ? row.shares.toFixed(2) : '—'}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-2)' }}>{row.price != null ? `$${row.price.toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '7px 8px 7px 0', fontWeight: 700, color: row.pnl == null ? 'var(--text-3)' : row.pnl >= 0 ? '#16A34A' : '#DC2626' }}>
                        {row.pnl != null ? `${row.pnl >= 0 ? '+' : ''}$${row.pnl.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-3)' }}>{row.ema9 != null ? row.ema9.toFixed(2) : '—'}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-3)' }}>{row.ema21 != null ? row.ema21.toFixed(2) : '—'}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-3)' }}>{row.vwap != null ? row.vwap.toFixed(2) : '—'}</td>
                      <td style={{ padding: '7px 0 7px 0', color: 'var(--text-2)', lineHeight: 1.5, minWidth: 320 }}>
                        {isPairedExit && pairedEntry ? (
                          <RoundTrip entryRow={pairedEntry} exitRow={row} onView={() => row.symbol && openTradeOnChart(row.symbol)} />
                        ) : (
                          <>
                            {summary && (
                              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 3, fontSize: 12 }}>{summary}</div>
                            )}
                            <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{row.note}</div>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* A guessing game using real candidates from the bot's actual last scan — see the
          symbol + price only, guess the call yourself, then reveal what it actually read. */}
      {todayWatchlist.length > 0 && (
        <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>Test yourself: real stocks, no answer until you tap</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Step n={1} text="Open the symbol on Webull/TradingView" />
            <Step n={2} text="Draw EMA9, EMA21, VWAP — guess long or short" />
            <Step n={3} text="Tap Reveal — check your read against its real call" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todayWatchlist.map((w) => <PracticeCard key={w.row.id} w={w} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-3)' }}>
      <span style={{ width: 16, height: 16, borderRadius: 99, background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
      {text}
    </div>
  )
}

interface WatchlistCandidate {
  row: LogRow; setupLabel: string; setupTag: string; score: number
  direction: 'LONG' | 'SHORT'; price: number; stop: number; target: number
  stat?: { setupTag: string; total: number; wins: number; winRatePct: number; pnl: number }
}

/** Shows symbol + price only — the actual call (direction, setup, stop, target, real odds)
 * stays hidden until tapped, so reading the chart yourself happens BEFORE seeing the answer. */
function PracticeCard({ w }: { w: WatchlistCandidate }) {
  const [revealed, setRevealed] = useState(false)
  const odds = w.stat && w.stat.total >= 6
    ? `${w.stat.winRatePct}% real odds on this account (${w.stat.wins}/${w.stat.total} trades)`
    : 'not enough trades yet to know its real odds'
  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--morning)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>{w.row.symbol}</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>${w.price.toFixed(2)}</span>
        </div>
        {!revealed && (
          <button type="button" onClick={() => setRevealed(true)}
            style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            Reveal the call
          </button>
        )}
      </div>
      {revealed && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', padding: '2px 7px', borderRadius: 99, background: w.direction === 'LONG' ? '#16A34A' : '#7C3AED' }}>
            {w.direction} · {w.setupLabel}
          </span>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11.5, margin: '8px 0 6px' }}>
            <span>Entry <strong style={{ color: 'var(--text)' }}>${w.price.toFixed(2)}</strong></span>
            <span style={{ color: '#DC2626' }}>Stop <strong>${w.stop.toFixed(2)}</strong></span>
            <span style={{ color: '#16A34A' }}>Target <strong>${w.target.toFixed(2)}</strong></span>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{odds}</div>
        </div>
      )}
    </div>
  )
}

/** Compact — lives in the chart's sidebar column now, not its own full-width section. */
function OpenPositionMini({ pos }: { pos: AutoPosition }) {
  const up = pos.pnl >= 0
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{pos.symbol}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: up ? '#16A34A' : '#DC2626' }}>{up ? '+' : ''}{pos.pnlPct.toFixed(2)}%</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
        {pos.direction === 'SHORT' ? 'Short' : 'Long'} {pos.shares} @ ${pos.avgEntryPrice.toFixed(2)} → ${pos.currentPrice.toFixed(2)}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {pos.stopPrice != null && <span>Stop ${pos.stopPrice.toFixed(2)}</span>}
        {pos.target1Price != null && <span>T1 ${pos.target1Price.toFixed(2)}{pos.halfClosed ? ' ✓' : ''}</span>}
      </div>
    </div>
  )
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--text)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function EquityCurve({ points, seed }: { points: number[]; seed: number }) {
  const W = 260, H = 48
  if (points.length < 2) {
    return <div style={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 8 }}>Not enough closed trades yet to plot a curve.</div>
  }
  const series = [seed, ...points]
  const min = Math.min(...series), max = Math.max(...series)
  const range = max - min || 1
  const x = (i: number) => (i / (series.length - 1)) * W
  const y = (v: number) => H - ((v - min) / range) * H
  const path = series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const last = series[series.length - 1]
  const up = last >= seed
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1={0} y1={y(seed)} x2={W} y2={y(seed)} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" />
      <path d={path} fill="none" stroke={up ? '#16A34A' : '#DC2626'} strokeWidth={1.5} />
    </svg>
  )
}
