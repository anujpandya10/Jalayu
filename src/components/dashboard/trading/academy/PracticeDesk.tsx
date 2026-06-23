'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import OrderTicket from './OrderTicket'
import SmartOrderPanel from './SmartOrderPanel'
import TradeReviewCard, { type ReviewTrade, type ReviewVerdict } from './TradeReviewCard'
import TradeReviewFeed from './TradeReviewFeed'
import TradingChart from './TradingChart'
import TradingSchedule from './TradingSchedule'
import ChartErrorBoundary from './ChartErrorBoundary'
import AccountSummary, { type Account } from './AccountSummary'
import ManagePosition from './ManagePosition'
import WatchlistPanel from './WatchlistPanel'
import QuickTradeBar from './QuickTradeBar'
import TradeAdvisor from './TradeAdvisor'

interface Position {
  symbol: string
  name: string
  direction: 'LONG' | 'SHORT'
  shares: number
  avgEntryPrice: number
  currentPrice: number
  value: number
  pnl: number
  pnlPct: number
  declaredSetupTag: string | null
  declaredStopLoss: number | null
  declaredTakeProfit: number | null
  thesis: string | null
  managed: boolean
  halfClosed: boolean
  stopPrice: number | null
  target1Price: number | null
  target2Price: number | null
}

interface OrderRow {
  id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  order_type: string | null
  tif: string | null
  shares: number
  limit_price: number | null
  stop_trigger: number | null
  stop_price: number | null
  target1_price: number | null
  target2_price: number | null
  status: 'PENDING' | 'FILLED' | 'CANCELLED'
  note: string | null
  created_at: string
}

interface Portfolio {
  cash: number
  positions: Position[]
  totalValue: number
  totalPnL: number
  totalPnLPct: number
  seedCapital: number
}

interface BotSetupStat { setupTag: string; totalTrades: number; winRatePct: number; avgPnl: number }
interface HistoryRow extends ReviewTrade { academy_trade_reviews: ReviewVerdict[] }

const HINDSIGHT_POLL_MS = 120_000
const MONITOR_POLL_MS = 25_000

