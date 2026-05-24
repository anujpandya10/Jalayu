'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Activity, TrendingUp, TrendingDown } from 'lucide-react'

interface MapAsset {
  symbol: string
  name: string
  assetType: 'crypto' | 'stock' | 'forex'
  price: number
  change24h: number
  score: number
  action: 'BUY_LONG' | 'SELL_SHORT' | 'HOLD'
  setupTag: string
  reason: string
  isPumpCandidate: boolean
  held: boolean
  position: { direction: string; shares: number; entry: number; heldMins: number } | null
}

interface MapResponse {
  serverTime: string
  phase: { label: string; emoji: string }
  counts: { total: number; held: number; longSignals: number; shortSignals: number }
  assets: MapAsset[]
}

const POLL_MS = 5000

/**
 * Live asset map — every scanned asset rendered as a circle on a 2D plot.
 *   X-axis: 24h change (down ←—— 0 ——→ up)
 *   Y-axis: signal score (HOLD at bottom, strong signal at top)
 *   Size:   absolute magnitude of 24h move
 *   Color:  green = bullish signal, red = bearish, gray = neutral
 *   Ring:   thick gold ring around held positions
 *   Pulse:  animated halo on assets with a fresh signal (action != HOLD)
 *
 * Polls /api/trading/map every 5s. Click a circle to see details below the chart.
 */
