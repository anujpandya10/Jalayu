'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  symbol: string
  name: string
  shares: number
  avgBuyPrice: number
  currentPrice: number
  value: number
  pnl: number
  pnlPct: number
  assetType?: string
  direction?: string
}

interface Portfolio {
  cash: number
  positions: Position[]
  totalValue: number
  totalPnL: number
  totalPnLPct: number
}

interface Trade {
  id: string
  symbol: string
  name: string | null
  action: 'BUY' | 'SELL'
  shares: number
  price: number
  total: number
  pnl: number | null
  reason: string | null
  auto: boolean
  created_at: string
  direction?: string | null
}

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

interface TickEvent {
  type: 'LONG_BUY' | 'LONG_SELL' | 'SHORT_OPEN' | 'SHORT_COVER' | 'SCAN' | 'HOLD'
  symbol: string
  name: string
  price: number
  direction: 'LONG' | 'SHORT'
  shares?: number
  total?: number
  pnl?: number
  pnlPct?: number
  reason: string
  urgency?: string
  ts: number
}

interface ActivityItem {
  id: number
  event: TickEvent
}

interface PhaseInfo {
  phase: string
  label: string
  emoji: string
  description: string
  minutesUntilNext: number
  nextPhaseName: string
  cryptoActive: boolean
  stocksActive: boolean
  forexActive: boolean
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

let actId = 0
function nextId() { return ++actId }

function fmtMoney(n: number): string {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPrice(n: number): string {
  if (n < 0.01) return '$' + n.toFixed(6)
  if (n < 1) return '$' + n.toFixed(4)
  return fmtMoney(n)
}
function fmtPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

/** Show recent DB trades in the activity feed on first load */
function tradesToActivity(trades: Trade[]): TickEvent[] {
  return trades.slice(0, 12).map((t) => {
    const ts = new Date(t.created_at).getTime()
    const isShort = t.direction === 'SHORT'
    const closed = t.pnl != null

    if (closed && isShort) {
      return {
        type: 'SHORT_COVER' as const,
        symbol: t.symbol, name: t.name ?? t.symbol, price: t.price,
        direction: 'SHORT' as const, shares: t.shares, total: t.total,
        pnl: t.pnl ?? 0, reason: t.reason ?? 'Cover', ts,
      }
    }
    if (closed) {
      return {
        type: 'LONG_SELL' as const,
        symbol: t.symbol, name: t.name ?? t.symbol, price: t.price,
        direction: 'LONG' as const, shares: t.shares, total: t.total,
        pnl: t.pnl ?? 0, reason: t.reason ?? 'Sell', ts,
      }
    }
    if (isShort) {
      return {
        type: 'SHORT_OPEN' as const,
        symbol: t.symbol, name: t.name ?? t.symbol, price: t.price,
        direction: 'SHORT' as const, shares: t.shares, total: t.total,
        reason: t.reason ?? 'Short open', ts,
      }
    }
    return {
      type: 'LONG_BUY' as const,
      symbol: t.symbol, name: t.name ?? t.symbol, price: t.price,
      direction: 'LONG' as const, shares: t.shares, total: t.total,
      reason: t.reason ?? 'Buy', ts,
    }
  })
}

// ─── Subcomponents ─────────────────────────────────────────────────────────────

function PulseDot({ active, color = '#2D6A2D' }: { active: boolean; color?: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, flexShrink: 0 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: active ? color : '#aaa',
        animation: active ? 'pingDot 1.4s ease-in-out infinite' : 'none',
        opacity: 0.5,
      }} />
      <span style={{
        position: 'relative', display: 'inline-flex', width: 10, height: 10,
        borderRadius: '50%', background: active ? color : '#aaa',
      }} />
    </span>
  )
}

function DirectionChip({ direction }: { direction: 'LONG' | 'SHORT' | string }) {
  const isShort = direction === 'SHORT'
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
      background: isShort ? '#C4834A22' : '#2D6A2D22',
      color: isShort ? '#C4834A' : '#2D6A2D',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
    }}>
      {isShort ? 'SHORT' : 'LONG'}
    </span>
  )
}

