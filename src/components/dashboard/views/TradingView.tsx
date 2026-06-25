'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import {
  ChevronDown, ChevronRight, Pause, Play, RefreshCw,
  LayoutDashboard, Wallet, Sparkles, Layers,
} from 'lucide-react'
import AssetMap from '@/components/dashboard/trading/AssetMap'
import BotConstellation from '@/components/dashboard/trading/BotConstellation'
import CandleScanner from '@/components/dashboard/trading/CandleScanner'
import EquityChart from '@/components/dashboard/trading/EquityChart'
import TradeStories from '@/components/dashboard/trading/TradeStories'
import { LearningPanel, RealMoneyCTA } from '@/components/dashboard/trading/TradingHero'
import ApexTake from '@/components/dashboard/trading/ApexTake'
import ApexHistory from '@/components/dashboard/trading/ApexHistory'
import TradingQuietFeed from '@/components/dashboard/trading/TradingQuietFeed'
import { useStore } from '@/store/useStore'
import {
  deriveEngineInsight,
  daysSince,
  type TickEventLike,
} from '@/lib/trading-page-insights'

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

interface TickEvent extends TickEventLike {
  name: string
  price: number
  direction: 'LONG' | 'SHORT'
  shares?: number
  total?: number
  pnl?: number
  pnlPct?: number
  urgency?: string
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
  cryptoActive: boolean
  stocksActive: boolean
  forexActive: boolean
}

type TabId = 'overview' | 'positions' | 'apex' | 'more'

// ─── Helpers ───────────────────────────────────────────────────────────────────

let actId = 0
function nextId() { return ++actId }

