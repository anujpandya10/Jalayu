'use client'

/**
 * JalayuLogo — brand mark + wordmark
 *
 * Mark concept: a dark celestial orb with a tilted golden ring — evoking
 * the Sanskrit root "jal" (water, life in motion) meeting the cosmos.
 * A planet companion rides the ring, its glow breathing slowly.
 *
 * Colour logic:
 *   • Orb: deep warm dark (stone → near-black radial gradient)
 *   • Ring: warm amber/gold — the only light in the dark sphere
 *   • Planet: same amber, with a living pulse glow
 *   • "Jala" in warm near-black, "yu" in terracotta amber — genuinely different
 */

interface Props {
  markOnly?: boolean
  size?: number
}

const AMBER = '#C4834A'
const AMBER_DARK = '#A06838'
const AMBER_LIGHT = '#E8AA6A'

export default function JalayuLogo({ markOnly = false, size = 28 }: Props) {
  const s = size / 28

  return (
    <>
      <style>{`
        @keyframes jalDotBreath {
          0%, 100% { opacity: 0.22; r: ${3.6 * s}; }
          50%       { opacity: 0.45; r: ${5.2 * s}; }
        }
        @keyframes jalRingGlow {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 0.85; }
        }
      `}</style>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: Math.round(8 * s),
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        {/* ─── Mark ─── */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 28 28"
          fill="none"
          aria-hidden="true"
          style={{ flexShrink: 0, overflow: 'visible' }}
        >
          <defs>
            {/* Orb body gradient */}
            <radialGradient id="jl-orb" cx="36%" cy="32%" r="72%" fx="36%" fy="32%">
              <stop offset="0%"   stopColor="#7C736E" />
              <stop offset="42%"  stopColor="#3D3532" />
              <stop offset="100%" stopColor="#1A1614" />
            </radialGradient>

            {/* Ambient glow behind orb */}
            <radialGradient id="jl-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={AMBER} stopOpacity="0.18" />
              <stop offset="100%" stopColor={AMBER} stopOpacity="0"    />
            </radialGradient>

            {/* Ring gradient: amber sweep */}
            <linearGradient id="jl-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={AMBER}       stopOpacity="0"   />
              <stop offset="30%"  stopColor={AMBER_DARK}  stopOpacity="0.9" />
              <stop offset="60%"  stopColor={AMBER_LIGHT} stopOpacity="1"   />
              <stop offset="100%" stopColor={AMBER}       stopOpacity="0.1" />
            </linearGradient>

            {/* Ring gradient for the dimmer back half */}
            <linearGradient id="jl-ring-back" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={AMBER} stopOpacity="0"    />
              <stop offset="50%"  stopColor={AMBER} stopOpacity="0.18" />
              <stop offset="100%" stopColor={AMBER} stopOpacity="0"    />
            </linearGradient>
          </defs>

          {/* Outer ambient glow */}
          <circle cx="14" cy="14.5" r="13" fill="url(#jl-glow)" />

          {/* ─ Ring: back half (behind orb) ─ */}
          <ellipse
            cx="14" cy="14"
            rx="13" ry="4.6"
            fill="none"
            stroke="url(#jl-ring-back)"
            strokeWidth="1.1"
            transform="rotate(-20 14 14)"
          />

          {/* ─ Orb ─ */}
          <circle cx="14" cy="14" r="7.5" fill="url(#jl-orb)" />

          {/* Orb rim — catches a little of the ring's light */}
          <circle
            cx="14" cy="14" r="7.5"
            fill="none"
            stroke={AMBER}
            strokeWidth="0.6"
            strokeOpacity="0.1"
          />

          {/* Specular highlight */}
          <ellipse
            cx="11.4" cy="10.8"
            rx="2.4" ry="1.3"
            fill="rgba(255,255,255,0.22)"
            transform="rotate(-28 11.4 10.8)"
          />

          {/* ─ Ring: bright front arc (rendered in front of orb) ─
               Arc from left edge to right edge of the ellipse, sweeping below —
               this is the "close" half of the orbital ring.
               Computed: ellipse cx=14 cy=14 rx=13 ry=4.6, rotated -20deg.
               Left point (angle=180°): (14-13, 14)=(1,14) → rotated -20°: (2.78, 9.30)
               Right point (angle=0°):  (14+13, 14)=(27,14) → rotated -20°: (25.22, 18.70)
               We draw the bottom sweep (large-arc=0 sweeping positive). */}
          <path
            d="M 2.78 9.30 A 13 4.6 -20 0 1 25.22 18.70"
            fill="none"
            stroke="url(#jl-ring-grad)"
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{ animation: 'jalRingGlow 4s ease-in-out infinite' }}
          />

          {/* ─ Planet dot ─ */}
          {/* Breathing glow */}
          <circle
            cx="25.6" cy="9.6"
            r="3.6"
            fill={AMBER}
            transform="rotate(-20 14 14)"
            style={{
              animation: 'jalDotBreath 3.5s ease-in-out infinite',
            }}
          />
          {/* Solid dot */}
          <circle
            cx="25.6" cy="9.6"
            r="2.2"
            fill={AMBER_LIGHT}
            transform="rotate(-20 14 14)"
          />
          {/* Dot specular */}
          <circle
            cx="24.9" cy="9.1"
            r="0.7"
            fill="rgba(255,255,255,0.55)"
            transform="rotate(-20 14 14)"
          />
        </svg>

        {/* ─── Wordmark ─── */}
        {!markOnly && (
          <span
            style={{
              fontSize: Math.round(16 * s),
              lineHeight: 1,
              letterSpacing: '-0.025em',
              fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
            }}
          >
            <span
              style={{
                fontWeight: 600,
                color: '#2C2826',
              }}
            >
              Jala
            </span>
            <span
              style={{
                fontWeight: 700,
                color: AMBER,
                letterSpacing: '-0.01em',
              }}
            >
              yu
            </span>
          </span>
        )}
      </div>
    </>
  )
}