export default function AssetMap() {
  const [data, setData] = useState<MapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<MapAsset | null>(null)
  const [filter, setFilter] = useState<'all' | 'crypto' | 'stock' | 'forex'>('all')
  const lastUpdateRef = useRef<number>(0)

  const fetchMap = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/map', { cache: 'no-store' })
      if (!res.ok) throw new Error('Map fetch failed')
      const json = await res.json() as MapResponse
      setData(json)
      setError(null)
      lastUpdateRef.current = Date.now()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMap()
    const id = setInterval(() => { void fetchMap() }, POLL_MS)
    return () => clearInterval(id)
  }, [fetchMap])

  // Filtered asset list
  const assets = (data?.assets ?? []).filter((a) => filter === 'all' || a.assetType === filter)

  // Plot dimensions
  const W = 720
  const H = 460
  const PAD = 40

  // Score range — clamp to -10..10 so big outliers don't squish everyone else
  const MAX_SCORE = 10
  const MAX_CHANGE = 12  // %, anything beyond pinned to edges

  function xForChange(change: number): number {
    const clamped = Math.max(-MAX_CHANGE, Math.min(MAX_CHANGE, change))
    return PAD + ((clamped + MAX_CHANGE) / (2 * MAX_CHANGE)) * (W - 2 * PAD)
  }
  function yForScore(score: number): number {
    // Score: 0 at bottom, |10| at top (we plot magnitude — direction shown by color)
    const mag = Math.min(MAX_SCORE, Math.abs(score))
    return H - PAD - (mag / MAX_SCORE) * (H - 2 * PAD)
  }
  function radiusForChange(change: number): number {
    const mag = Math.min(MAX_CHANGE, Math.abs(change))
    return 5 + (mag / MAX_CHANGE) * 18  // 5–23 px
  }
  function colorForAsset(a: MapAsset): { fill: string; stroke: string; halo: string } {
    if (a.action === 'BUY_LONG') return { fill: '#16A34A', stroke: '#15803D', halo: 'rgba(34,197,94,0.35)' }
    if (a.action === 'SELL_SHORT') return { fill: '#DC2626', stroke: '#991B1B', halo: 'rgba(220,38,38,0.35)' }
    if (a.change24h > 0.5)  return { fill: '#86EFAC', stroke: '#22C55E', halo: 'transparent' }
    if (a.change24h < -0.5) return { fill: '#FCA5A5', stroke: '#EF4444', halo: 'transparent' }
    return { fill: '#D6D3CC', stroke: '#A8A29E', halo: 'transparent' }
  }

  // Anti-overlap: nudge labels for circles that share coords
  // (we'll only label held positions or strong signals to avoid clutter)

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 16,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} color="var(--accent)" />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Live Asset Map
          </h3>
          {loading && <Loader2 size={12} className="animate-spin" color="var(--text-3)" />}
          {data && (
            <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
              {data.phase.emoji} {data.phase.label} · {data.counts.total} assets ·{' '}
              <span style={{ color: '#16A34A' }}>{data.counts.longSignals} 🟢</span>{' '}
              <span style={{ color: '#DC2626' }}>{data.counts.shortSignals} 🔴</span>{' '}
              <span style={{ color: 'var(--accent)' }}>{data.counts.held} held</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'crypto', 'stock', 'forex'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '4px 9px', fontSize: 10.5, fontWeight: 500,
                background: filter === f ? 'var(--accent)' : 'var(--surface-2)',
                color: filter === f ? '#fff' : 'var(--text-2)',
                border: '1px solid var(--border)', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, fontSize: 12, color: '#EF4444' }}>{error}</div>
      )}

      {/* SVG plot */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 10 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{
            width: '100%', height: 'auto',
            background: 'linear-gradient(135deg, #0a0f1d 0%, #1a1f2e 100%)',
            display: 'block', borderRadius: 10,
          }}
        >
          {/* Grid lines */}
          <defs>
            <radialGradient id="haloPulse">
              <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>

          {/* Axes */}
          <line x1={W / 2} y1={PAD} x2={W / 2} y2={H - PAD} stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="3 5" />
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="3 5" />

          {/* Axis labels */}
          <text x={W / 2} y={H - 12} fill="rgba(255,255,255,0.35)" fontSize={10} textAnchor="middle">
            24h change → (left = down, right = up)
          </text>
          <text x={12} y={H / 2} fill="rgba(255,255,255,0.35)" fontSize={10} textAnchor="middle"
            transform={`rotate(-90 12 ${H / 2})`}>
            signal strength ↑
          </text>
          <text x={W - PAD + 30} y={H - PAD + 16} fill="rgba(34,197,94,0.5)" fontSize={9}>+{MAX_CHANGE}%</text>
          <text x={PAD - 30} y={H - PAD + 16} fill="rgba(220,38,38,0.5)" fontSize={9}>-{MAX_CHANGE}%</text>

          {/* Plotted assets */}
          {assets.map((a) => {
            const cx = xForChange(a.change24h)
            const cy = yForScore(a.score)
            const r = radiusForChange(a.change24h)
            const { fill, stroke, halo } = colorForAsset(a)
            const hasSignal = a.action !== 'HOLD'
            const showLabel = a.held || hasSignal || Math.abs(a.score) >= 4
            return (
              <g key={a.symbol}
                onClick={() => setSelected(a)}
                style={{ cursor: 'pointer' }}
              >
                {/* Pulsing halo for strong signals */}
                {hasSignal && (
                  <circle cx={cx} cy={cy} r={r + 14} fill={halo}>
                    <animate attributeName="r" values={`${r + 6};${r + 18};${r + 6}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* Held position ring */}
                {a.held && (
                  <circle cx={cx} cy={cy} r={r + 5}
                    fill="none" stroke="#FBBF24" strokeWidth={2.5}
                    strokeDasharray="4 3" />
                )}
                {/* Main circle */}
                <circle cx={cx} cy={cy} r={r}
                  fill={fill} stroke={stroke} strokeWidth={1.5}
                  opacity={selected && selected.symbol !== a.symbol ? 0.4 : 1}
                />
                {/* Symbol label */}
                {showLabel && (
                  <text x={cx} y={cy - r - 5}
                    fill="#fff" fontSize={11} fontWeight={500}
                    textAnchor="middle" pointerEvents="none">
                    {a.symbol}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12,
        marginTop: 10, fontSize: 10.5, color: 'var(--text-3)',
      }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#16A34A', verticalAlign: 'middle', marginRight: 4 }} />long signal</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#DC2626', verticalAlign: 'middle', marginRight: 4 }} />short signal</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', border: '2px dashed #FBBF24', verticalAlign: 'middle', marginRight: 4 }} />open position</span>
        <span>circle size = move magnitude · vertical = signal strength</span>
      </div>

      {/* Selected asset details */}
      {selected && (
        <div style={{
          marginTop: 12, padding: 12,
          background: 'var(--morning)', border: '1px solid var(--border)',
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                {selected.symbol} <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>{selected.name}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                ${selected.price < 1 ? selected.price.toFixed(4) : selected.price.toFixed(2)} ·{' '}
                <span style={{ color: selected.change24h >= 0 ? '#16A34A' : '#DC2626' }}>
                  {selected.change24h >= 0 ? '+' : ''}{selected.change24h.toFixed(2)}% 24h
                </span>{' '}
                · score {selected.score.toFixed(1)} · {selected.setupTag}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                {selected.reason}
              </div>
              {selected.position && (
                <div style={{
                  marginTop: 6, padding: '4px 8px',
                  background: 'rgba(251,191,36,0.15)', borderRadius: 6,
                  fontSize: 11, color: '#92400e', display: 'inline-block',
                }}>
                  Held: {selected.position.direction} {selected.position.shares.toFixed(4)} @ ${selected.position.entry.toFixed(4)} · {selected.position.heldMins}m
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {selected.action === 'BUY_LONG' && <span style={{ color: '#16A34A', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600 }}><TrendingUp size={12} /> LONG</span>}
              {selected.action === 'SELL_SHORT' && <span style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600 }}><TrendingDown size={12} /> SHORT</span>}
              <button type="button" onClick={() => setSelected(null)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 14, color: 'var(--text-3)', padding: 4,
              }}>×</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