const REFRESH_INTERVAL = 8000
const SEED = 500

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
function fmtTradeTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const days = daysSince(iso)
  if (days === 1) return 'Yesterday'
  if (days != null && days < 7) return `${days}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

function tradesToActivity(trades: Trade[]): TickEvent[] {
  return trades.slice(0, 8).map((t) => {
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

function lastClosedTradeAt(trades: Trade[]): string | null {
  const closed = trades.filter((t) => t.pnl != null)
  if (closed.length === 0) return null
  return closed[0].created_at
}

// ─── Subcomponents ─────────────────────────────────────────────────────────────

function PositionCard({ pos }: { pos: Position }) {
  const up = pos.pnl >= 0
  const isShort = pos.direction === 'SHORT'
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 12,
      border: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{pos.symbol}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            {isShort ? 'Short' : 'Long'} · {fmtPrice(pos.avgBuyPrice)} → {fmtPrice(pos.currentPrice)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: up ? '#15803d' : '#b91c1c',
          }}>
            {fmtPct(pos.pnlPct)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtMoney(pos.value)}</div>
        </div>
      </div>
    </div>
  )
}

function InsightCard({
  headline,
  detail,
  tone,
  blockers,
  showDetails,
  onToggleDetails,
  scanDetails,
}: {
  headline: string
  detail: string
  tone: 'ok' | 'warn' | 'idle' | 'blocked'
  blockers: string[]
  showDetails: boolean
  onToggleDetails: () => void
  scanDetails: string[]
}) {
  const border =
    tone === 'blocked' ? '#fecaca' :
    tone === 'warn' ? '#fde68a' :
    tone === 'idle' ? 'var(--border)' : 'var(--border)'
  const bg =
    tone === 'blocked' ? 'rgba(254,226,226,0.35)' :
    tone === 'warn' ? 'rgba(254,243,199,0.5)' :
    'var(--morning)'

  return (
    <div style={{
      borderRadius: 14,
      border: `1px solid ${border}`,
      background: bg,
      padding: '16px 18px',
      marginBottom: 20,
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
        {headline}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
        {detail}
      </p>
      {blockers.length > 0 && (
        <ul style={{
          margin: '12px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-2)',
          lineHeight: 1.6,
        }}>
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
      {scanDetails.length > 0 && (
        <button
          type="button"
          onClick={onToggleDetails}
          style={{
            marginTop: 12, background: 'none', border: 'none', padding: 0,
            fontSize: 12, fontWeight: 600, color: 'var(--accent)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {showDetails ? 'Hide' : 'Show'} latest scan notes
        </button>
      )}
      {showDetails && scanDetails.length > 0 && (
        <div style={{
          marginTop: 10, padding: 10, borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5,
          maxHeight: 120, overflowY: 'auto',
        }}>
          {scanDetails.map((line, i) => (
            <div key={i} style={{ marginBottom: 4 }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      marginBottom: 16,
      border: '1px solid var(--border)',
      borderRadius: 14,
      background: 'var(--surface)',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, color: 'var(--text)',
        }}
      >
        {title}
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function TradingView() {
  const profile = useStore((s) => s.profile)
  const name = profile?.nickname || profile?.full_name?.split(' ')[0] || ''

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [scanNotes, setScanNotes] = useState<string[]>([])
  const [showScanDetails, setShowScanDetails] = useState(false)
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(true)
  const [serverLastRun, setServerLastRun] = useState<string | null>(null)
  const [currentPhase, setCurrentPhase] = useState<PhaseInfo | null>(null)
  const [openLongs, setOpenLongs] = useState(0)
  const [openShorts, setOpenShorts] = useState(0)
  const [tab, setTab] = useState<TabId>('overview')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [tickError, setTickError] = useState<string | null>(null)
  const [disabledSetups, setDisabledSetups] = useState<string[]>([])
  const [lastDiagnostics, setLastDiagnostics] = useState<{
    ddMode: string
    drawdownPct: number
    marketRegime: string
    longSlotsFree: number
    longCandidates: number
    circuitBreaker: boolean
    topLong: { symbol: string; score: number; setup: string } | null
  } | null>(null)

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const addActivity = useCallback((events: TickEvent[]) => {
    const holdNotes = events
      .filter((e) => e.type === 'HOLD' && e.reason && !e.reason.includes('watching'))
      .map((e) => e.reason)
      .slice(0, 6)
    if (holdNotes.length) setScanNotes(holdNotes)

    const items: ActivityItem[] = events.map((e) => ({ id: nextId(), event: e }))
    setActivity((prev) => [...items, ...prev].slice(0, 80))
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

  const loadStatus = useCallback(async () => {
    const [statusRes, settingsRes] = await Promise.all([
      fetch('/api/trading/status'),
      fetch('/api/trading/settings'),
    ])
    if (statusRes.ok) {
      const data = await statusRes.json() as {
        lastRunAt?: string | null
        autoTradingEnabled?: boolean
        phase?: PhaseInfo
      }
      if (data.lastRunAt) setServerLastRun(data.lastRunAt)
      if (data.autoTradingEnabled != null) setAutoTradingEnabled(data.autoTradingEnabled)
      if (data.phase) setCurrentPhase(data.phase)
    }
    if (settingsRes.ok) {
      const s = await settingsRes.json() as {
        autoTradingEnabled?: boolean
        lastRunAt?: string | null
        disabledSetups?: string[]
      }
      if (s.autoTradingEnabled != null) setAutoTradingEnabled(s.autoTradingEnabled)
      if (s.lastRunAt) setServerLastRun(s.lastRunAt)
      setDisabledSetups(s.disabledSetups ?? [])
    }
  }, [])

  const refreshAll = useCallback(async () => {
    const [portRes] = await Promise.all([
      fetch('/api/trading/portfolio'),
      loadTrades(),
      loadStatus(),
    ])
    if (portRes.ok) {
      const pos = await portRes.json() as Portfolio
      setPortfolio(pos)
      let L = 0, S = 0
      for (const p of pos.positions ?? []) {
        if (p.direction === 'SHORT') S++
        else L++
      }
      setOpenLongs(L)
      setOpenShorts(S)
    }
  }, [loadTrades, loadStatus])

  const runTick = useCallback(async (force = false) => {
    if (scanning) return
    setScanning(true)
    setTickError(null)
    try {
      const url = force ? '/api/trading/tick?force=1' : '/api/trading/tick'
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setTickError(err.error ?? `Scan failed (${res.status})`)
        return
      }
      const data = await res.json() as {
        events?: TickEvent[]
        currentLongs?: number
        currentShorts?: number
        phase?: PhaseInfo
        tradesExecuted?: number
        skipped?: boolean
        diagnostics?: typeof lastDiagnostics
      }
      if (data.diagnostics) setLastDiagnostics(data.diagnostics)
      if (data.events?.length) addActivity(data.events)
      setOpenLongs(data.currentLongs ?? 0)
      setOpenShorts(data.currentShorts ?? 0)
      if (data.phase) setCurrentPhase(data.phase)
      await refreshAll()
    } catch (e) {
      setTickError(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }, [scanning, addActivity, refreshAll])

  const patchSettings = useCallback(async (body: { autoTradingEnabled?: boolean; resumeEngine?: boolean }) => {
    setSettingsBusy(true)
    try {
      const res = await fetch('/api/trading/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { autoTradingEnabled: boolean; resumed?: boolean }
      setAutoTradingEnabled(data.autoTradingEnabled)
      if (data.resumed) setDisabledSetups([])
      await loadStatus()
      await runTick(true)
    } catch (e) {
      setTickError(e instanceof Error ? e.message : 'Could not update settings')
    } finally {
      setSettingsBusy(false)
    }
  }, [loadStatus, runTick])

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      await Promise.all([loadPortfolio(), loadTrades(true), loadStatus()])
      if (!cancelled) setLoading(false)
      if (!cancelled) await runTick(true)
    }
    boot()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tickRef.current = setInterval(() => { runTick(false) }, REFRESH_INTERVAL)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const equity = portfolio?.totalValue ?? SEED
  const pnl = portfolio?.totalPnL ?? equity - SEED
  const pnlPct = portfolio?.totalPnLPct ?? ((pnl / SEED) * 100)
  const positive = pnl >= 0
  const openCount = (portfolio?.positions.length ?? 0) || openLongs + openShorts
  const lastTradeAt = lastClosedTradeAt(trades)

  const insight = deriveEngineInsight({
    events: activity.map((a) => a.event),
    autoTradingEnabled,
    openPositions: openCount,
    lastTradeAt,
    phaseLabel: currentPhase?.label,
    cryptoActive: currentPhase?.cryptoActive,
  })

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} /> },
    { id: 'positions', label: 'Positions', icon: <Wallet size={15} /> },
    { id: 'apex', label: 'Apex', icon: <Sparkles size={15} /> },
    { id: 'more', label: 'More', icon: <Layers size={15} /> },
  ]

  if (loading) {
    return (
      <div style={{ maxWidth: 'min(1600px, 97vw)', margin: '0 auto', padding: '48px 20px' }}>
        <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 'min(1600px, 97vw)', margin: '0 auto', padding: '20px 20px 64px' }}>

      {/* ── Calm header ── */}
      <header style={{ marginBottom: 24 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: 20,
        }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: 'var(--text)' }}>
              Paper trading
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>
              {name ? `${name}, ` : ''}simulated $500 · server scans ~every minute
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={settingsBusy}
              onClick={() => patchSettings({ autoTradingEnabled: !autoTradingEnabled })}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600,
                padding: '6px 12px', borderRadius: 99,
                background: autoTradingEnabled ? 'rgba(21,128,61,0.12)' : 'var(--morning)',
                border: `1px solid ${autoTradingEnabled ? 'rgba(21,128,61,0.35)' : 'var(--border)'}`,
                color: autoTradingEnabled ? '#15803d' : 'var(--text-2)',
                cursor: settingsBusy ? 'wait' : 'pointer',
              }}
            >
              {autoTradingEnabled ? <Play size={12} /> : <Pause size={12} />}
              {autoTradingEnabled ? 'Auto on' : 'Auto off'}
            </button>
            {(!autoTradingEnabled || disabledSetups.length > 0 || insight.tone === 'blocked') && (
              <button
                type="button"
                disabled={settingsBusy || scanning}
                onClick={() => patchSettings({ resumeEngine: true })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                  border: 'none', background: '#15803d', color: '#fff',
                  cursor: settingsBusy ? 'wait' : 'pointer',
                }}
              >
                Start engine
              </button>
            )}
            <button
              type="button"
              onClick={() => runTick(true)}
              disabled={scanning || settingsBusy}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-2)', cursor: scanning ? 'wait' : 'pointer',
                opacity: scanning ? 0.6 : 1,
              }}
            >
              <RefreshCw size={13} style={scanning ? { animation: 'spin 1s linear infinite' } : undefined} />
              Scan now
            </button>
          </div>
        </div>

        <div style={{
          padding: '20px 22px',
          borderRadius: 16,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Portfolio value</div>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            {fmtMoney(equity)}
          </div>
          <div style={{
            marginTop: 8, fontSize: 14, fontWeight: 600,
            color: positive ? '#15803d' : '#b91c1c',
          }}>
            {positive ? '+' : '−'}{fmtMoney(Math.abs(pnl))} ({fmtPct(pnlPct)}) from $500 seed
          </div>
          <div style={{
            marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 16,
            fontSize: 12, color: 'var(--text-3)',
          }}>
            <span>Cash {fmtMoney(portfolio?.cash ?? 0)}</span>
            <span>{openCount} open</span>
            <span>{trades.filter((t) => t.pnl != null).length} closed trades</span>
            {serverLastRun && <span>Server {timeAgo(new Date(serverLastRun).getTime())}</span>}
            {currentPhase && (
              <span>{currentPhase.emoji} {currentPhase.label}</span>
            )}
          </div>
        </div>
      </header>

      {tickError && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(254,226,226,0.5)', border: '1px solid #fecaca',
          fontSize: 12, color: '#b91c1c',
        }}>
          {tickError}
        </div>
      )}

      {!autoTradingEnabled && (
        <div style={{
          marginBottom: 12, padding: '12px 16px', borderRadius: 12,
          background: 'rgba(254,243,199,0.6)', border: '1px solid #fde68a',
          fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5,
        }}>
          Auto-trading is <strong>off</strong> — the server cron will skip your account until you turn it on or tap <strong>Start engine</strong>.
        </div>
      )}

      <InsightCard
        headline={insight.headline}
        detail={
          lastDiagnostics
            ? `${insight.detail} Last scan: ${lastDiagnostics.marketRegime} BTC · ${lastDiagnostics.ddMode} (${(lastDiagnostics.drawdownPct * 100).toFixed(1)}%) · ${lastDiagnostics.longCandidates} long candidate(s) · ${lastDiagnostics.longSlotsFree} slot(s) free${
              lastDiagnostics.topLong
                ? ` · best: ${lastDiagnostics.topLong.symbol} ${lastDiagnostics.topLong.setup} (${lastDiagnostics.topLong.score.toFixed(1)})`
                : ''
            }.`
            : insight.detail
        }
        tone={insight.tone}
        blockers={insight.blockers}
        showDetails={showScanDetails}
        onToggleDetails={() => setShowScanDetails(!showScanDetails)}
        scanDetails={scanNotes}
      />

      {/* ── Tabs ── */}
      <nav style={{
        display: 'flex', gap: 4, marginBottom: 20,
        padding: 4, borderRadius: 12, background: 'var(--morning)',
        border: '1px solid var(--border)',
      }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 8px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: tab === t.id ? 'var(--surface)' : 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text-3)',
              boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <>
          <div style={{ marginBottom: 20 }}>
            <EquityChart />
          </div>

          {(portfolio?.positions.length ?? 0) > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Open now
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {portfolio!.positions.map((pos) => (
                  <PositionCard key={pos.symbol} pos={pos} />
                ))}
              </div>
            </div>
          )}

          <div style={{
            padding: 16, borderRadius: 14,
            border: '1px solid var(--border)', background: 'var(--surface)',
            marginBottom: 20,
          }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>
              Recent activity
            </h2>
            <TradingQuietFeed
              items={activity}
              scanning={scanning}
              emptyMessage={
                lastTradeAt
                  ? `No new trades since ${fmtTradeTime(lastTradeAt)}. The engine is still scanning — most ticks end in HOLD when filters don't align.`
                  : 'No trades yet. The engine only enters when score, regime, and risk rules all pass.'
              }
            />
          </div>

          <div style={{
            padding: 14, borderRadius: 12,
            background: 'var(--morning)', border: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55,
          }}>
            <strong style={{ color: 'var(--text)' }}>Crypto runs 24/7</strong> — but this bot does not trade every move.
            It waits for named setups (momentum, oversold bounce, VWAP dip) inside volatility windows and skips trades when BTC regime or drawdown rules say no.
          </div>
        </>
      )}

      {/* ── Positions ── */}
      {tab === 'positions' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Open positions
            </h2>
            {(portfolio?.positions.length ?? 0) === 0 ? (
              <div style={{
                padding: 24, textAlign: 'center', borderRadius: 12,
                border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13,
              }}>
                Nothing open right now.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {portfolio!.positions.map((pos) => <PositionCard key={pos.symbol} pos={pos} />)}
              </div>
            )}
          </div>

          <div style={{
            border: '1px solid var(--border)', borderRadius: 14,
            background: 'var(--surface)', padding: 16, maxHeight: 480, overflowY: 'auto',
          }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px' }}>Trade history</h2>
            {trades.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>No trades yet.</p>
            ) : (
              trades.map((t) => {
                const pnlPos = (t.pnl ?? 0) >= 0
                const closed = t.pnl != null
                return (
                  <div
                    key={t.id}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{t.symbol}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtTradeTime(t.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      {t.direction === 'SHORT' ? 'Short' : 'Long'} · {fmtPrice(t.price)}
                      {closed && (
                        <span style={{ marginLeft: 8, fontWeight: 600, color: pnlPos ? '#15803d' : '#b91c1c' }}>
                          {pnlPos ? '+' : '−'}{fmtMoney(Math.abs(t.pnl ?? 0))}
                        </span>
                      )}
                    </div>
                    {t.reason && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.4 }}>
                        {t.reason}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* ── Apex ── */}
      {tab === 'apex' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, margin: '0 0 16px' }}>
            On-demand second opinion. When you run Apex on a symbol, the engine can veto or size trades using that read (3 min, ±0.5% price).
          </p>
          <div style={{ marginBottom: 20 }}>
            <ApexTake />
          </div>
          <Section title="Apex history & analytics" defaultOpen={false}>
            <ApexHistory />
          </Section>
        </>
      )}

      {/* ── More (advanced) ── */}
      {tab === 'more' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5 }}>
            Charts, scanners, and learning tools — optional depth when you want to dig in.
          </p>
          <Section title="Asset map" defaultOpen={false}>
            <AssetMap />
          </Section>
          <Section title="Bot constellation" defaultOpen={false}>
            <BotConstellation />
          </Section>
          <Section title="Candle scanner" defaultOpen={false}>
            <CandleScanner />
          </Section>
          <Section title="Trade stories" defaultOpen={false}>
            <TradeStories />
          </Section>
          <Section title="How the bot thinks" defaultOpen={false}>
            <LearningPanel />
          </Section>
          <div style={{ marginTop: 20 }}>
            <RealMoneyCTA totalTrades={trades.length} pnl={pnl} />
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
