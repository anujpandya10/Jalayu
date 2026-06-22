'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RotateCcw, Loader2 } from 'lucide-react'
import OrderTicket from './OrderTicket'
import TradeReviewCard, { type ReviewTrade, type ReviewVerdict } from './TradeReviewCard'
import TradeReviewFeed from './TradeReviewFeed'
import TradingChart from './TradingChart'
import TradingSchedule from './TradingSchedule'
import ChartErrorBoundary from './ChartErrorBoundary'

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

export default function PracticeDesk() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [botStats, setBotStats] = useState<BotSetupStat[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null)
  const [lastTrade, setLastTrade] = useState<{ trade: ReviewTrade; review: ReviewVerdict | null; reviewError: string | null } | null>(null)
  const [resetting, setResetting] = useState(false)

  const loadPortfolio = useCallback(async () => {
    const res = await fetch('/api/academy/portfolio', { cache: 'no-store' })
    if (res.ok) setPortfolio(await res.json())
  }, [])

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/academy/history', { cache: 'no-store' })
    if (res.ok) setHistory(await res.json())
  }, [])

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/academy/stats', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setBotStats(data.botSetupStats)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadPortfolio(), loadHistory(), loadStats()])
  }, [loadPortfolio, loadHistory, loadStats])

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

  const handleTraded = (result: { trade: ReviewTrade; review: ReviewVerdict | null; reviewError: string | null }) => {
    setLastTrade(result)
    void refreshAll()
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

  const positive = portfolio.totalPnL >= 0

  return (
    <div>
      <div style={{
        padding: '18px 20px', borderRadius: 14, marginBottom: 16,
        background: 'var(--surface)', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Practice account</div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>${portfolio.totalValue.toFixed(2)}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, color: positive ? '#15803d' : '#b91c1c' }}>
              {positive ? '+' : '−'}${Math.abs(portfolio.totalPnL).toFixed(2)} ({positive ? '+' : ''}{portfolio.totalPnLPct.toFixed(2)}%) from ${portfolio.seedCapital} seed
            </div>
          </div>
          <button
            type="button"
            onClick={() => void resetAccount()}
            disabled={resetting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)',
              cursor: resetting ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {resetting ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
            Reset
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-3)' }}>
          Cash ${portfolio.cash.toFixed(2)} · {portfolio.positions.length} open
        </div>
      </div>

      {/* ── Chart cockpit ── */}
      <div style={{ marginBottom: 16 }}>
        <ChartErrorBoundary label="The chart">
          <TradingChart />
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
                <div key={pos.symbol} style={{
                  padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{pos.symbol}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      {pos.direction === 'SHORT' ? 'Short' : 'Long'} · {pos.shares} sh @ ${pos.avgEntryPrice.toFixed(2)} → ${pos.currentPrice.toFixed(2)}
                      {pos.declaredSetupTag && <> · declared {pos.declaredSetupTag}</>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              )
            })}
          </div>
        </div>
      )}

      {lastTrade && (
        <div style={{ marginBottom: 16 }}>
          <TradeReviewCard trade={lastTrade.trade} review={lastTrade.review} reviewError={lastTrade.reviewError} />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <OrderTicket
          cash={portfolio.cash}
          openSymbols={portfolio.positions.map((p) => p.symbol)}
          botStats={botStats}
          onTraded={handleTraded}
        />
      </div>

      <TradeReviewFeed trades={history} />
    </div>
  )
}
