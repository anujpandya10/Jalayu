'use client'

/**
 * JalayuLogo — brand mark + wordmark
 *
 * Mark concept: a dark deep-water orb with a bioluminescent ring — evoking
 * the Sanskrit root "jal" (water, life in motion). A creature of light
 * orbits in the deep, its glow breathing slowly like plankton in the dark.
 *
 * Colour logic:
 *   • Orb: deep navy-black (ocean depth)
 *   • Ring: bioluminescent teal/cyan — the only light in the deep
 *   • Planet: same teal, with a living pulse glow
 *   • "Jala" in warm near-black, "yu" in bioluminescent teal
 */

interface Props {
  markOnly?: boolean
  size?: number
}

const TEAL       = '#00C9A7'
const TEAL_DARK  = '#009B83'
const TEAL_LIGHT = '#67E8F9'

export default function JalayuLogo({ markOnly = false, size = 28 }: Props) {
  const s = size / 28

  return (
    <>
      <style>{`
        @keyframes jalDotBreath {
          0%, 100% { opacity: 0.28; r: ${3.6 * s}; }
          50%       { opacity: 0.62; r: ${5.4 * s}; }
        }
        @keyframes jalRingGlow {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 0.9; }
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
            {/* Orb: deep ocean gradient — near-black with a blue tint */}
            <radialGradient id="jl-orb" cx="36%" cy="32%" r="72%" fx="36%" fy="32%">
              <stop offset="0%"   stopColor="#1A3A4A" />
              <stop offset="42%"  stopColor="#0A1E2A" />
              <stop offset="100%" stopColor="#040E14" />
            </radialGradient>

            {/* Ambient bioluminescent glow behind orb */}
            <radialGradient id="jl-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={TEAL} stopOpacity="0.22" />
              <stop offset="100%" stopColor={TEAL} stopOpacity="0"    />
            </radialGradient>

            {/* Ring gradient: teal bioluminescent sweep */}
            <linearGradient id="jl-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={TEAL}       stopOpacity="0"   />
              <stop offset="30%"  stopColor={TEAL_DARK}  stopOpacity="0.9" />
              <stop offset="60%"  stopColor={TEAL_LIGHT} stopOpacity="1"   />
              <stop offset="100%" stopColor={TEAL}       stopOpacity="0.1" />
            </linearGradient>

            {/* Ring back half — dimmer, deep water */}
            <linearGradient id="jl-ring-back" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={TEAL} stopOpacity="0"    />
              <stop offset="50%"  stopColor={TEAL} stopOpacity="0.15" />
              <stop offset="100%" stopColor={TEAL} stopOpacity="0"    />
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

          {/* Orb rim — catches the bioluminescent ring light */}
          <circle
            cx="14" cy="14" r="7.5"
            fill="none"
            stroke={TEAL}
            strokeWidth="0.6"
            strokeOpacity="0.12"
          />

          {/* Specular highlight — light from above (surface) */}
          <ellipse
            cx="11.4" cy="10.8"
            rx="2.4" ry="1.3"
            fill="rgba(103,232,249,0.18)"
            transform="rotate(-28 11.4 10.8)"
          />

          {/* ─ Ring: bright front arc ─ */}
          <path
            d="M 2.78 9.30 A 13 4.6 -20 0 1 25.22 18.70"
            fill="none"
            stroke="url(#jl-ring-grad)"
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{ animation: 'jalRingGlow 4s ease-in-out infinite' }}
          />

          {/* ─ Creature — orbits the ring, glows like a bioluminescent organism ─ */}
          <g>
            {/* Breathing glow halo */}
            <circle
              cx="0" cy="0" r="3.6"
              fill={TEAL}
              style={{ animation: 'jalDotBreath 3.5s ease-in-out infinite' }}
            />
            {/* Solid body */}
            <circle cx="0" cy="0" r="2.2" fill={TEAL_LIGHT} />
            {/* Specular highlight */}
            <circle cx="-0.7" cy="-0.5" r="0.7" fill="rgba(255,255,255,0.6)" />

            {/* Orbital motion — full revolution in 8 s */}
            <animateMotion
              dur="8s"
              repeatCount="indefinite"
              rotate="0"
              path="M 2.78 9.30 A 13 4.6 -20 0 1 25.22 18.70 A 13 4.6 -20 0 1 2.78 9.30"
            />
            {/* Depth cue: dim when behind the orb */}
            <animate
              attributeName="opacity"
              values="1;1;0.25;0.25;1"
              keyTimes="0;0.47;0.5;0.97;1"
              dur="8s"
              repeatCount="indefinite"
            />
          </g>
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
            <span style={{ fontWeight: 600, color: '#1C1917' }}>
              Jala
            </span>
            <span style={{ fontWeight: 700, color: TEAL, letterSpacing: '-0.01em' }}>
              yu
            </span>
          </span>
        )}
      </div>
    </>
  )
}
