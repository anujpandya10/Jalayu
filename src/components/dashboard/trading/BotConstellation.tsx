'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Orbit } from 'lucide-react'

interface Bot {
  setup: string
  trades: number
  wins: number
  losses: number
  netPnl: number
  winRate: number
  avgPnl: number
  lastTradeAt: string | null
  last30Pnl: number
}

interface MapResponse {
  bots: Bot[]
  counts: { total: number; held: number }
}

const POLL_MS = 8000

/**
 * Bot Constellation — each trading "bot" (setup type) renders as a planet
 * orbiting the portfolio "sun" at the center of the view.
 *
 * Visual encoding:
 *   • Planet size      = total trades (more trades → bigger planet)
 *   • Planet color     = recent P&L  (green = profitable, red = losing)
 *   • Orbit radius     = win rate    (winners closer to the sun)
 *   • Orbit speed      = recent activity (more recent trades → faster spin)
 *   • Trail length     = avg P&L magnitude
 *
 * Each bot represents an independent strategy slice: MOMENTUM_LONG,
 * VWAP_LONG, OVERSOLD_BOUNCE, PUMP_SHORT, etc. You can see at a glance
 * which "bots" are alive (orbiting fast, glowing green) vs sleeping
 * (slow, faded) vs failing (red).
 */
