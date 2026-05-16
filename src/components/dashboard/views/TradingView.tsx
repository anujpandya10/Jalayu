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
}

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

interface TickEvent {
  type: 'BUY' | 'SELL' | 'SCAN' | 'SKIP'
  symbol: string
  name: string
  price: number
  shares?: number
  total?: number
  pnl?: number
  reason: string
  ts: number
}

interface ActivityItem {
  id: number
  event: TickEvent
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

// ─── Subcomponents ─────────────────────────────────────────────────────────────

function PulseDot({ active }: { active: boolean }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, flexShrink: 0 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: active ? '#2D6A2D' : '#aaa',
        animation: active ? 'pingDot 1.4s ease-in-out infinite' : 'none',
        opacity: 0.5,
      }} />
      <span style={{
        position: 'relative', display: 'inline-flex', width: 10, height: 10,
        borderRadius: '50%', background: active ? '#2D6A2D' : '#aaa',
      }} />
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
      {/* scanning line */}
      {scanning && (
        <div style={{ color: '#94a3b8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
          <span>Scanning markets…</span>
        </div>
      )}
      {items.length === 0 && !scanning && (
        <div style={{ color: '#64748b' }}>Waiting for first scan…</div>
      )}
      {items.map(({ id, event }) => {
        let color = '#94a3b8'
        let prefix = '·'
        let line = event.reason

        if (event.type === 'BUY') {
          color = '#86efac'
          prefix = '▲ BUY'
          line = `${event.symbol} ${event.shares?.toFixed(6)} @ ${fmtPrice(event.price)} = ${fmtMoney(event.total ?? 0)} — ${event.reason}`
        } else if (event.type === 'SELL') {
          const pnlPos = (event.pnl ?? 0) >= 0
          color = pnlPos ? '#fcd34d' : '#f87171'
          prefix = pnlPos ? '▼ SELL ✓' : '▼ SELL ✗'
          const pnlStr = (event.pnl ?? 0) >= 0
            ? `+${fmtMoney(event.pnl ?? 0)} profit`
            : `-${fmtMoney(Math.abs(event.pnl ?? 0))} loss`
          line = `${event.symbol} — ${pnlStr} — ${event.reason}`
        } else if (event.type === 'SCAN') {
          color = '#60a5fa'
          prefix = '⟳ SCAN'
        } else {
          color = '#475569'
          prefix = '— HOLD'
        }

        return (
          <div key={id} style={{ color, marginBottom: 4, lineHeight: 1.5 }}>
            <span style={{ color: '#475569', marginRight: 6 }}>{timeAgo(event.ts)}</span>
            <span style={{ fontWeight: 700, marginRight: 6 }}>{prefix}</span>
            <span>{line}</span>
          </div>
        )
      })}
    </div>
  )
}

