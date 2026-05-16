'use client'

import { useState, useEffect } from 'react'

const PORSCHE_RED = '#D5001C'
const DIAL = '#141414'
const BEZEL_LIGHT = '#c8c4bc'
const BEZEL_DARK = '#6e6a62'

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export default function PorscheClock({ size = 128 }: { size?: number }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const cx = 60
  const cy = 60
  const sec = now.getSeconds()
  const min = now.getMinutes()
  const hr12 = now.getHours() % 12

  const secDeg = (sec / 60) * 360
  const minDeg = ((min + sec / 60) / 60) * 360
  const hrDeg = ((hr12 + min / 60) / 12) * 360

  const secTip = polar(cx, cy, 44, secDeg)
  const minTip = polar(cx, cy, 36, minDeg)
  const hrTip = polar(cx, cy, 28, hrDeg)

  const dateLine = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  const timeDigital = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
        width: '100%',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        aria-label={`Live clock ${timeDigital}`}
        role="img"
        style={{ display: 'block', filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.18))' }}
      >
        <defs>
          <linearGradient id="porsche-bezel" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={BEZEL_LIGHT} />
            <stop offset="45%" stopColor="#f0ece4" />
            <stop offset="55%" stopColor="#8a8680" />
            <stop offset="100%" stopColor={BEZEL_DARK} />
          </linearGradient>
          <radialGradient id="porsche-dial" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#222" />
            <stop offset="100%" stopColor={DIAL} />
          </radialGradient>
          <filter id="porsche-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer bezel ring */}
        <circle cx={cx} cy={cy} r={56} fill="url(#porsche-bezel)" />
        <circle cx={cx} cy={cy} r={52} fill={DIAL} stroke="#0a0a0a" strokeWidth={0.5} />

        {/* Dial face */}
        <circle cx={cx} cy={cy} r={48} fill="url(#porsche-dial)" />

        {/* Minute ticks */}
        {Array.from({ length: 60 }, (_, i) => {
          const deg = i * 6
          const major = i % 5 === 0
          const inner = major ? 40 : 43
          const outer = 47
          const a1 = polar(cx, cy, inner, deg)
          const a2 = polar(cx, cy, outer, deg)
          return (
            <line
              key={i}
              x1={a1.x}
              y1={a1.y}
              x2={a2.x}
              y2={a2.y}
              stroke={major ? '#e8e4dc' : '#5a5854'}
              strokeWidth={major ? 1.4 : 0.6}
              strokeLinecap="round"
            />
          )
        })}

        {/* Cardinal numerals */}
        {[
          { n: '12', deg: 0 },
          { n: '3', deg: 90 },
          { n: '6', deg: 180 },
          { n: '9', deg: 270 },
        ].map(({ n, deg }) => {
          const p = polar(cx, cy, 33, deg)
          return (
            <text
              key={n}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#d4d0c8"
              fontSize={9}
              fontWeight={600}
              fontFamily="system-ui, -apple-system, sans-serif"
              letterSpacing="-0.02em"
            >
              {n}
            </text>
          )
        })}

        {/* Hour hand */}
        <line
          x1={cx}
          y1={cy}
          x2={hrTip.x}
          y2={hrTip.y}
          stroke="#f5f3ee"
          strokeWidth={2.8}
          strokeLinecap="round"
        />
        {/* Minute hand */}
        <line
          x1={cx}
          y1={cy}
          x2={minTip.x}
          y2={minTip.y}
          stroke="#f5f3ee"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        {/* Second hand — Porsche red */}
        <line
          x1={cx}
          y1={cy}
          x2={secTip.x}
          y2={secTip.y}
          stroke={PORSCHE_RED}
          strokeWidth={1}
          strokeLinecap="round"
          filter="url(#porsche-glow)"
        />
        <circle cx={cx} cy={cy} r={2.2} fill={PORSCHE_RED} />
        <circle cx={cx} cy={cy} r={1} fill="#1a1a1a" />
      </svg>

      <div style={{ textAlign: 'center', lineHeight: 1.35 }}>
        <p
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text)',
            margin: 0,
            letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {timeDigital}
        </p>
        <p
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--text-3)',
            margin: '2px 0 0',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {dateLine}
        </p>
      </div>
    </div>
  )
}
