'use client'

/**
 * Strategy Lab — self-improving trading brain.
 *
 * Shows per-setup-tag win rate, avg P&L, total trades, and a toggle
 * to enable/disable that setup in the trading engine.
 *
 * Data sources (queried client-side via supabase-js):
 *   setup_stats VIEW   — aggregated win rate per (user, setup_tag, direction)
 *   strategy_config    — per-user enable/disable toggle (upserted on toggle)
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FlaskConical, TrendingUp, TrendingDown, ToggleLeft, ToggleRight, RefreshCw, Info } from 'lucide-react'
import AssetMap from '@/components/dashboard/trading/AssetMap'
import BotConstellation from '@/components/dashboard/trading/BotConstellation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SetupStat {
  setup_tag   : string
  asset_type  : string
  direction   : string
  total_trades: number
  wins        : number
  losses      : number
  win_rate_pct: number
  avg_pnl     : number
  total_pnl   : number
  avg_hold_secs: number
  last_trade_at: string | null
}

interface StrategyConfig {
  setup_tag: string
  enabled  : boolean
  notes    : string | null
}

// Tag-to-description map for the tooltip layer
const TAG_DESCRIPTIONS: Record<string, string> = {
  OVERSOLD_BOUNCE : 'RSI < 32, price > 5% below VWAP — high conviction dip reversal',
  VWAP_LONG       : 'RSI 35–55, price in VWAP value zone, low volatility regime',
  MOMENTUM_LONG   : 'Volume spike ≥ 3×, RSI 45–65, EMA9 crossing above EMA21',
  PUMP_SHORT      : '24h gain > 12%, RSI ≥ 70, volume spike ≥ 2× — overextension fade',
  SUPERNOVA_SHORT : '24h gain > 25%, vol spike ≥ 5×, RSI ≥ 80 — extreme pump collapse',
  VWAP_SHORT      : 'Price > 1.5% above VWAP, RSI 65–80, calm market fade',
  FOREX_DIP       : 'Forex: 24h < −0.3%, RSI < 45 — oversold currency buy',
  FOREX_FADE      : 'Forex: 24h > 0.3%, RSI > 55 — overbought currency short',
  MEAN_REVERT     : 'Price oscillating around VWAP with mild directional bias',
  UNTAGGED        : 'Signal generated from 24h data only (no candle indicators)',
}

const DIRECTION_COLOR = (d: string) => d === 'LONG' ? '#22C55E' : '#EF4444'

function pnlColor(n: number) {
  return n > 0 ? '#22C55E' : n < 0 ? '#EF4444' : 'var(--text-2)'
}

function winRateColor(r: number) {
  if (r >= 60) return '#22C55E'
  if (r >= 45) return '#F59E0B'
  return '#EF4444'
}

function fmtSecs(s: number) {
  if (s < 60)   return `${Math.round(s)}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${(s / 3600).toFixed(1)}h`
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StrategyLabView() {
  const [stats,    setStats]    = useState<SetupStat[]>([])
  const [config,   setConfig]   = useState<Map<string, StrategyConfig>>(new Map())
  const [loading,  setLoading]  = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [tooltip,  setTooltip]  = useState<string | null>(null)
  const [filter,   setFilter]   = useState<'all' | 'LONG' | 'SHORT'>('all')

  const supabase = createClient()

  // ── Load data ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in'); setLoading(false); return }

    const [statsRes, configRes] = await Promise.all([
      supabase
        .from('setup_stats')
        .select('*')
        .eq('user_id', user.id)
        .order('total_trades', { ascending: false }),
      supabase
        .from('strategy_config')
        .select('setup_tag, enabled, notes')
        .eq('user_id', user.id),
    ])

    if (statsRes.error)  { setError(statsRes.error.message);  setLoading(false); return }
    if (configRes.error) { setError(configRes.error.message); setLoading(false); return }

    setStats(statsRes.data ?? [])

    const cfgMap = new Map<string, StrategyConfig>()
    for (const c of (configRes.data ?? [])) cfgMap.set(c.setup_tag, c)
    setConfig(cfgMap)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Toggle a setup on/off ────────────────────────────────────────────────────

  const toggle = useCallback(async (tag: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const current = config.get(tag)?.enabled ?? true
    const next    = !current
    setToggling(tag)

    const { error: e } = await supabase
      .from('strategy_config')
      .upsert(
        { user_id: user.id, setup_tag: tag, enabled: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,setup_tag' },
      )

    if (!e) {
      setConfig((prev) => {
        const m = new Map(prev)
        m.set(tag, { setup_tag: tag, enabled: next, notes: current ? null : prev.get(tag)?.notes ?? null })
        return m
      })
    }
    setToggling(null)
  }, [config, supabase])

  // ── Derived data ─────────────────────────────────────────────────────────────

  const filtered = filter === 'all'
    ? stats
    : stats.filter((s) => s.direction === filter)

  // Aggregate totals across all setups
  const totals = stats.reduce(
    (acc, s) => ({
      trades  : acc.trades   + s.total_trades,
      wins    : acc.wins     + s.wins,
      totalPnl: acc.totalPnl + Number(s.total_pnl),
    }),
    { trades: 0, wins: 0, totalPnl: 0 },
  )
  const overallWinRate = totals.trades > 0
    ? Math.round((totals.wins / totals.trades) * 100)
    : 0

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '20px 14px', textAlign: 'center' }}>
        <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-3)' }} />
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>Loading strategy data…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px 14px' }}>
        <p style={{ fontSize: 13, color: '#EF4444' }}>Error: {error}</p>
        <button onClick={load} style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>Retry</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <FlaskConical size={18} color="var(--accent)" />
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Strategy Lab</h2>
        </div>
        <button
          onClick={load}
          title="Refresh"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)' }}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 16px' }}>
        Win rates update automatically as trades close. Disable a setup to stop the engine from taking those signals.
      </p>

      {/* Bot Constellation — each strategy is a planet orbiting your portfolio */}
      <div style={{ marginBottom: 16 }}>
        <BotConstellation />
      </div>

      {/* Live asset map — visual real-time view of every scanned asset */}
      <div style={{ marginBottom: 16 }}>
        <AssetMap />
      </div>

      {/* Summary strip */}
      {totals.trades > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div className="card" style={{ padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: 'var(--text-2)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total trades</p>
            <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{totals.trades}</p>
          </div>
          <div className="card" style={{ padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: 'var(--text-2)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Win rate</p>
            <p style={{ fontSize: 22, fontWeight: 600, color: winRateColor(overallWinRate), margin: 0 }}>{overallWinRate}%</p>
          </div>
          <div className="card" style={{ padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: 'var(--text-2)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total P&L</p>
            <p style={{ fontSize: 22, fontWeight: 600, color: pnlColor(totals.totalPnl), margin: 0 }}>
              {totals.totalPnl >= 0 ? '+' : ''}${totals.totalPnl.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Direction filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['all', 'LONG', 'SHORT'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid',
              cursor: 'pointer',
              borderColor  : filter === f ? 'var(--accent)' : 'var(--border)',
              background   : filter === f ? 'var(--accent)' : 'transparent',
              color        : filter === f ? 'var(--accent-fg)' : 'var(--text-2)',
              transition   : 'all 0.15s',
            }}
          >
            {f === 'all' ? 'All' : f === 'LONG' ? '↑ Longs' : '↓ Shorts'}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <FlaskConical size={28} color="var(--text-3)" style={{ marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
            {totals.trades === 0
              ? 'No closed trades yet. Run the engine and let some trades close — win rates appear here automatically.'
              : 'No setups match this filter.'}
          </p>
        </div>
      )}

      {/* Setup cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((s) => {
          const key      = `${s.setup_tag}::${s.direction}::${s.asset_type}`
          const cfgKey   = s.setup_tag
          const enabled  = config.get(cfgKey)?.enabled ?? true
          const spinning = toggling === cfgKey

          return (
            <div
              key={key}
              className="card"
              style={{
                padding     : '12px 14px',
                opacity     : enabled ? 1 : 0.55,
                transition  : 'opacity 0.2s',
                position    : 'relative',
              }}
            >
              {/* Top row: tag + toggle */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize     : 12,
                      fontWeight   : 600,
                      color        : 'var(--text)',
                      fontFamily   : 'monospace',
                      letterSpacing: '0.02em',
                    }}>
                      {s.setup_tag}
                    </span>
                    <span style={{
                      fontSize    : 10,
                      fontWeight  : 500,
                      color       : DIRECTION_COLOR(s.direction),
                      background  : `${DIRECTION_COLOR(s.direction)}18`,
                      borderRadius: 4,
                      padding     : '1px 5px',
                    }}>
                      {s.direction === 'LONG'
                        ? <><TrendingUp size={9} style={{ verticalAlign: 'middle' }} /> LONG</>
                        : <><TrendingDown size={9} style={{ verticalAlign: 'middle' }} /> SHORT</>
                      }
                    </span>
                    <span style={{
                      fontSize    : 10,
                      color       : 'var(--text-3)',
                      background  : 'var(--surface-2)',
                      borderRadius: 4,
                      padding     : '1px 5px',
                      border      : '1px solid var(--border)',
                    }}>
                      {s.asset_type}
                    </span>
                    {/* Info tooltip trigger */}
                    <button
                      onClick={() => setTooltip(tooltip === key ? null : key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-3)', lineHeight: 1 }}
                    >
                      <Info size={12} />
                    </button>
                  </div>
                  {/* Tooltip */}
                  {tooltip === key && (
                    <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '6px 0 0', lineHeight: 1.5 }}>
                      {TAG_DESCRIPTIONS[s.setup_tag] ?? 'No description available.'}
                    </p>
                  )}
                </div>

                {/* Enable/disable toggle */}
                <button
                  onClick={() => toggle(cfgKey)}
                  disabled={spinning}
                  title={enabled ? 'Disable this setup' : 'Enable this setup'}
                  style={{ background: 'none', border: 'none', cursor: spinning ? 'wait' : 'pointer', padding: 0, marginLeft: 12, flexShrink: 0 }}
                >
                  {enabled
                    ? <ToggleRight size={22} color="var(--accent)" />
                    : <ToggleLeft  size={22} color="var(--text-3)" />
                  }
                </button>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                <Stat label="Trades"   value={String(s.total_trades)} />
                <Stat label="Win rate" value={`${s.win_rate_pct ?? 0}%`} valueColor={winRateColor(Number(s.win_rate_pct ?? 0))} />
                <Stat label="Avg P&L"  value={`${Number(s.avg_pnl) >= 0 ? '+' : ''}$${Number(s.avg_pnl).toFixed(2)}`} valueColor={pnlColor(Number(s.avg_pnl))} />
                <Stat label="Total P&L" value={`${Number(s.total_pnl) >= 0 ? '+' : ''}$${Number(s.total_pnl).toFixed(2)}`} valueColor={pnlColor(Number(s.total_pnl))} />
                <Stat label="Avg hold" value={fmtSecs(Number(s.avg_hold_secs ?? 0))} />
              </div>

              {/* Win/loss bar */}
              <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{
                  height    : '100%',
                  width     : `${s.win_rate_pct ?? 0}%`,
                  background: winRateColor(Number(s.win_rate_pct ?? 0)),
                  borderRadius: 2,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 10, color: '#22C55E' }}>{s.wins}W</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  Last {fmtDate(s.last_trade_at)}
                </span>
                <span style={{ fontSize: 10, color: '#EF4444' }}>{s.losses}L</span>
              </div>

              {/* Disabled label */}
              {!enabled && (
                <div style={{
                  marginTop   : 8,
                  fontSize    : 10,
                  color       : '#F59E0B',
                  background  : '#F59E0B18',
                  borderRadius: 4,
                  padding     : '3px 7px',
                  display     : 'inline-block',
                }}>
                  Disabled — engine will skip this setup
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer note */}
      {filtered.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16, lineHeight: 1.6 }}>
          Win rates and P&L update as trades close. Disable any setup that consistently loses — the engine will skip it on the next scan. Changes take effect immediately.
        </p>
      )}

      {/* Spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Stat sub-component ────────────────────────────────────────────────────────

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <p style={{ fontSize: 9, color: 'var(--text-3)', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 600, color: valueColor ?? 'var(--text)', margin: 0 }}>{value}</p>
    </div>
  )
}
