'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bot, Play, Pause, RotateCcw, Loader2 } from 'lucide-react'
import { isUsMarketOpenNow } from '@/lib/market-hours'
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

interface AutoStats {
  equityCurve: number[]; seedCapital: number
  totalClosed: number; wins: number; winRatePct: number
  totalRealized: number; realizedToday: number
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
}

/** ENTRY rows cover both buys and shorts — the backend's note always leads with the real verb. */
function entryVerb(note: string): 'Bought' | 'Shorted' {
  return note.startsWith('Shorted') ? 'Shorted' : 'Bought'
}

/** A one-line, scannable fact: what happened, at what price, for what P&L — built from the
 * clean structured columns (not parsed from prose), so it's always exact. The narrative note
 * stays underneath it as the "why" — the bar-read that drove the call. */
function actionSummary(row: LogRow): string {
  const sym = row.symbol ?? ''
  const shares = row.shares != null ? row.shares.toFixed(2) : null
  const price = row.price != null ? `$${row.price.toFixed(2)}` : null
  const pnl = row.pnl != null ? ` → ${row.pnl >= 0 ? '+' : ''}$${row.pnl.toFixed(2)}` : ''
  switch (row.kind) {
    case 'ENTRY': return `${entryVerb(row.note)} ${shares} ${sym} @ ${price}`
    case 'TAKE_HALF': return `Sold a third of ${sym} @ ${price}${pnl}`
    case 'EXIT_FULL': return `Closed ${shares} ${sym} @ ${price}${pnl}`
    case 'STOP_HIT': return `Stopped out of ${sym} @ ${price}${pnl}`
    case 'STOP_MOVED': return `Moved stop on ${sym} to ${price}`
    case 'SCAN': return `Watching ${sym}`
    default: return ''
  }
}

const TICK_MS = 25_000
const REFRESH_MS = 20_000

/**
 * Auto Trader — a fully separate $1000 account that trades itself: US
 * stocks, market hours only, the same setup logic the curriculum teaches.
 * The log below narrates every decision in plain English with the exact
 * EMA9/EMA21/VWAP/RSI it acted on — watch it, then apply the same read
 * yourself on the Practice desk.
 */