function PositionRow({ pos }: { pos: Position }) {
  const up = pos.pnl >= 0
  const pctFromTP = pos.avgBuyPrice > 0
    ? ((pos.currentPrice - pos.avgBuyPrice * 1.005) / (pos.avgBuyPrice * 0.005)) * 100
    : 0
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '90px 1fr 90px 90px 100px',
      gap: 8,
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
      alignItems: 'center',
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{pos.symbol}</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{pos.name}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
          entry {fmtPrice(pos.avgBuyPrice)} → <span style={{ fontWeight: 600, color: up ? '#2D6A2D' : '#8B1A1A' }}>{fmtPrice(pos.currentPrice)}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
          TP {fmtPrice(pos.avgBuyPrice * 1.005)} · SL {fmtPrice(pos.avgBuyPrice * 0.992)}
        </div>
        {/* progress bar toward TP */}
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 4, maxWidth: 120 }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${Math.min(100, Math.max(0, pctFromTP))}%`,
            background: up ? '#2D6A2D' : '#8B1A1A',
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
          {up ? '+' : ''}{fmtMoney(pos.pnl)}
        </span>
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const TICK_INTERVAL = 20000 // 20 seconds

export default function TradingView() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [lastScan, setLastScan] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(TICK_INTERVAL / 1000)
  const [totalTrades, setTotalTrades] = useState(0)
  const [assetsScanned, setAssetsScanned] = useState(0)

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

  const loadTrades = useCallback(async () => {
    const res = await fetch('/api/trading/history')
    if (res.ok) setTrades(await res.json())
  }, [])

  const loadNews = useCallback(async () => {
    const res = await fetch('/api/trading/news')
    if (res.ok) setNews(await res.json())
  }, [])

  const runTick = useCallback(async () => {
    if (scanning) return
    setScanning(true)
    setCountdown(TICK_INTERVAL / 1000)

    try {
      const res = await fetch('/api/trading/tick', { method: 'POST' })
      if (!res.ok) return
      const data = await res.json() as { events: TickEvent[]; cash: number; assetsScanned: number }

      addActivity(data.events)
      setAssetsScanned(data.assetsScanned)
      setLastScan(Date.now())

      const hadTrades = data.events.some((e) => e.type === 'BUY' || e.type === 'SELL')
      if (hadTrades) {
        setTotalTrades((n) => n + data.events.filter((e) => e.type === 'BUY' || e.type === 'SELL').length)
        await Promise.all([loadPortfolio(), loadTrades()])
      } else {
        // Still update cash from response
        setPortfolio((prev) => prev ? { ...prev, cash: data.cash } : prev)
      }
    } catch { /* silent */ } finally {
      setScanning(false)
    }
  }, [scanning, addActivity, loadPortfolio, loadTrades])

  // Initial load
  useEffect(() => {
    Promise.all([loadPortfolio(), loadTrades(), loadNews()])
      .finally(() => setLoading(false))
  }, [loadPortfolio, loadTrades, loadNews])

  // Run tick immediately, then every 20s
  useEffect(() => {
    // small delay on first run so initial load finishes first
    const initial = setTimeout(() => { runTick() }, 1500)

    tickRef.current = setInterval(() => { runTick() }, TICK_INTERVAL)

    // Countdown timer
    cdRef.current = setInterval(() => {
      setCountdown((n) => Math.max(0, n - 1))
    }, 1000)

    return () => {
      clearTimeout(initial)
      if (tickRef.current) clearInterval(tickRef.current)
      if (cdRef.current) clearInterval(cdRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPnL = portfolio?.totalPnL ?? 0
  const totalPnLPct = portfolio?.totalPnLPct ?? 0

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
            <PulseDot active={true} />
            <span style={{ fontWeight: 800, fontSize: 13, color: '#86efac', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Auto-Trader Live
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              {scanning ? '⟳ Scanning…' : `${assetsScanned} assets scanned`}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Next scan: <strong style={{ color: '#e2e8f0' }}>{countdown}s</strong>
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Trades this session: <strong style={{ color: '#fcd34d' }}>{totalTrades}</strong>
            </span>
            {lastScan && (
              <>
                <span style={{ fontSize: 12, color: '#64748b' }}>·</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>Last: {timeAgo(lastScan)}</span>
              </>
            )}
          </div>
          <button
            onClick={() => { runTick() }}
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
              {totalPnL >= 0 ? '+' : '-'}{fmtMoney(totalPnL)} ({fmtPct(totalPnLPct)})
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Cash Available</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(portfolio?.cash ?? 500)}</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Open Positions</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{portfolio?.positions.length ?? 0}</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total Trades</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{trades.length}</div>
          </div>
        </div>

        {/* ── POSITIONS + TRADE HISTORY ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>

          {/* Open Positions */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Open Positions
            </div>
            {/* Column headers */}
            {(portfolio?.positions.length ?? 0) > 0 && (
              <div style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 90px 90px 100px',
                gap: 8, paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 2,
              }}>
                {['Asset', 'Price / Targets', 'Value', 'Change', 'P&L'].map((h) => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</div>
                ))}
              </div>
            )}
            {(portfolio?.positions.length ?? 0) === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '24px 0' }}>
                No open positions — algo will enter when signals fire
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
                const isBuy = t.action === 'BUY'
                const pnlPos = (t.pnl ?? 0) >= 0
                return (
                  <div key={t.id} className="trade-row" style={{
                    display: 'grid', gridTemplateColumns: '50px 70px 1fr 70px',
                    gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'start',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                      background: isBuy ? '#2D6A2D18' : pnlPos ? '#2D6A2D18' : '#8B1A1A18',
                      color: isBuy ? '#2D6A2D' : pnlPos ? '#2D6A2D' : '#8B1A1A',
                    }}>
                      {isBuy ? 'BUY' : 'SELL'}
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
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Market News
          </div>
          {news.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading news…</div>
          ) : (
            news.slice(0, 8).map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noreferrer" style={{
                display: 'block', textDecoration: 'none',
                padding: '10px 0', borderBottom: i < 7 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, lineHeight: 1.4,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {n.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                  {n.source} · {n.pubDate}
                </div>
              </a>
            ))
          )}
        </div>

      </div>
    </>
  )
}
