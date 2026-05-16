'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Position {
  symbol: string
  name: string
  shares: number
  avgBuyPrice: number
  currentPrice: number
  value: number
  pnl: number
  pnlPct: number
  assetType: string
  takeProfitPrice: number | null
  stopLossPrice: number | null
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

interface WatchlistItem {
  id: string
  symbol: string
  name: string | null
}

interface QuoteData {
  price: number
  change: number
  changePct: number
  sparkline: number[]
  name: string
}

interface NewsItem {
  title: string
  link: string
  pubDate: string
  source: string
}

interface SignalSummary {
  symbol: string
  name: string
  price: number
  score: number
  reason: string
}

interface TradingStatus {
  lastRunAt: string | null
  totalTradesRun: number
  assetsScanned: number
  marketOpen: boolean
  topBuys: SignalSummary[]
  topSells: SignalSummary[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtMoney(n: number): string {
  return '$' + fmt(n)
}

function fmtPct(n: number): string {
  return (n >= 0 ? '+' : '') + fmt(n) + '%'
}

function fmtPrice(n: number): string {
  if (n < 0.01) return '$' + n.toFixed(6)
  if (n < 1) return '$' + n.toFixed(4)
  return fmtMoney(n)
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function minutesUntilNextRun(lastRunAt: string | null): string {
  if (!lastRunAt) return '~5 min'
  const elapsed = (Date.now() - new Date(lastRunAt).getTime()) / 60000
  const remaining = Math.max(0, 5 - elapsed)
  if (remaining < 1) return '< 1 min'
  return `~${Math.ceil(remaining)} min`
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) return <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 60
  const h = 24
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 4) - 2
      return `${x},${y}`
    })
    .join(' ')
  const color = positive ? '#2D6A2D' : '#8B1A1A'
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={pts} />
    </svg>
  )
}

function PnLBadge({ value, pct }: { value: number; pct: number }) {
  const pos = value >= 0
  const color = pos ? '#2D6A2D' : '#8B1A1A'
  const bg = pos ? '#2D6A2D18' : '#8B1A1A18'
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: bg,
        borderRadius: 6,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {pos ? '+' : ''}{fmtMoney(value)} ({fmtPct(pct)})
    </span>
  )
}

function Skeleton({ width = '100%', height = 16 }: { width?: string | number; height?: number }) {
  return (
    <div
      style={{
        width,
        height,
        background: 'linear-gradient(90deg, var(--border) 25%, var(--morning) 50%, var(--border) 75%)',
        backgroundSize: '200% 100%',
        borderRadius: 6,
        animation: 'shimmer 1.4s ease infinite',
      }}
    />
  )
}

// ─── Live Status Bar ──────────────────────────────────────────────────────────