export default function BotConstellation() {
  const [bots, setBots] = useState<Bot[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Bot | null>(null)
  const [tick, setTick] = useState(0)

  const fetchBots = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/map', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json() as MapResponse
      setBots(json.bots ?? [])
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBots()
    const id = setInterval(() => { void fetchBots() }, POLL_MS)
    return () => clearInterval(id)
  }, [fetchBots])

  // Animation tick — drives the orbital motion at 30fps
  useEffect(() => {
    let raf = 0
    const start = Date.now()
    const animate = () => {
      setTick((Date.now() - start) / 1000)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [])

  const W = 720
  const H = 420
  const cx = W / 2
  const cy = H / 2

  // Position-encoding helpers
  function radiusFor(bot: Bot): number {
    // Higher win rate → closer to center (sun)
    // Win rate 30% → outer (180), 50% → 140, 70%+ → 100
    if (bot.trades < 3) return 170  // not enough data yet, park them at outer edge
    const wr = bot.winRate
    return Math.max(80, 200 - wr * 180)
  }
  function sizeFor(bot: Bot): number {
    // Log scale of trade count, capped
    return 6 + Math.min(18, Math.log1p(bot.trades) * 4)
  }
  function speedFor(bot: Bot): number {
    // Recency drives orbit speed. Last trade <1h ago → fast, <24h → medium, older → slow
    if (!bot.lastTradeAt) return 0.05
    const ageHrs = (Date.now() - new Date(bot.lastTradeAt).getTime()) / 3_600_000
    if (ageHrs < 1) return 0.5
    if (ageHrs < 4) return 0.3
    if (ageHrs < 24) return 0.15
    if (ageHrs < 72) return 0.08
    return 0.04
  }
  function colorFor(bot: Bot): { fill: string; glow: string; ring: string } {
    if (bot.trades < 3) return { fill: '#6B7280', glow: 'rgba(107,114,128,0.4)', ring: '#9CA3AF' }
    const pnl = bot.last30Pnl
    if (pnl > 0.5)  return { fill: '#10B981', glow: 'rgba(16,185,129,0.6)',  ring: '#34D399' }
    if (pnl > 0)    return { fill: '#86EFAC', glow: 'rgba(134,239,172,0.45)', ring: '#22C55E' }
    if (pnl > -0.5) return { fill: '#FCA5A5', glow: 'rgba(252,165,165,0.45)', ring: '#EF4444' }
    return { fill: '#DC2626', glow: 'rgba(220,38,38,0.6)', ring: '#991B1B' }
  }

  // Distribute bots evenly around the orbits (deterministic by name so positions are stable)
  function angleOffsetFor(setup: string, n: number): number {
    let hash = 0
    for (let i = 0; i < setup.length; i++) hash = ((hash << 5) - hash + setup.charCodeAt(i)) | 0
    return (Math.abs(hash) % 360 + n * (360 / Math.max(1, bots.length))) * (Math.PI / 180)
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Orbit size={16} color="var(--accent)" />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Bot Constellation
        </h3>
        {loading && <Loader2 size={12} className="animate-spin" color="var(--text-3)" />}
        <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
          {bots.length} strategies tracked · planet size = trades · orbit = win rate · color = recent P&L
        </span>
      </div>

      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{
            width: '100%', height: 'auto', display: 'block',
            background: 'radial-gradient(circle at center, #0d1126 0%, #050714 75%)',
          }}
        >
          {/* Background star field */}
          {Array.from({ length: 60 }).map((_, i) => {
            const seed = (i * 7919) % 999
            const x = (seed * 13) % W
            const y = (seed * 17) % H
            const r = 0.4 + ((seed * 3) % 10) / 12
            const opacity = 0.15 + ((seed * 5) % 30) / 100
            return <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={opacity} />
          })}

          {/* Orbit rings (faint guides) */}
          {[100, 140, 180].map((r) => (
            <circle key={r} cx={cx} cy={cy} r={r}
              fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="2 6" />
          ))}

          {/* Central sun = portfolio */}
          <defs>
            <radialGradient id="sun">
              <stop offset="0%" stopColor="#FCD34D" />
              <stop offset="60%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="rgba(245,158,11,0)" />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={60} fill="url(#sun)" opacity={0.85} />
          <circle cx={cx} cy={cy} r={18} fill="#FBBF24" />
          <text x={cx} y={cy + 4} fill="#1C1917" fontSize={10} fontWeight={700} textAnchor="middle">
            YOU
          </text>

          {/* Planets */}
          {bots.map((bot, i) => {
            const orbitR = radiusFor(bot)
            const size = sizeFor(bot)
            const speed = speedFor(bot)
            const baseAngle = angleOffsetFor(bot.setup, i)
            const angle = baseAngle + tick * speed
            const x = cx + Math.cos(angle) * orbitR
            const y = cy + Math.sin(angle) * orbitR
            const { fill, glow, ring } = colorFor(bot)
            const isSelected = selected?.setup === bot.setup
            const opacity = selected && !isSelected ? 0.35 : 1

            // Trail (a few faded copies behind the planet)
            const trail = [0.6, 0.4, 0.2].map((alpha, ti) => {
              const tAngle = angle - (ti + 1) * 0.04
              return {
                x: cx + Math.cos(tAngle) * orbitR,
                y: cy + Math.sin(tAngle) * orbitR,
                alpha,
              }
            })

            return (
              <g key={bot.setup} onClick={() => setSelected(isSelected ? null : bot)} style={{ cursor: 'pointer' }} opacity={opacity}>
                {/* Trail */}
                {trail.map((p, ti) => (
                  <circle key={ti} cx={p.x} cy={p.y} r={size * 0.5} fill={fill} opacity={p.alpha * 0.4} />
                ))}
                {/* Glow */}
                <circle cx={x} cy={y} r={size + 8} fill={glow} />
                {/* Planet */}
                <circle cx={x} cy={y} r={size} fill={fill} stroke={ring} strokeWidth={1.5} />
                {/* Label */}
                <text x={x} y={y - size - 6}
                  fill="#fff" fontSize={9.5} fontWeight={500} textAnchor="middle"
                  pointerEvents="none">
                  {bot.setup}
                </text>
                {bot.trades >= 3 && (
                  <text x={x} y={y + size + 12}
                    fill="rgba(255,255,255,0.6)" fontSize={8.5} textAnchor="middle"
                    pointerEvents="none">
                    {Math.round(bot.winRate * 100)}% · {bot.netPnl >= 0 ? '+' : ''}${bot.netPnl.toFixed(2)}
                  </text>
                )}
              </g>
            )
          })}

          {/* Empty state */}
          {bots.length === 0 && !loading && (
            <text x={cx} y={cy + 100} fill="rgba(255,255,255,0.5)" fontSize={11} textAnchor="middle">
              No bots yet — strategies appear here after they’ve made trades
            </text>
          )}
        </svg>
      </div>

      {/* Selected bot details */}
      {selected && (
        <div style={{
          marginTop: 10, padding: 12,
          background: 'var(--morning)', border: '1px solid var(--border)',
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {selected.setup}
            </div>
            <button type="button" onClick={() => setSelected(null)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 14, color: 'var(--text-3)', padding: 4,
            }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11 }}>
            <Stat label="Trades"  value={String(selected.trades)} />
            <Stat label="Win rate" value={`${Math.round(selected.winRate * 100)}%`}
              color={selected.winRate >= 0.5 ? '#16A34A' : '#DC2626'} />
            <Stat label="Net P&L"
              value={`${selected.netPnl >= 0 ? '+' : ''}$${selected.netPnl.toFixed(2)}`}
              color={selected.netPnl >= 0 ? '#16A34A' : '#DC2626'} />
            <Stat label="Avg/trade"
              value={`${selected.avgPnl >= 0 ? '+' : ''}$${selected.avgPnl.toFixed(2)}`}
              color={selected.avgPnl >= 0 ? '#16A34A' : '#DC2626'} />
          </div>
          {selected.lastTradeAt && (
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 6 }}>
              Last trade: {new Date(selected.lastTradeAt).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color ?? 'var(--text)', marginTop: 1 }}>
        {value}
      </div>
    </div>
  )
}