function ActivityFeed({ items, scanning }: { items: ActivityItem[]; scanning: boolean }) {
  const feedRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0
  }, [items.length])

  return (
    <div style={{
      background: '#0F1117',
      borderRadius: 12,
      padding: '12px 14px',
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#e2e8f0',
      height: 220,
      overflowY: 'auto',
      marginBottom: 20,
    }} ref={feedRef}>
      {scanning && (
        <div style={{ color: '#94a3b8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
          <span>Scanning for pump &amp; dump signals…</span>
        </div>
      )}
      {items.length === 0 && !scanning && (
        <div style={{ color: '#64748b' }}>Waiting for first scan…</div>
      )}
      {items.map(({ id, event }) => {
        let color = '#94a3b8'
        let prefix = '·'
        let line = event.reason

        if (event.type === 'LONG_BUY') {
          color = '#86efac'
          prefix = '▲ LONG'
          line = `${event.symbol} ${event.shares?.toFixed(6)} @ ${fmtPrice(event.price)} = ${fmtMoney(event.total ?? 0)} — ${event.reason}`
        } else if (event.type === 'LONG_SELL') {
          const pnlPos = (event.pnl ?? 0) >= 0
          color = pnlPos ? '#fcd34d' : '#f87171'
          prefix = pnlPos ? '▼ LONG EXIT ✓' : '▼ LONG EXIT ✗'
          const pnlVal = event.pnl ?? 0
          const pnlStr = pnlVal >= 0
            ? `+$${Math.abs(pnlVal).toFixed(3)} profit`
            : `-$${Math.abs(pnlVal).toFixed(3)} loss`
          line = `${event.symbol} — ${pnlStr} — ${event.reason}`
        } else if (event.type === 'SHORT_OPEN') {
          color = '#fdba74'  // orange
          prefix = '▼ SHORT ↓'
          line = `${event.symbol} shorted ${event.shares?.toFixed(6)} @ ${fmtPrice(event.price)} = ${fmtMoney(event.total ?? 0)} — ${event.reason}`
        } else if (event.type === 'SHORT_COVER') {
          const pnlPos = (event.pnl ?? 0) >= 0
          color = pnlPos ? '#fcd34d' : '#f87171'
          prefix = pnlPos ? '▲ COVER ✓' : '▲ COVER ✗'
          const pnlVal = event.pnl ?? 0
          const pnlStr = pnlVal >= 0
            ? `+$${Math.abs(pnlVal).toFixed(3)} profit`
            : `-$${Math.abs(pnlVal).toFixed(3)} loss`
          line = `${event.symbol} covered — ${pnlStr} — ${event.reason}`
        } else if (event.type === 'SCAN') {
          color = '#60a5fa'
          prefix = '⟳ SCAN'
        } else {
          color = '#475569'
          prefix = '— HOLD'
        }

        return (
          <div key={id} style={{ color, marginBottom: 4, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: '#475569' }}>{timeAgo(event.ts)}</span>
            <span style={{ fontWeight: 700 }}>{prefix}</span>
            {(event.type === 'LONG_BUY' || event.type === 'LONG_SELL' || event.type === 'SHORT_OPEN' || event.type === 'SHORT_COVER') && (
              <DirectionChip direction={event.direction} />
            )}
            <span>{line}</span>
          </div>
        )
      })}
    </div>
  )
}

function PositionRow({ pos }: { pos: Position }) {
  const isShort = pos.direction === 'SHORT'
  // For LONG: profit = price rose. For SHORT: profit = price fell (pnl is already computed correctly)
  const up = pos.pnl >= 0

  // Progress bar: for LONG toward TP; for SHORT toward dump
  const pctFromTP = pos.avgBuyPrice > 0
    ? isShort
      ? ((pos.avgBuyPrice - pos.currentPrice) / (pos.avgBuyPrice * 0.005)) * 100  // SHORT: progress toward drop
      : ((pos.currentPrice - pos.avgBuyPrice * 1.005) / (pos.avgBuyPrice * 0.005)) * 100
    : 0

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '100px 1fr 90px 90px 100px',
      gap: 8,
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
      alignItems: 'center',
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
          {pos.symbol}
          <DirectionChip direction={isShort ? 'SHORT' : 'LONG'} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{pos.name}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
          entry {fmtPrice(pos.avgBuyPrice)} → <span style={{ fontWeight: 600, color: up ? '#2D6A2D' : '#8B1A1A' }}>{fmtPrice(pos.currentPrice)}</span>
        </div>
        {isShort ? (
          <div style={{ fontSize: 10, color: '#C4834A', marginTop: 2 }}>
            need it to DROP · TP {fmtPrice(pos.avgBuyPrice * 0.9985)} · SL {fmtPrice(pos.avgBuyPrice * 1.003)}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
            TP {fmtPrice(pos.avgBuyPrice * 1.005)} · SL {fmtPrice(pos.avgBuyPrice * 0.997)}
          </div>
        )}
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 4, maxWidth: 120 }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${Math.min(100, Math.max(0, pctFromTP))}%`,
            background: up ? (isShort ? '#C4834A' : '#2D6A2D') : '#8B1A1A',
          }} />
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>{fmtMoney(pos.value)}</div>
      <div style={{ textAlign: 'right' }}>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: up ? '#2D6A2D' : '#8B1A1A',
          background: up ? '#2D6A2D18' : '#8B1A1A18',
          borderRadius: 6, padding: '2px 7px',
        }}>
          {up ? '+' : ''}{fmtPct(pos.pnlPct)}
        </span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: up ? '#2D6A2D' : '#8B1A1A', fontWeight: 600 }}>
          {up ? '+' : '-'}{fmtMoney(Math.abs(pos.pnl))}
        </span>
      </div>
    </div>
  )
}

// ─── Phase Banner ──────────────────────────────────────────────────────────────

function PhaseBanner({ phase }: { phase: PhaseInfo | null }) {
  if (!phase) return null

  const colors: Record<string, { bg: string; text: string; border: string }> = {
    CRYPTO_NIGHT: { bg: '#1a1035', text: '#a78bfa', border: '#4c1d95' },
    PREMARKET:    { bg: '#1a2a1a', text: '#86efac', border: '#166534' },
    STOCK_MARKET: { bg: '#1a2510', text: '#bef264', border: '#3f6212' },
    AFTER_HOURS:  { bg: '#1a1a2e', text: '#93c5fd', border: '#1d4ed8' },
    FOREX_NIGHT:  { bg: '#1a1035', text: '#a78bfa', border: '#4c1d95' },
  }
  const c = colors[phase.phase] ?? colors.CRYPTO_NIGHT
  const hrs = Math.floor(phase.minutesUntilNext / 60)
  const mins = phase.minutesUntilNext % 60
  const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`

  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 10, padding: '10px 16px', marginBottom: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{phase.emoji}</span>
        <div>
          <span style={{ fontWeight: 800, fontSize: 13, color: c.text }}>{phase.label.toUpperCase()}</span>
          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 10 }}>{phase.description}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {phase.cryptoActive && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#86efac22', color: '#86efac' }}>
            ₿ CRYPTO
          </span>
        )}
        {phase.stocksActive && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#bef26422', color: '#bef264' }}>
            📊 STOCKS
          </span>
        )}
        {phase.forexActive && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#93c5fd22', color: '#93c5fd' }}>
            💱 FOREX
          </span>
        )}
        <span style={{ fontSize: 11, color: '#475569' }}>{timeStr} until {phase.nextPhaseName}</span>
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

