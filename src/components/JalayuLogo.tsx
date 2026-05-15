'use client'

/**
 * JalayuLogo — brand mark + wordmark
 *
 * Mark concept: a small planet/orb with a tilted elliptical ring orbiting it,
 * evoking both a galaxy and the Sanskrit root "jal" (water/life in motion).
 * The ring is slightly open at the top-right — a nod to emergence, not closure.
 */

interface Props {
  /** Render just the icon mark without the wordmark */
  markOnly?: boolean
  /** Icon size in px (wordmark scales proportionally) */
  size?: number
  /** Override icon color (defaults to --text CSS var) */
  color?: string
}

export default function JalayuLogo({ markOnly = false, size = 22, color }: Props) {
  const iconColor = color || 'var(--text)'
  const accentColor = color ? color : 'var(--accent)'

  // Scale factor so all measurements are relative to size
  const s = size / 22

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(7 * s),
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {/* Icon mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 22 22"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <radialGradient id="jl-orb" cx="38%" cy="35%" r="70%" fx="38%" fy="35%">
            <stop offset="0%" stopColor="#78716C" />
            <stop offset="45%" stopColor="#44403C" />
            <stop offset="100%" stopColor="#1C1917" />
          </radialGradient>
          <radialGradient id="jl-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#A8A29E" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#A8A29E" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient glow */}
        <circle cx="11" cy="11.5" r="9" fill="url(#jl-glow)" />

        {/* Orbit ring — tilted ellipse, slightly open at top */}
        {/* Full ellipse */}
        <ellipse
          cx="11"
          cy="11"
          rx="9.2"
          ry="3.2"
          fill="none"
          stroke={iconColor}
          strokeWidth="1"
          strokeOpacity="0.22"
          transform="rotate(-22 11 11)"
        />
        {/* Bright arc of the ring — bottom-left half (in front of orb) */}
        <path
          d="M 3.4 13.2 A 9.2 3.2 0 0 0 18.6 8.8"
          fill="none"
          stroke={iconColor}
          strokeWidth="1.1"
          strokeOpacity="0.7"
          strokeLinecap="round"
          transform="rotate(-22 11 11)"
        />

        {/* Main orb */}
        <circle cx="11" cy="11" r="5.2" fill="url(#jl-orb)" />

        {/* Specular highlight on orb */}
        <ellipse
          cx="9.2"
          cy="9.1"
          rx="1.8"
          ry="1.0"
          fill="rgba(255,255,255,0.18)"
          transform="rotate(-25 9.2 9.1)"
        />

        {/* Small planet dot on the ring — top right quadrant */}
        <circle cx="18.1" cy="8.2" r="1.5" fill={iconColor} opacity="0.85"
          transform="rotate(-22 11 11)"
        />
        {/* Glow around the planet dot */}
        <circle cx="18.1" cy="8.2" r="2.8" fill={iconColor} opacity="0.15"
          transform="rotate(-22 11 11)"
        />
      </svg>

      {/* Wordmark */}
      {!markOnly && (
        <span
          style={{
            fontSize: Math.round(15 * s),
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: iconColor,
            fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
            lineHeight: 1,
          }}
        >
          {'Jala'}
          <span style={{ color: accentColor }}>{'yu'}</span>
        </span>
      )}
    </div>
  )
}
