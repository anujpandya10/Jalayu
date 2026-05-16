'use client'

/**
 * Deep-ocean bioluminescent background for auth pages.
 * Jalayu = जलायु = water-dwelling creature (Sanskrit).
 */

const PARTICLES = Array.from({ length: 120 }, (_, i) => ({
  x:       ((i * 7919 + 1) % 10000) / 100,
  y:       ((i * 6271 + 3) % 10000) / 100,
  size:    ((i * 3571) % 4) === 0 ? 2.8 : ((i * 2333) % 4) === 1 ? 1.8 : 1.1,
  opacity: 0.12 + ((i * 1747) % 60) / 100,
  delay:   ((i * 997)  % 450) / 100,
  dur:     4 + ((i * 1123) % 44) / 10,
  colour:  i % 7 === 0 ? '#67E8F9' : i % 5 === 0 ? '#0EA5E9' : '#00C9A7',
  glow:    ((i * 3571) % 4) === 0,
}))

export default function AuthBackground() {
  return (
    <>
      <style>{`
        @keyframes authBio {
          0%, 100% { opacity: var(--op); transform: translateY(0) scale(1); }
          50%       { opacity: calc(var(--op) * 0.2); transform: translateY(-6px) scale(0.8); }
        }
        @keyframes authBlob {
          0%, 100% { transform: scale(1) translate(0, 0); }
          50%       { transform: scale(1.08) translate(8px, -6px); }
        }
        @keyframes authRay {
          0%, 100% { opacity: 0; }
          20%       { opacity: 1; }
          80%       { opacity: 1; }
        }
      `}</style>

      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden',
        background: 'linear-gradient(180deg, #020C16 0%, #030F1E 50%, #021422 100%)' }}>

        {/* Depth blobs */}
        <div style={{ position: 'absolute', top: '-8%', left: '10%', width: 560, height: 360, borderRadius: '60%', background: 'radial-gradient(ellipse, rgba(0,201,167,0.12) 0%, transparent 70%)', filter: 'blur(3px)', animation: 'authBlob 22s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '0%', right: '-5%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(14,165,233,0.09) 0%, transparent 70%)', filter: 'blur(4px)', animation: 'authBlob 28s ease-in-out infinite reverse' }} />
        <div style={{ position: 'absolute', top: '35%', left: '-8%', width: 400, height: 320, borderRadius: '60%', background: 'radial-gradient(ellipse, rgba(0,201,167,0.07) 0%, transparent 70%)', filter: 'blur(3px)', animation: 'authBlob 18s ease-in-out infinite 5s' }} />

        {/* Light rays from surface */}
        {[22, 58, 78].map((left, i) => (
          <div key={i} style={{ position: 'absolute', top: 0, left: `${left}%`, width: 2, height: '55vh', background: 'linear-gradient(to bottom, rgba(103,232,249,0.14), rgba(0,201,167,0.05), transparent)', filter: 'blur(6px)', transform: `rotate(${(i - 1) * 7}deg)`, transformOrigin: 'top center', animation: `authRay ${14 + i * 4}s ease-in-out ${i * 4}s infinite` }} />
        ))}

        {/* Bioluminescent particles */}
        {PARTICLES.map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${p.x}%`, top: `${p.y}%`,
            width: p.size, height: p.size,
            borderRadius: '50%',
            background: p.colour,
            // @ts-expect-error CSS variable
            '--op': p.opacity,
            opacity: p.opacity,
            boxShadow: p.glow ? `0 0 ${p.size * 4}px ${p.colour}` : 'none',
            animation: `authBio ${p.dur}s ease-in-out ${p.delay}s infinite`,
          }} />
        ))}
      </div>
    </>
  )
}