/** Scan + UI refresh interval (tab open). Vercel cron also runs ~every 1 min when tab is closed. */
const REFRESH_INTERVAL = 15000

export default function TradingView() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [newsRefreshing, setNewsRefreshing] = useState(false)
  const [newsLastFetched, setNewsLastFetched] = useState<number | null>(null)
  const [newItemKeys, setNewItemKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [lastScan, setLastScan] = useState<number | null>(null)
  const [serverLastRun, setServerLastRun] = useState<string | null>(null)
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const [totalTrades, setTotalTrades] = useState(0)
  const [assetsScanned, setAssetsScanned] = useState(0)
  const [pumpCandidates, setPumpCandidates] = useState(0)
  const [currentLongs, setCurrentLongs] = useState(0)
  const [currentShorts, setCurrentShorts] = useState(0)
  const [currentPhase, setCurrentPhase] = useState<PhaseInfo | null>(null)

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const addActivity = useCallback((events: TickEvent[]) => {
    const items: ActivityItem[] = events.map((e) => ({ id: nextId(), event: e }))
    setActivity((prev) => [...items, ...prev].slice(0, 200))
  }, [])

  const loadPortfolio = useCallback(async () => {
    const res = await fetch('/api/trading/portfolio')
    if (res.ok) setPortfolio(await res.json())
  }, [])

  const loadTrades = useCallback(async (seedFeed = false) => {
    const res = await fetch('/api/trading/history')
    if (!res.ok) return
    const data = await res.json() as Trade[]
    setTrades(data)
    if (seedFeed && data.length > 0) {
      setActivity((prev) => {
        if (prev.length > 0) return prev
        return tradesToActivity(data).map((event) => ({ id: nextId(), event }))
      })
    }
  }, [])

  const loadNews = useCallback(async (silent = false) => {
    if (!silent) setNewsRefreshing(true)
    try {
      const res = await fetch('/api/trading/news', { cache: 'no-store' })
      if (!res.ok) return
      const fresh: NewsItem[] = await res.json()
      setNews((prev) => {
        const prevTitles = new Set(prev.map((n) => n.title))
        const newKeys = new Set(fresh.filter((n) => !prevTitles.has(n.title)).map((n) => n.title))
        if (newKeys.size > 0) {
          setNewItemKeys(newKeys)
          // clear NEW badges after 30s
          setTimeout(() => setNewItemKeys(new Set()), 30_000)
        }
        return fresh
      })
      setNewsLastFetched(Date.now())
    } finally {
      setNewsRefreshing(false)
    }
  }, [])

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/trading/status')
    if (!res.ok) return
    const data = await res.json() as {
      lastRunAt?: string | null
      totalTradesRun?: number
      autoTradingEnabled?: boolean
      assetsScanned?: number
      pumpCandidates?: number
      phase?: PhaseInfo
    }
    if (data.lastRunAt) setServerLastRun(data.lastRunAt)
    if (data.totalTradesRun != null) setTotalTrades(data.totalTradesRun)
    if (data.autoTradingEnabled != null) setAutoTradingEnabled(data.autoTradingEnabled)
    if (data.assetsScanned != null) setAssetsScanned(data.assetsScanned)
    if (data.pumpCandidates != null) setPumpCandidates(data.pumpCandidates)
    if (data.phase) setCurrentPhase(data.phase)
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadPortfolio(), loadTrades(), loadStatus()])
    setLastScan(Date.now())
  }, [loadPortfolio, loadTrades, loadStatus])

  const runTick = useCallback(async (force = false) => {
    if (scanning) return
    setScanning(true)
    setCountdown(REFRESH_INTERVAL / 1000)

    try {
      const url = force ? '/api/trading/tick?force=1' : '/api/trading/tick'
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string }
        addActivity([{
          type: 'HOLD', symbol: '', name: '', price: 0, direction: 'LONG',
          reason: `Scan failed (${res.status}): ${errBody.error ?? 'check login / deploy'}`,
          ts: Date.now(),
        }])
        return
      }
      const data = await res.json() as {
        events: TickEvent[]
        cash: number
        assetsScanned: number
        pumpCandidates?: number
        currentLongs?: number
        currentShorts?: number
        phase?: PhaseInfo
        skipped?: boolean
        tradesExecuted?: number
      }

      if (data.events?.length) addActivity(data.events)
      setAssetsScanned(data.assetsScanned)
      setPumpCandidates(data.pumpCandidates ?? 0)
      setCurrentLongs(data.currentLongs ?? 0)
      setCurrentShorts(data.currentShorts ?? 0)
      if (data.phase) setCurrentPhase(data.phase)
      setLastScan(Date.now())

      const hadTrades = data.events.some((e) =>
        e.type === 'LONG_BUY' || e.type === 'LONG_SELL' ||
        e.type === 'SHORT_OPEN' || e.type === 'SHORT_COVER'
      )
      await refreshAll()
      if ((data.tradesExecuted ?? 0) > 0) {
        setTotalTrades((n) => n + (data.tradesExecuted ?? 0))
      }
    } catch { /* silent */ } finally {
      setScanning(false)
    }
  }, [scanning, addActivity, refreshAll])

  // Boot: load data, seed feed from history, run first scan immediately
  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      await Promise.all([
        loadPortfolio(),
        loadTrades(true),
        loadNews(),
        loadStatus(),
      ])
      if (!cancelled) setLoading(false)
      if (!cancelled) await runTick(true)
    }
    boot()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // While tab is open: scan every 15s (updates activity + portfolio)
  useEffect(() => {
    tickRef.current = setInterval(() => { runTick(false) }, REFRESH_INTERVAL)
    cdRef.current = setInterval(() => {
      setCountdown((n) => (n <= 0 ? REFRESH_INTERVAL / 1000 : n - 1))
    }, 1000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      if (cdRef.current) clearInterval(cdRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh news every 5 minutes while tab is open
  useEffect(() => {
    const id = setInterval(() => { loadNews(true) }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [loadNews])

  const totalPnL = portfolio?.totalPnL ?? 0
  const totalPnLPct = portfolio?.totalPnLPct ?? 0
  const hasShorts = currentShorts > 0

  if (loading) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading trading engine…</div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes pingDot {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .trade-row { animation: fadeSlide 0.3s ease forwards; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 80px' }}>

        {/* ── STATUS BAR ── */}
        <div style={{
          background: '#0F1117',
          borderRadius: 12,
          padding: '12px 18px',
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <PulseDot active={true} color={hasShorts ? '#C4834A' : '#2D6A2D'} />
            <span style={{
              fontWeight: 800, fontSize: 13,
              color: hasShorts ? '#fdba74' : '#86efac',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              {autoTradingEnabled ? (hasShorts ? 'SERVER AUTO-TRADE ON' : '24/7 Server Trading') : 'Auto-trade paused'}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }} title="Runs on Vercel every minute — Mac can be off">
              {autoTradingEnabled ? '☁️ Cloud cron ~1min' : 'Enable in Supabase'}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              {scanning ? '⟳ Updating…' : `${assetsScanned || '—'} assets`}
            </span>
            {pumpCandidates > 0 && (
              <>
                <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
                <span style={{ fontSize: 12, color: '#fdba74', fontWeight: 700 }}>
                  {pumpCandidates} pump candidates
                </span>
              </>
            )}
            <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              UI refresh: <strong style={{ color: '#e2e8f0' }}>{countdown}s</strong>
            </span>
            {serverLastRun && (
              <>
                <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Server: {timeAgo(new Date(serverLastRun).getTime())}
                </span>
              </>
            )}
            <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Trades: <strong style={{ color: '#fcd34d' }}>{totalTrades}</strong>
            </span>
            {lastScan && (
              <>
                <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>Last: {timeAgo(lastScan)}</span>
              </>
            )}
          </div>
          <button
            onClick={() => { runTick(true) }}
            disabled={scanning}
            style={{
              background: 'none', border: '1px solid #334155', borderRadius: 8,
              padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#C4834A',
              cursor: scanning ? 'not-allowed' : 'pointer', opacity: scanning ? 0.5 : 1,
            }}
          >
            {scanning ? '⟳ Running…' : '⟳ Force scan'}
          </button>
        </div>

        {/* ── PHASE BANNER ── */}
        <PhaseBanner phase={currentPhase} />

        {/* ── LIVE ACTIVITY FEED ── */}
        <ActivityFeed items={activity} scanning={scanning} />

        {/* ── PORTFOLIO HEADER ── */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '20px 24px', marginBottom: 20,
          display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Net Worth</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {fmtMoney(portfolio?.totalValue ?? 500)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: totalPnL >= 0 ? '#2D6A2D' : '#8B1A1A', marginTop: 2 }}>
              {totalPnL >= 0 ? '+' : '-'}{fmtMoney(Math.abs(totalPnL))} ({fmtPct(totalPnLPct)})
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Cash Available</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(portfolio?.cash ?? 500)}</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Positions</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{portfolio?.positions.length ?? 0}</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>
              <span style={{ color: '#2D6A2D', fontWeight: 700 }}>{currentLongs}L</span>
              <span style={{ color: 'var(--text-3)', margin: '0 4px' }}>·</span>
              <span style={{ color: '#C4834A', fontWeight: 700 }}>{currentShorts}S</span>
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total Trades</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{trades.length}</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Running P&amp;L</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: totalPnL >= 0 ? '#2D6A2D' : '#8B1A1A' }}>
              {totalPnL >= 0 ? '+' : ''}{fmtPct(totalPnLPct)}
            </div>
          </div>
        </div>

        {/* ── POSITIONS + TRADE HISTORY ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>

          {/* Open Positions */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Open Positions
              {currentShorts > 0 && (
                <span style={{ marginLeft: 8, color: '#C4834A', fontSize: 10, fontWeight: 700 }}>
                  {currentShorts} SHORT{currentShorts > 1 ? 'S' : ''} OPEN
                </span>
              )}
            </div>
            {(portfolio?.positions.length ?? 0) > 0 && (
              <div style={{
                display: 'grid', gridTemplateColumns: '100px 1fr 90px 90px 100px',
                gap: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 2,
              }}>
                {['Asset', 'Price / Targets', 'Value', 'Change', 'P&L'].map((h) => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</div>
                ))}
              </div>
            )}
            {(portfolio?.positions.length ?? 0) === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '24px 0' }}>
                No open positions — algo scanning for longs &amp; short setups
              </div>
            ) : (
              portfolio!.positions.map((pos) => <PositionRow key={pos.symbol} pos={pos} />)
            )}
          </div>

          {/* Trade History */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', maxHeight: 500, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Trade History
            </div>
            {trades.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '24px 0' }}>No trades yet</div>
            ) : (
              trades.map((t) => {
                const isShortPos = t.direction === 'SHORT'
                const isBuy = t.action === 'BUY'
                const pnlPos = (t.pnl ?? 0) >= 0

                // Label: LONG BUY, LONG SELL, SHORT OPEN, SHORT COVER
                let label = isBuy ? 'BUY' : 'SELL'
                let labelColor = isBuy ? '#2D6A2D' : (pnlPos ? '#2D6A2D' : '#8B1A1A')
                let labelBg = isBuy ? '#2D6A2D18' : (pnlPos ? '#2D6A2D18' : '#8B1A1A18')
                if (isShortPos) {
                  label = isBuy ? 'SHORT' : 'COVER'
                  labelColor = '#C4834A'
                  labelBg = '#C4834A18'
                }

                return (
                  <div key={t.id} className="trade-row" style={{
                    display: 'grid', gridTemplateColumns: '60px 70px 1fr 70px',
                    gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'start',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                      background: labelBg, color: labelColor,
                    }}>
                      {label}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{t.symbol}</div>
                      {t.auto && <span style={{ fontSize: 9, color: '#C4834A', fontWeight: 700 }}>⚡ algo</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                      {fmtPrice(t.price)} × {Number(t.shares).toFixed(4)} = {fmtMoney(t.total)}
                      {t.pnl != null && (
                        <span style={{ marginLeft: 6, fontWeight: 600, color: pnlPos ? '#2D6A2D' : '#8B1A1A' }}>
                          {pnlPos ? '+' : '-'}{fmtMoney(Math.abs(t.pnl))}
                        </span>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{t.reason}</div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'right' }}>
                      {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── MARKET NEWS ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Market News
              </span>
              {newsRefreshing && (
                <span style={{ fontSize: 11, color: '#C4834A', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                  Refreshing…
                </span>
              )}
              {newsLastFetched && !newsRefreshing && (
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  Updated {Math.round((Date.now() - newsLastFetched) / 60000) < 1
                    ? 'just now'
                    : `${Math.round((Date.now() - newsLastFetched) / 60000)}m ago`}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                🔄 Auto-refreshes every 5 min
              </span>
              <button
                onClick={() => loadNews()}
                disabled={newsRefreshing}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px',
                  background: 'var(--morning)', border: '1px solid var(--border)',
                  borderRadius: 99, cursor: newsRefreshing ? 'not-allowed' : 'pointer',
                  color: 'var(--text-2)', opacity: newsRefreshing ? 0.5 : 1,
                }}
              >
                Refresh now
              </button>
            </div>
          </div>

          {news.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '12px 0' }}>
              {newsRefreshing ? 'Loading latest news…' : 'No news loaded yet.'}
            </div>
          ) : (
            news.slice(0, 8).map((n, i) => {
              const isNew = newItemKeys.has(n.title)
              // Try to detect if it's recent (within 2h) from pubDate
              let isRecent = false
              try {
                const pub = new Date(n.pubDate)
                isRecent = !isNaN(pub.getTime()) && (Date.now() - pub.getTime()) < 2 * 60 * 60 * 1000
              } catch { /* ok */ }

              return (
                <a
                  key={n.title + i}
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'block', textDecoration: 'none',
                    padding: '10px 0',
                    borderBottom: i < Math.min(news.length, 8) - 1 ? '1px solid var(--border)' : 'none',
                    animation: isNew ? 'fadeSlide 0.4s ease forwards' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    {(isNew || isRecent) && (
                      <span style={{
                        flexShrink: 0, marginTop: 2,
                        fontSize: 8, fontWeight: 800, padding: '2px 5px',
                        background: isNew ? '#6366F1' : '#22C55E',
                        color: '#fff', borderRadius: 4, letterSpacing: '0.05em',
                      }}>
                        {isNew ? 'NEW' : 'LIVE'}
                      </span>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 13, color: 'var(--text)', fontWeight: 500, lineHeight: 1.45,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, display: 'flex', gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{n.source}</span>
                        <span>·</span>
                        <span>{isRecent
                          ? `${Math.round((Date.now() - new Date(n.pubDate).getTime()) / 60000)}m ago`
                          : n.pubDate}</span>
                      </div>
                    </div>
                  </div>
                </a>
              )
            })
          )}
        </div>

      </div>
    </>
  )
}