export default function AutoTrader() {
  const [portfolio, setPortfolio] = useState<AutoPortfolio | null>(null)
  const [log, setLog] = useState<LogRow[]>([])
  const [stats, setStats] = useState<AutoStats | null>(null)
  const [history, setHistory] = useState<TradeRow[]>([])
  const [reviewSymbol, setReviewSymbol] = useState<string | null>(null)
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

  useEffect(() => {
    void (async () => { await Promise.all([loadPortfolio(), loadLog(), loadStats(), loadHistory()]); setLoading(false) })()
  }, [loadPortfolio, loadLog, loadStats, loadHistory])

  useEffect(() => {
    const id = setInterval(() => { void loadPortfolio(); void loadLog(); void loadStats(); void loadHistory() }, REFRESH_MS)
    return () => clearInterval(id)
  }, [loadPortfolio, loadLog, loadStats, loadHistory])

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

  // Every symbol it's ever traded, most-recent first, for the "review a past trade" picker.
  const tradedSymbols = Array.from(new Set(history.map((t) => t.symbol)))

  // Every real fill on the symbol being reviewed, placed at its exact price + time —
  // an entry is pnl == null, an exit (trim/stop/close) carries the realized pnl.
  const reviewMarkers = history
    .filter((t) => t.symbol === reviewSymbol)
    .map((t) => {
      const isEntry = t.pnl == null
      const verb = isEntry ? (t.direction === 'LONG' ? 'Bought' : 'Shorted') : (t.pnl! >= 0 ? 'Sold +' : 'Sold ')
      const label = isEntry
        ? `${verb} @ $${t.price.toFixed(2)}`
        : `${verb}$${Math.abs(t.pnl!).toFixed(2)} @ $${t.price.toFixed(2)}`
      return {
        time: Math.floor(new Date(t.created_at).getTime() / 1000),
        price: t.price,
        kind: isEntry ? ('BUY' as const) : ('SELL' as const),
        label,
      }
    })

  return (
    <div>
      <div style={{ padding: '14px 16px', borderRadius: 14, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Bot size={16} color="var(--accent)" />
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Auto Trader</h2>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>US stocks · market hours only · its own $1,000</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55, margin: '0 0 10px' }}>
          This account trades itself, combining the curriculum's real setups (momentum, oversold bounce, VWAP, MACD cross,
          Bollinger bounce, fading extremes) with the same break-even + trailing-stop discipline the main bot runs on.
          Every morning at 9:15am ET it preps like a real session — scans, picks a short watchlist, explains why — then
          trades the open. Small, defined losses are normal here; the discipline is letting winners run further than
          losers cost. Watch what it does below, then try the same read yourself on the Practice desk.
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

      {/* Stat tiles + equity curve — the desk's scoreboard */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          <StatTile label="Today's P&L" value={`${stats.realizedToday >= 0 ? '+' : ''}$${stats.realizedToday.toFixed(2)}`} color={stats.realizedToday >= 0 ? '#16A34A' : '#DC2626'} />
          <StatTile label="Total P&L" value={`${stats.totalRealized >= 0 ? '+' : ''}$${stats.totalRealized.toFixed(2)}`} color={stats.totalRealized >= 0 ? '#16A34A' : '#DC2626'} />
          <StatTile label="Win rate" value={`${stats.winRatePct}%`} sub={`${stats.wins}/${stats.totalClosed} trades`} />
          <div style={{ gridColumn: 'span 2', minWidth: 200, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Equity curve (realized)</div>
            <EquityCurve points={stats.equityCurve} seed={stats.seedCapital} />
          </div>
        </div>
      )}

      {/* Live monitor chart — what it's watching/holding right now, read-only */}
      <div style={{ marginBottom: 16 }}>
        <ChartErrorBoundary label="The monitor chart">
          <TradingChart symbol={chartSymbol} position={chartPosition} readOnly />
        </ChartErrorBoundary>
      </div>

      {/* Review a past trade — every real buy/sell plotted on the actual bars, so you can
          see exactly what the chart looked like at the moment it acted, not just read about it. */}
      {tradedSymbols.length > 0 && (
        <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Compare a trade against the bars</h3>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Pick a symbol it&apos;s traded — every real fill shows up on the chart at its exact price and time:
            {' '}<span style={{ color: '#16A34A', fontWeight: 700 }}>▲ green</span> = bought/shorted in,
            {' '}<span style={{ color: '#DC2626', fontWeight: 700 }}>▼ red</span> = sold/closed out. Hover an arrow for the exact fill.
          </p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            {tradedSymbols.map((s) => (
              <button key={s} type="button" onClick={() => setReviewSymbol(s)}
                style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, background: reviewSymbol === s ? 'var(--accent)' : 'var(--morning)', color: reviewSymbol === s ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit' }}>
                {s}
              </button>
            ))}
          </div>
          {reviewSymbol && (
            <ChartErrorBoundary label="The review chart">
              <TradingChart key={reviewSymbol} symbol={reviewSymbol} tradeMarkers={reviewMarkers} readOnly />
            </ChartErrorBoundary>
          )}
        </div>
      )}

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

      {/* Open positions */}
      {portfolio.positions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Open positions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {portfolio.positions.map((pos) => {
              const up = pos.pnl >= 0
              return (
                <div key={pos.symbol} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{pos.symbol}</span>
                        {pos.setupTag && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', background: 'var(--accent)', padding: '1px 6px', borderRadius: 99 }}>{pos.setupTag}</span>}
                        {pos.halfClosed && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-2)', background: 'var(--morning)', padding: '1px 6px', borderRadius: 99 }}>HALF TAKEN</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        {pos.direction === 'SHORT' ? 'Short' : 'Long'} · {pos.shares} sh @ ${pos.avgEntryPrice.toFixed(2)} → ${pos.currentPrice.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {pos.stopPrice != null && <span>Stop ${pos.stopPrice.toFixed(2)}</span>}
                        {pos.target1Price != null && <span>T1 ${pos.target1Price.toFixed(2)}{pos.halfClosed ? ' ✓' : ''}</span>}
                        {pos.target2Price != null && <span>T2 ${pos.target2Price.toFixed(2)}</span>}
                        {pos.entryEma9 != null && <span>Entry EMA9 ${pos.entryEma9.toFixed(2)} / EMA21 ${pos.entryEma21?.toFixed(2)}</span>}
                        {pos.entryVwap != null && <span>Entry VWAP ${pos.entryVwap.toFixed(2)}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: up ? '#15803d' : '#b91c1c' }}>{up ? '+' : ''}{pos.pnlPct.toFixed(2)}%</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>${pos.value.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Today's watchlist — the morning prep, grouped separately for a quick read */}
      {(() => {
        const today = log[0] ? new Date(log[0].created_at).toDateString() : null
        const watchlist = log.filter((r) => r.kind === 'SCAN' && r.symbol && new Date(r.created_at).toDateString() === today)
        if (watchlist.length === 0) return null
        return (
          <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>Today&apos;s watchlist — built at pre-market prep</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {watchlist.map((row) => (
                <div key={row.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--morning)', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  {row.note}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* The narrated trade log — what it did and why, in plain English */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>What it's been doing</h3>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
          Every entry, half-take, stop move, and exit — with the exact EMA9/EMA21/VWAP/RSI it was reading at the time.
        </p>

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
                {log.map((row) => {
                  const meta = row.kind === 'ENTRY'
                    ? { label: entryVerb(row.note), color: entryVerb(row.note) === 'Bought' ? '#3B82F6' : '#7C3AED' }
                    : KIND_META[row.kind] ?? { label: row.kind, color: 'var(--text-2)' }
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
                      <td style={{ padding: '7px 0 7px 0', color: 'var(--text-2)', lineHeight: 1.5, minWidth: 300 }}>
                        {summary && (
                          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 3, fontSize: 12 }}>{summary}</div>
                        )}
                        <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{row.note}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
