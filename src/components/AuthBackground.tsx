'use client'

/**
 * Shared galaxy background for auth pages (login, signup).
 * Same visual language as the landing page — dark space, twinkling stars, nebula blobs.
 */

// Pre-seeded so no SSR mismatch
const STARS = Array.from({ length: 140 }, (_, i) => ({
  x:       ((i * 7919 + 1) % 10000) / 100,
  y:       ((i * 6271 + 3) % 10000) / 100,
  size:    ((i * 3571) % 3) === 0 ? 2.2 : ((i * 2333) % 3) === 1 ? 1.4 : 0.9,
  opacity: 0.25 + ((i * 1747) % 65) / 100,
  delay:   ((i * 997)  % 380) / 100,
  dur:     3 + ((i * 1123) % 36) / 10,
  amber:   i % 9 === 0,
}))

export default function AuthBackground() {
  return (
    <>
      <style>{`
        @keyframes auth-twinkle {
          0%, 100% { opacity: var(--op); }
          50%       { opacity: calc(var(--op) * 0.2); }
        }
        @keyframes auth-nebula {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50%       { transform: scale(1.07) rotate(3deg); }
        }
      `}</style>

      {/* Fixed starfield */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {/* Nebula blobs */}
        <div style={{ position: 'absolute', top: '-5%', left: '15%', width: 560, height: 360, borderRadius: '60%', background: 'radial-gradient(ellipse, rgba(196,131,74,0.13) 0%, transparent 70%)', animation: 'auth-nebula 20s ease-in-out infinite', filter: 'blur(2px)' }} />
        <div style={{ position: 'absolute', bottom: '5%', right: '-5%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(120,80,180,0.09) 0%, transparent 70%)', animation: 'auth-nebula 26s ease-in-out infinite reverse', filter: 'blur(3px)' }} />
        <div style={{ position: 'absolute', top: '40%', left: '-10%', width: 400, height: 300, borderRadius: '60%', background: 'radial-gradient(ellipse, rgba(196,131,74,0.07) 0%, transparent 70%)', animation: 'auth-nebula 18s ease-in-out infinite 5s' }} />

        {/* Stars */}
        {STARS.map((s, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              borderRadius: '50%',
              background: s.amber ? '#E8AA6A' : '#ffffff',
              // @ts-expect-error CSS custom property
              '--op': s.opacity,
              opacity: s.opacity,
              animation: `auth-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        ))}
      </div>
    </>
  )
}