export default function PracticeDesk() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [orderTab, setOrderTab] = useState<'PENDING' | 'FILLED' | 'CANCELLED'>('PENDING')
  const [botStats, setBotStats] = useState<BotSetupStat[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null)
  const [lastTrade, setLastTrade] = useState<{ trade: ReviewTrade; review: ReviewVerdict | null; reviewError: string | null } | null>(null)
  const [resetting, setResetting] = useState(false)
  const [orderMode, setOrderMode] = useState<'quick' | 'smart'>('quick')
  const [toast, setToast] = useState<string | null>(null)
  const [chartSymbol, setChartSymbol] = useState('AAPL')

  const loadPortfolio = useCallback(async () => {
    const res = await fetch('/api/academy/portfolio', { cache: 'no-store' })
    if (res.ok) setPortfolio(await res.json())
  }, [])

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/academy/history', { cache: 'no-store' })
    if (res.ok) setHistory(await res.json())
  }, [])

  const loadOrders = useCallback(async () => {
    const res = await fetch('/api/academy/orders', { cache: 'no-store' })
    if (res.ok) setOrders(await res.json())
  }, [])

  const loadAccount = useCallback(async () => {
    const res = await fetch('/api/academy/account', { cache: 'no-store' })
    if (res.ok) setAccount(await res.json())
  }, [])

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/academy/stats', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setBotStats(data.botSetupStats)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadPortfolio(), loadAccount(), loadHistory(), loadOrders(), loadStats()])
  }, [loadPortfolio, loadAccount, loadHistory, loadOrders, loadStats])

  useEffect(() => {
    void (async () => {
      await refreshAll()
      setLoading(false)
    })()
  }, [refreshAll])

  // Opportunistic hindsight resolution — best effort, only while this desk is mounted.
  const pollingRef = useRef(false)
  useEffect(() => {
    const poll = async () => {
      if (pollingRef.current) return
      pollingRef.current = true
      try {
        const res = await fetch('/api/academy/hindsight', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (data.processed > 0) void loadHistory()
        }
      } catch {
        // best-effort — try again next interval
      } finally {
        pollingRef.current = false
      }
    }
    void poll()
    const id = setInterval(poll, HINDSIGHT_POLL_MS)
    return () => clearInterval(id)
  }, [loadHistory])

  // Auto-managed order monitor — fills due limits + manages brackets while the desk is open.
  // (The per-minute cron does the same server-side when the desk is closed.)
  const monitorRef = useRef(false)
  useEffect(() => {
    const tick = async () => {
      if (monitorRef.current) return
      monitorRef.current = true
      try {
        const res = await fetch('/api/academy/orders/monitor', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          if (data.events && data.events.length > 0) {
            setToast(data.events.map((e: { detail: string }) => e.detail).join('  ·  '))
            await refreshAll()
          }
        }
      } catch {
        // best effort
      } finally {
        monitorRef.current = false
      }
    }
    void tick()
    const id = setInterval(tick, MONITOR_POLL_MS)
    return () => clearInterval(id)
  }, [refreshAll])

  const handleTraded = (result: { trade: ReviewTrade; review: ReviewVerdict | null; reviewError: string | null }) => {
    setLastTrade(result)
    void refreshAll()
  }

  const handleSmartPlaced = (message: string) => {
    setToast(message)
    void refreshAll()
  }

  const cancelOrder = async (id: string) => {
    await fetch('/api/academy/orders/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    void loadOrders()
  }

  const closePosition = async (symbol: string) => {
    setClosingSymbol(symbol)
    try {
      const res = await fetch('/api/academy/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, intent: 'CLOSE' }),
      })
      const json = await res.json()
      if (res.ok) {
        setLastTrade({ trade: json.trade, review: json.review?.verdict ?? null, reviewError: json.reviewError })
        void refreshAll()
      }
    } finally {
      setClosingSymbol(null)
    }
  }

  const resetAccount = async () => {
    if (!confirm(`Reset your practice account? This clears all trades and history and resets cash to $${portfolio?.seedCapital ?? 1000}.`)) return
    setResetting(true)
    try {
      await fetch('/api/academy/reset', { method: 'POST' })
      setLastTrade(null)
      await refreshAll()
    } finally {
      setResetting(false)
    }
  }

  if (loading || !portfolio) {
    return <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '24px 0' }}>Loading practice desk…</div>
  }

  return (
    <div>
      <AccountSummary
        account={account}
        fallbackEquity={portfolio.totalValue}
        seed={portfolio.seedCapital}
        onReset={() => void resetAccount()}
        resetting={resetting}
      />

      {/* ── Chart cockpit ── */}
      <div style={{ marginBottom: 16 }}>
        <ChartErrorBoundary label="The chart">
          <TradingChart
            symbol={chartSymbol}
            onSymbolChange={setChartSymbol}
            position={portfolio.positions.find((p) => p.symbol === chartSymbol) ?? null}
            onTraded={handleSmartPlaced}
          />
        </ChartErrorBoundary>
      </div>

      {/* ── Trade Advisor — the desk's own read on this symbol, auto-updating ── */}
      <div style={{ marginBottom: 16 }}>
        <ChartErrorBoundary label="The trade advisor">
          <TradeAdvisor
            symbol={chartSymbol}
            cash={portfolio.cash}
            hasPosition={portfolio.positions.some((p) => p.symbol === chartSymbol)}
            onTraded={handleSmartPlaced}
          />
        </ChartErrorBoundary>
      </div>

      {/* ── One-click quick trade (charted symbol) ── */}
      <div style={{ marginBottom: 16 }}>
        <ChartErrorBoundary label="Quick trade">
          <QuickTradeBar symbol={chartSymbol} position={portfolio.positions.find((p) => p.symbol === chartSymbol) ?? null} onTraded={handleSmartPlaced} />
        </ChartErrorBoundary>
      </div>

      {/* ── Watchlist ── */}
      <div style={{ marginBottom: 16 }}>
        <ChartErrorBoundary label="The watchlist">
          <WatchlistPanel onPick={setChartSymbol} activeSymbol={chartSymbol} />
        </ChartErrorBoundary>
      </div>

      {/* ── Morning schedule ── */}
      <div style={{ marginBottom: 16 }}>
        <ChartErrorBoundary label="The schedule">
          <TradingSchedule />
        </ChartErrorBoundary>
      </div>

      {portfolio.positions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
            Open positions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {portfolio.positions.map((pos) => {
              const up = pos.pnl >= 0
              return (
                <div key={pos.symbol} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{pos.symbol}</span>
                        {pos.managed && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: 'var(--accent)', padding: '1px 6px', borderRadius: 99 }}>
                            {pos.halfClosed ? 'HALF TAKEN · STOP AT B/E' : 'PROTECTED'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        {pos.direction === 'SHORT' ? 'Short' : 'Long'} · {pos.shares} sh @ ${pos.avgEntryPrice.toFixed(2)} → ${pos.currentPrice.toFixed(2)}
                        {pos.declaredSetupTag && <> · declared {pos.declaredSetupTag}</>}
                      </div>
                      {pos.managed && (
                        <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {pos.stopPrice != null && <span>Stop ${pos.stopPrice.toFixed(2)}</span>}
                          {pos.target1Price != null && <span>T1 ${pos.target1Price.toFixed(2)}{pos.halfClosed ? ' ✓' : ''}</span>}
                          {pos.target2Price != null && <span>T2 ${pos.target2Price.toFixed(2)}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: up ? '#15803d' : '#b91c1c' }}>
                          {up ? '+' : ''}{pos.pnlPct.toFixed(2)}%
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>${pos.value.toFixed(2)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void closePosition(pos.symbol)}
                        disabled={closingSymbol === pos.symbol}
                        style={{
                          padding: '7px 11px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                          border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)',
                          cursor: closingSymbol === pos.symbol ? 'wait' : 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {closingSymbol === pos.symbol ? 'Closing…' : 'Close'}
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <ManagePosition symbol={pos.symbol} currentPrice={pos.currentPrice} onManaged={() => void refreshAll()} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Order blotter — Working / Filled / Canceled */}
      {orders.length > 0 && (() => {
        const counts = {
          PENDING: orders.filter((o) => o.status === 'PENDING').length,
          FILLED: orders.filter((o) => o.status === 'FILLED').length,
          CANCELLED: orders.filter((o) => o.status === 'CANCELLED').length,
        }
        const shown = orders.filter((o) => o.status === orderTab)
        const typeLabel = (o: OrderRow) => (o.order_type ?? 'LIMIT').replace('_', ' ').toLowerCase()
        const trigLabel = (o: OrderRow) => {
          if (o.order_type === 'STOP') return `stop $${Number(o.stop_trigger).toFixed(2)}`
          if (o.order_type === 'STOP_LIMIT') return `stop $${Number(o.stop_trigger).toFixed(2)} → limit $${Number(o.limit_price).toFixed(2)}`
          return `limit $${o.limit_price != null ? Number(o.limit_price).toFixed(2) : '—'}`
        }
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {(['PENDING', 'FILLED', 'CANCELLED'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setOrderTab(s)}
                  style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                    background: orderTab === s ? 'var(--accent)' : 'var(--morning)', color: orderTab === s ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)' }}>
                  {s === 'PENDING' ? 'Working' : s === 'FILLED' ? 'Filled' : 'Canceled'} ({counts[s]})
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shown.length === 0 && <div style={{ padding: 14, textAlign: 'center', borderRadius: 10, border: '1px dashed var(--border)', fontSize: 12, color: 'var(--text-3)' }}>Nothing here.</div>}
              {shown.map((o) => (
                <div key={o.id} style={{ padding: '11px 14px', borderRadius: 12, border: orderTab === 'PENDING' ? '1px dashed var(--border)' : '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{o.symbol} <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)' }}>{o.direction === 'SHORT' ? 'sell' : 'buy'} {typeLabel(o)} · {o.tif ?? 'DAY'}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      {o.shares} sh · {trigLabel(o)}
                      {o.target1_price != null && <> · bracket T1 ${Number(o.target1_price).toFixed(2)} / T2 ${o.target2_price != null ? Number(o.target2_price).toFixed(2) : '—'}</>}
                      {o.note && <> · {o.note}</>}
                    </div>
                  </div>
                  {o.status === 'PENDING' && (
                    <button type="button" onClick={() => void cancelOrder(o.id)}
                      style={{ padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {toast && (
        <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 10, background: 'rgba(10,123,106,0.08)', border: '1px solid var(--accent)', fontSize: 12, color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between', gap: 10, lineHeight: 1.5 }}>
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'inherit', fontSize: 12 }}>✕</button>
        </div>
      )}

      {lastTrade && (
        <div style={{ marginBottom: 16 }}>
          <TradeReviewCard trade={lastTrade.trade} review={lastTrade.review} reviewError={lastTrade.reviewError} />
        </div>
      )}

      {/* Order panel: quick (coached) vs smart (auto-managed) */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, padding: 4, borderRadius: 10, background: 'var(--morning)', border: '1px solid var(--border)' }}>
          {([['quick', 'Quick trade'], ['smart', 'Smart order (auto)']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setOrderMode(id)}
              style={{ flex: 1, padding: '8px 6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: orderMode === id ? 'var(--surface)' : 'transparent', color: orderMode === id ? 'var(--text)' : 'var(--text-3)', boxShadow: orderMode === id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>
        <ChartErrorBoundary label="The order panel">
          {orderMode === 'quick' ? (
            <OrderTicket
              cash={portfolio.cash}
              openSymbols={portfolio.positions.map((p) => p.symbol)}
              botStats={botStats}
              onTraded={handleTraded}
            />
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Smart order</h3>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Set a limit or a bracket and the system manages it for you — fills your limit, takes half at target 1 and slides your stop to break-even, closes the rest at target 2. Runs even when this page is closed.
              </p>
              <SmartOrderPanel onPlaced={handleSmartPlaced} />
            </div>
          )}
        </ChartErrorBoundary>
      </div>

      <TradeReviewFeed trades={history} />
    </div>
  )
}
