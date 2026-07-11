'use client'

/**
 * The "alive" dashboard background — a slow breathing glow + a few drifting
 * bioluminescent dots, the same idea as the marketing landing page's plankton,
 * dialed down to sit behind hours of reading/writing instead of announcing
 * itself. Mounted once in dashboard/layout.tsx (not per-view) so the animation
 * doesn't restart on navigation. Purely decorative: fixed, behind all content,
 * ignores clicks. Respects prefers-reduced-motion (see globals.css).
 */
const PLANKTON = [
  { top: '14%', left: '62%', size: 5, opacity: 0.5, duration: '9s', delay: '0s' },
  { top: '68%', left: '22%', size: 3, opacity: 0.4, duration: '11s', delay: '1.5s' },
  { top: '40%', left: '88%', size: 4, opacity: 0.35, duration: '8s', delay: '3s' },
]

export default function AmbientBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        // Fixed (not absolute) so it's a pure viewport backdrop — completely out of the
        // scroll flow, so it can never affect the page's scroll height. The glow/plankton
        // stay put as the content scrolls over them, which reads as real depth.
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <div
        className="ambient-pulse"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--glow-pulse) 0%, transparent 70%)',
          transform: 'translate(-30%, -30%)',
          animation: 'ambient-breathe 6s ease-in-out infinite',
        }}
      />
      {PLANKTON.map((p, i) => (
        <span
          key={i}
          className="ambient-plankton"
          style={{
            position: 'absolute',
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: 'var(--glow-plankton)',
            opacity: p.opacity,
            animation: `ambient-drift ${p.duration} ease-in-out infinite ${p.delay}`,
          }}
        />
      ))}
    </div>
  )
}