function LiveStatusBar({
  status,
  onForceRun,
  forceRunLoading,
}: {
  status: TradingStatus | null
  onForceRun: () => void
  forceRunLoading: boolean
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '12px 18px',
        marginBottom: 16,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {/* Pulsing green dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: '#2D6A2D',
              borderRadius: '50%',
              animation: 'pulse-dot 1.8s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#2D6A2D', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Auto-Trader Live
          </span>
        </div>

        {status ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              Scanning <strong>{status.assetsScanned}</strong> assets
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              Last run:{' '}
              <strong>{status.lastRunAt ? timeAgo(status.lastRunAt) : 'Initializing…'}</strong>
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              Next run: <strong>{minutesUntilNextRun(status.lastRunAt)}</strong>
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {status.marketOpen
                ? <span style={{ color: '#2D6A2D', fontWeight: 600 }}>US market open</span>
                : <span style={{ color: 'var(--text-3)' }}>US market closed (crypto only)</span>
              }
            </span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading status…</span>
        )}
      </div>

      <button
        onClick={onForceRun}
        disabled={forceRunLoading}
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '5px 12px',
          fontSize: 12,
          fontWeight: 600,
          color: '#C4834A',
          cursor: forceRunLoading ? 'not-allowed' : 'pointer',
          opacity: forceRunLoading ? 0.5 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {forceRunLoading ? '⟳ Running…' : '⟳ Force run'}
      </button>
    </div>
  )
}

// ─── Signals Panel ────────────────────────────────────────────────────────────

function SignalsPanel({ status }: { status: TradingStatus | null }) {
  if (!status) return null

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 12,
  }

  function SignalRow({ s, isBuy }: { s: SignalSummary; isBuy: boolean }) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 0',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ flex: '0 0 70px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{s.symbol}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.name}
          </div>
        </div>
        <div style={{ flex: '0 0 70px', textAlign: 'right' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{fmtPrice(s.price)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>{s.reason}</div>
        </div>
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isBuy ? '#2D6A2D' : '#8B1A1A',
              background: isBuy ? '#2D6A2D18' : '#8B1A1A18',
              borderRadius: 6,
              padding: '2px 7px',
            }}
          >
            {isBuy ? '+' : ''}{s.score.toFixed(1)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
      <div style={cardStyle}>
        <div style={labelStyle}>Top Opportunities</div>
        {status.topBuys.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>No strong buy signals right now</div>
        ) : (
          status.topBuys.map((s) => <SignalRow key={s.symbol} s={s} isBuy={true} />)
        )}
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Watching to Exit</div>
        {status.topSells.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>No overbought signals right now</div>
        ) : (
          status.topSells.map((s) => <SignalRow key={s.symbol} s={s} isBuy={false} />)
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TradingView() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(new Map())
  const [news, setNews] = useState<NewsItem[]>([])
  const [tradingStatus, setTradingStatus] = useState<TradingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [forceRunLoading, setForceRunLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [sellingSymbol, setSellingSymbol] = useState<string | null>(null)
  const [addWatchSymbol, setAddWatchSymbol] = useState('')
  const [addWatchOpen, setAddWatchOpen] = useState(false)
  const [addWatchLoading, setAddWatchLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPortfolio = useCallback(async () => {
    const res = await fetch('/api/trading/portfolio')
    if (!res.ok) throw new Error('Failed to load portfolio')
    return res.json() as Promise<Portfolio>
  }, [])

  const fetchTrades = useCallback(async () => {
    const res = await fetch('/api/trading/history')
    if (!res.ok) return []
    return res.json() as Promise<Trade[]>
  }, [])

  const fetchWatchlist = useCallback(async () => {
    const res = await fetch('/api/trading/watchlist')
    if (!res.ok) return []
    return res.json() as Promise<WatchlistItem[]>
  }, [])

  const fetchQuotes = useCallback(async (symbols: string[]) => {
    const results = await Promise.allSettled(
      symbols.map((s) =>
        fetch(`/api/trading/quote?symbol=${s}`)
          .then((r) => r.json())
          .then((d: QuoteData & { symbol: string }) => ({ symbol: s, data: d })),
      ),
    )
    const map = new Map<string, QuoteData>()
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.data?.price) {
        map.set(r.value.symbol, r.value.data)
      }
    }
    return map
  }, [])

  const fetchNews = useCallback(async () => {
    const res = await fetch('/api/trading/news')
    if (!res.ok) return []
    return res.json() as Promise<NewsItem[]>
  }, [])

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/trading/status')
    if (!res.ok) return null
    return res.json() as Promise<TradingStatus>
  }, [])

  const loadAll = useCallback(async () => {
    try {
      setError(null)
      const [pf, tr, wl, nw, st] = await Promise.all([
        fetchPortfolio(),
        fetchTrades(),
        fetchWatchlist(),
        fetchNews(),
        fetchStatus(),
      ])
      setPortfolio(pf)
      setTrades(tr)
      setWatchlist(wl)
      setNews(nw)
      if (st) setTradingStatus(st)

      // Fetch quotes for watchlist
      const symbols = wl.map((w) => w.symbol)
      if (symbols.length > 0) {
        const q = await fetchQuotes(symbols)
        setQuotes(q)
      }

      setLastUpdated(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trading data')
    } finally {
      setLoading(false)
    }
  }, [fetchPortfolio, fetchTrades, fetchWatchlist, fetchNews, fetchStatus, fetchQuotes])

  const refreshData = useCallback(async () => {
    try {
      const [pf, st, wlSymbols] = await Promise.all([
        fetchPortfolio(),
        fetchStatus(),
        Promise.resolve(watchlist.map((w) => w.symbol)),
      ])
      setPortfolio(pf)
      if (st) setTradingStatus(st)
      if (wlSymbols.length > 0) {
        const q = await fetchQuotes(wlSymbols)
        setQuotes(q)
      }
      setLastUpdated(new Date())
    } catch {
      // silent refresh failure
    }
  }, [fetchPortfolio, fetchStatus, fetchQuotes, watchlist])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    intervalRef.current = setInterval(refreshData, 30000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [refreshData])

  const forceRun = async () => {
    setForceRunLoading(true)
    try {
      await fetch('/api/trading/auto', { method: 'POST' })
      await refreshData()
      const tr = await fetchTrades()
      setTrades(tr)
    } finally {
      setForceRunLoading(false)
    }
  }

  const sellAll = async (symbol: string, shares: number) => {
    setSellingSymbol(symbol)
    try {
      await fetch('/api/trading/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, action: 'SELL', shares }),
      })
      await loadAll()
    } finally {
      setSellingSymbol(null)
    }
  }

  const addToWatchlist = async () => {
    if (!addWatchSymbol.trim()) return
    setAddWatchLoading(true)
    try {
      const res = await fetch('/api/trading/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: addWatchSymbol.trim().toUpperCase() }),
      })
      if (res.ok) {
        setAddWatchOpen(false)
        setAddWatchSymbol('')
        const wl = await fetchWatchlist()
        setWatchlist(wl)
        const q = await fetchQuotes(wl.map((w) => w.symbol))
        setQuotes(q)
      } else {
        const d = await res.json()
        setError((d as { error?: string }).error ?? 'Failed to add symbol')
      }
    } finally {
      setAddWatchLoading(false)
    }
  }

  const removeFromWatchlist = async (symbol: string) => {
    await fetch('/api/trading/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    })
    setWatchlist((prev) => prev.filter((w) => w.symbol !== symbol))
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 20px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 4,
  }

  if (loading) {
    return (
      <div style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
        <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton height={52} />
          <Skeleton height={80} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Skeleton height={200} />
            <Skeleton height={200} />
          </div>
          <Skeleton height={300} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 20px 48px', maxWidth: 1100, margin: '0 auto' }}>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 #2D6A2D55; }
          50% { opacity: 0.85; transform: scale(1.15); box-shadow: 0 0 0 5px #2D6A2D00; }
        }
        .trade-row:hover { background: var(--morning) !important; }
        .wl-row:hover { background: var(--morning) !important; }
        .pos-row:hover { background: var(--morning) !important; }
        .news-item:hover { background: var(--morning) !important; cursor: pointer; }
      `}</style>

      {error && (
        <div
          style={{
            background: '#8B1A1A12',
            border: '1px solid #8B1A1A33',
            borderRadius: 10,
            padding: '10px 14px',
            color: '#8B1A1A',
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8B1A1A', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* ── Live Status Bar ── */}
      <LiveStatusBar
        status={tradingStatus}
        onForceRun={forceRun}
        forceRunLoading={forceRunLoading}
      />

      {/* ── Section A: Portfolio Header ── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-end' }}>
            <div>
              <div style={labelStyle}>Net Worth</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.5px' }}>
                {portfolio ? fmtMoney(portfolio.totalValue) : '—'}
              </div>
              {portfolio && (
                <div style={{ fontSize: 13, fontWeight: 600, color: portfolio.totalPnL >= 0 ? '#2D6A2D' : '#8B1A1A', marginTop: 2 }}>
                  {portfolio.totalPnL >= 0 ? '+' : ''}{fmtMoney(portfolio.totalPnL)} ({fmtPct(portfolio.totalPnLPct)})
                </div>
              )}
            </div>
            <div>
              <div style={labelStyle}>Cash</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>
                {portfolio ? fmtMoney(portfolio.cash) : '—'}
              </div>
            </div>
            {tradingStatus && (
              <div>
                <div style={labelStyle}>Total Algo Trades</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
                  {tradingStatus.totalTradesRun}
                </div>
              </div>
            )}
            {lastUpdated && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'flex-end', paddingBottom: 2 }}>
                UI refreshed {timeAgo(lastUpdated.toISOString())}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section B: Algorithm Signals ── */}
      <SignalsPanel status={tradingStatus} />

      {/* ── Section C: Positions + Watchlist ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Positions */}
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Open Positions</div>
          {(!portfolio || portfolio.positions.length === 0) ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              No open positions — algo will enter when signals fire.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {portfolio.positions.map((pos) => {
                const arrow = pos.currentPrice > pos.avgBuyPrice ? '▲' : '▼'
                const arrowColor = pos.pnl >= 0 ? '#2D6A2D' : '#8B1A1A'
                return (
                  <div
                    key={pos.symbol}
                    className="pos-row"
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.1s',
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{pos.symbol}</span>
                        {pos.assetType === 'crypto' && (
                          <span style={{ fontSize: 10, color: '#C4834A', background: '#C4834A18', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>CRYPTO</span>
                        )}
                      </div>
                      <div style={{ flex: 1 }} />
                      <PnLBadge value={pos.pnl} pct={pos.pnlPct} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
                      <span>{fmt(pos.shares, 6)} shares</span>
                      <span>Entry: {fmtPrice(pos.avgBuyPrice)}</span>
                      <span style={{ color: arrowColor, fontWeight: 600 }}>
                        {arrow} {fmtPrice(pos.currentPrice)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      {pos.takeProfitPrice && (
                        <span style={{ fontSize: 11, color: '#2D6A2D', fontWeight: 600 }}>
                          TP: {fmtPrice(pos.takeProfitPrice)}
                        </span>
                      )}
                      {pos.stopLossPrice && (
                        <span style={{ fontSize: 11, color: '#8B1A1A', fontWeight: 600 }}>
                          SL: {fmtPrice(pos.stopLossPrice)}
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={() => sellAll(pos.symbol, pos.shares)}
                        disabled={sellingSymbol === pos.symbol}
                        style={{
                          background: 'none',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          padding: '3px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--text-2)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {sellingSymbol === pos.symbol ? '…' : 'CLOSE'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Watchlist */}
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Watchlist</span>
            <button
              onClick={() => setAddWatchOpen(true)}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                color: '#C4834A',
                cursor: 'pointer',
              }}
            >
              + Add symbol
            </button>
          </div>

          {addWatchOpen && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={addWatchSymbol}
                onChange={(e) => setAddWatchSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && addToWatchlist()}
                placeholder="e.g. GOOG"
                style={{
                  flex: 1,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 13,
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  outline: 'none',
                }}
                autoFocus
              />
              <button
                onClick={addToWatchlist}
                disabled={addWatchLoading}
                style={{
                  background: '#C4834A',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {addWatchLoading ? '…' : 'Add'}
              </button>
              <button
                onClick={() => { setAddWatchOpen(false); setAddWatchSymbol('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16 }}
              >
                ×
              </button>
            </div>
          )}

          {watchlist.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Watchlist empty</div>
          ) : (
            <div>
              {watchlist.map((item) => {
                const q = quotes.get(item.symbol)
                return (
                  <div key={item.symbol}>
                    <div
                      className="wl-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 4px',
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.1s',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ flex: '0 0 52px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{item.symbol}</div>
                        {q && (
                          <div style={{ fontSize: 10, color: q.changePct >= 0 ? '#2D6A2D' : '#8B1A1A', fontWeight: 600 }}>
                            {q.changePct >= 0 ? '+' : ''}{fmt(q.changePct)}%
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {q ? <Sparkline data={q.sparkline} positive={q.changePct >= 0} /> : <Skeleton width={60} height={24} />}
                      </div>
                      <div style={{ flex: '0 0 70px', textAlign: 'right' }}>
                        {q ? (
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmtPrice(q.price)}</div>
                        ) : (
                          <Skeleton width={50} height={14} />
                        )}
                      </div>
                      <button
                        onClick={() => removeFromWatchlist(item.symbol)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, padding: '0 2px', flexShrink: 0 }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Section D: History + News ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Trade History */}
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Trade History</div>
          {trades.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No trades yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Time', 'Symbol', 'B/S', 'Shares', 'Price', 'Total', 'P&L', 'Reason'].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: '0 6px 8px',
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--text-3)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          borderBottom: '1px solid var(--border)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 50).map((t) => {
                    const isBuy = t.action === 'BUY'
                    const isProfit = t.pnl != null && t.pnl >= 0
                    const isLoss = t.pnl != null && t.pnl < 0
                    const rowBg = isBuy ? '#C4834A08' : isProfit ? '#2D6A2D06' : isLoss ? '#8B1A1A06' : undefined
                    return (
                      <tr
                        key={t.id}
                        className="trade-row"
                        style={{ background: rowBg, cursor: 'default' }}
                      >
                        <td style={{ padding: '7px 6px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{timeAgo(t.created_at)}</td>
                        <td style={{ padding: '7px 6px', fontWeight: 700, color: 'var(--text)' }}>{t.symbol}</td>
                        <td style={{ padding: '7px 6px' }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: isBuy ? '#C4834A' : '#2D6A2D',
                              background: isBuy ? '#C4834A18' : '#2D6A2D18',
                              borderRadius: 4,
                              padding: '1px 5px',
                            }}
                          >
                            {t.action}
                          </span>
                        </td>
                        <td style={{ padding: '7px 6px', color: 'var(--text-2)' }}>{fmt(t.shares, 4)}</td>
                        <td style={{ padding: '7px 6px', color: 'var(--text-2)' }}>{fmtPrice(t.price)}</td>
                        <td style={{ padding: '7px 6px', color: 'var(--text)' }}>{fmtMoney(t.total)}</td>
                        <td style={{ padding: '7px 6px' }}>
                          {t.pnl != null ? (
                            <span style={{ fontWeight: 600, color: t.pnl >= 0 ? '#2D6A2D' : '#8B1A1A' }}>
                              {t.pnl >= 0 ? '+' : ''}{fmtMoney(t.pnl)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-3)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '7px 6px', maxWidth: 160 }}>
                          <span style={{ color: 'var(--text-3)', fontSize: 11, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.reason ?? ''}>
                            {t.auto && <span style={{ color: '#C4834A', marginRight: 4 }}>⚡</span>}
                            {t.reason ?? ''}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Market News */}
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Market News</div>
          {news.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No news available.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {news.slice(0, 8).map((item, i) => (
                <a
                  key={i}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="news-item"
                  style={{
                    display: 'block',
                    padding: '10px 6px',
                    borderBottom: i < 7 ? '1px solid var(--border)' : 'none',
                    textDecoration: 'none',
                    borderRadius: 6,
                    transition: 'background 0.1s',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--text)',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, display: 'flex', gap: 8 }}>
                    <span>{item.source}</span>
                    <span>·</span>
                    <span>{item.pubDate ? timeAgo(item.pubDate) : ''}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
