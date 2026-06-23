'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bot, Play, Pause, RotateCcw, Loader2 } from 'lucide-react'
import { isUsMarketOpenNow } from '@/lib/market-hours'

interface AutoPosition {
  symbol: string; name: string; direction: 'LONG' | 'SHORT'
  shares: number; originalShares: number; avgEntryPrice: number; currentPrice: number
  value: number; pnl: number; pnlPct: number; setupTag: string | null; halfClosed: boolean
  stopPrice: number | null; target1Price: number | null; target2Price: number | null
  entryEma9: number | null; entryEma21: number | null; entryVwap: number | null; entryRsi: number | null
}
interface AutoPortfolio {
  cash: number; enabled: boolean; positions: AutoPosition[]
  totalValue: number; totalPnL: number; totalPnLPct: number; seedCapital: number
}
interface LogRow {
  id: string; symbol: string | null; kind: string; note: string
  price: number | null; shares: number | null; pnl: number | null
  ema9: number | null; ema21: number | null; vwap: number | null; rsi: number | null
  created_at: string
}

const KIND_META: Record<string, { label: string; color: string }> = {
  ENTRY: { label: 'Bought/Shorted', color: '#3B82F6' },
  TAKE_HALF: { label: 'Sold half', color: '#16A34A' },
  EXIT_FULL: { label: 'Closed', color: '#15803d' },
  STOP_HIT: { label: 'Stopped out', color: '#DC2626' },
  STOP_MOVED: { label: 'Moved stop', color: '#D97706' },
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

  useEffect(() => {
    void (async () => { await Promise.all([loadPortfolio(), loadLog()]); setLoading(false) })()
  }, [loadPortfolio, loadLog])

  useEffect(() => {
    const id = setInterval(() => { void loadPortfolio(); void loadLog() }, REFRESH_MS)
    return () => clearInterval(id)
  }, [loadPortfolio, loadLog])

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
            await Promise.all([loadPortfolio(), loadLog()])
          }
        }
      } catch { /* best effort */ } finally { tickingRef.current = false }
    }
    void tick()
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [portfolio?.enabled, loadPortfolio, loadLog])

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

  if (loading || !portfolio) {
    return <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '24px 0' }}>Loading the auto trader…</div>
  }

  const marketOpen = isUsMarketOpenNow()
  const positive = portfolio.totalPnL >= 0

  return (
    <div>
      <div style={{ padding: '14px 16px', borderRadius: 14, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Bot size={16} color="var(--accent)" />
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Auto Trader</h2>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>US stocks · market hours only · its own $1,000</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55, margin: '0 0 12px' }}>
          This account trades itself, on the same setup logic the curriculum teaches and the same break-even/trailing-stop
          discipline the main bot runs on. It only enters during US market hours, on real stocks, and narrates every
          decision below — watch what it does, then try applying the same read yourself on the Practice desk.
        </p>

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
                  const meta = KIND_META[row.kind] ?? { label: row.kind, color: 'var(--text-2)' }
                  return (
                    <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {new Date(row.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '7px 8px 7px 0', fontWeight: 700, color: 'var(--text)' }}>{row.symbol ?? '—'}</td>
                      <td style={{ padding: '7px 8px 7px 0', fontWeight: 700, color: meta.color, whiteSpace: 'nowrap' }}>{meta.label}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-2)' }}>{row.shares != null ? row.shares : '—'}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-2)' }}>{row.price != null ? `$${row.price.toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '7px 8px 7px 0', fontWeight: 700, color: row.pnl == null ? 'var(--text-3)' : row.pnl >= 0 ? '#16A34A' : '#DC2626' }}>
                        {row.pnl != null ? `${row.pnl >= 0 ? '+' : ''}$${row.pnl.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-3)' }}>{row.ema9 != null ? row.ema9.toFixed(2) : '—'}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-3)' }}>{row.ema21 != null ? row.ema21.toFixed(2) : '—'}</td>
                      <td style={{ padding: '7px 8px 7px 0', color: 'var(--text-3)' }}>{row.vwap != null ? row.vwap.toFixed(2) : '—'}</td>
                      <td style={{ padding: '7px 0 7px 0', color: 'var(--text-2)', lineHeight: 1.5, minWidth: 280 }}>{row.note}</td>
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
