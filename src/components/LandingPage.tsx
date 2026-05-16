'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import JalayuLogo from '@/components/JalayuLogo'

// ── Pre-seeded bioluminescent particles ───────────────────────────────────────
// Jalayu = "water-dwelling creature" (Sanskrit jal = water, life in motion)
// Each particle is a tiny sea organism glowing in the deep.
const PARTICLES = Array.from({ length: 160 }, (_, i) => {
  const x       = ((i * 7919 + 1) % 10000) / 100
  const y       = ((i * 6271 + 3) % 10000) / 100
  const size    = ((i * 3571) % 4) === 0 ? 3 : ((i * 2333) % 4) === 1 ? 2 : ((i * 1999) % 4) === 2 ? 1.5 : 1
  const opacity = 0.15 + ((i * 1747) % 65) / 100
  const delay   = ((i * 997)  % 500) / 100
  const dur     = 4 + ((i * 1123) % 50) / 10
  // colour: mostly teal, some cyan, a few soft blue
  const colour  = i % 7 === 0 ? '#67E8F9' : i % 5 === 0 ? '#0EA5E9' : '#00C9A7'
  const glow    = size >= 2.5
  return { x, y, size, opacity, delay, dur, colour, glow }
})

// Larger jellyfish-like blobs that drift slowly
const BLOBS = [
  { cx: 18, cy: 12, rx: 520, ry: 320, colour: '#00C9A7', op: 0.10, dur: 22, delay: 0 },
  { cx: 78, cy: 65, rx: 440, ry: 380, colour: '#0EA5E9', op: 0.08, dur: 28, delay: 6 },
  { cx: 42, cy: 80, rx: 600, ry: 260, colour: '#00C9A7', op: 0.07, dur: 20, delay: 3 },
  { cx: -5, cy: 48, rx: 360, ry: 360, colour: '#67E8F9', op: 0.06, dur: 32, delay: 10 },
]

// Light rays filtering down from the surface
const RAYS = [
  { left: 25, dur: 14, delay: 0 },
  { left: 55, dur: 18, delay: 5 },
  { left: 72, dur: 12, delay: 9 },
]

export default function LandingPage() {
  const bgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = bgRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      const dx = (e.clientX / window.innerWidth  - 0.5) * 14
      const dy = (e.clientY / window.innerHeight - 0.5) *  8
      el.style.transform = `translate(${dx}px, ${dy}px)`
    }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  return (
    <div style={{
      background: 'linear-gradient(180deg, #020C16 0%, #030F1E 35%, #021422 65%, #010B14 100%)',
      minHeight: '100vh',
      overflowX: 'hidden',
      fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
    }}>

      <style>{`
        @keyframes bioFloat {
          0%, 100% { opacity: var(--op); transform: translateY(0) scale(1); }
          50%       { opacity: calc(var(--op) * 0.3); transform: translateY(-8px) scale(0.85); }
        }
        @keyframes blobDrift {
          0%, 100% { transform: scale(1) translate(0, 0); }
          33%       { transform: scale(1.06) translate(12px, -8px); }
          66%       { transform: scale(0.96) translate(-8px, 10px); }
        }
        @keyframes rayShimmer {
          0%, 100% { opacity: 0; }
          15%       { opacity: 1; }
          85%       { opacity: 1; }
        }
        @keyframes surfaceRise {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes depthFloat {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-16px); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,201,167,0.5); }
          50%       { box-shadow: 0 0 0 16px rgba(0,201,167,0); }
        }
        @keyframes ripple {
          0%   { transform: scale(0.95); }
          50%  { transform: scale(1.05); }
          100% { transform: scale(0.95); }
        }
        .land-cta-primary {
          background: linear-gradient(135deg, #009B83 0%, #00C9A7 45%, #67E8F9 100%);
          background-size: 200% 200%;
          color: #020C16;
          font-weight: 700;
          font-size: 15px;
          padding: 14px 36px;
          border-radius: 50px;
          border: none;
          cursor: pointer;
          letter-spacing: -0.01em;
          transition: transform 0.18s, box-shadow 0.18s;
          box-shadow: 0 4px 32px rgba(0,201,167,0.45);
        }
        .land-cta-primary:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 8px 48px rgba(0,201,167,0.65);
        }
        .land-cta-ghost {
          background: rgba(0,201,167,0.06);
          color: rgba(255,255,255,0.8);
          font-weight: 500;
          font-size: 15px;
          padding: 14px 36px;
          border-radius: 50px;
          border: 1px solid rgba(0,201,167,0.2);
          cursor: pointer;
          letter-spacing: -0.01em;
          transition: background 0.18s, transform 0.18s, border-color 0.18s;
          backdrop-filter: blur(8px);
        }
        .land-cta-ghost:hover {
          background: rgba(0,201,167,0.12);
          border-color: rgba(0,201,167,0.4);
          transform: translateY(-2px);
        }
        .feat-card {
          background: rgba(0,201,167,0.03);
          border: 1px solid rgba(0,201,167,0.1);
          border-radius: 24px;
          padding: 32px 28px;
          transition: transform 0.22s, border-color 0.22s, background 0.22s;
          position: relative;
          overflow: hidden;
        }
        .feat-card:hover {
          transform: translateY(-6px);
          border-color: rgba(0,201,167,0.3);
          background: rgba(0,201,167,0.06);
        }
        .feat-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(0,201,167,0.6), transparent);
          opacity: 0;
          transition: opacity 0.22s;
        }
        .feat-card:hover::before { opacity: 1; }
        .land-footer {
          background: linear-gradient(180deg, transparent 0%, rgba(0, 201, 167, 0.04) 100%);
        }
        .land-footer-tagline {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.72);
          margin: 0;
          letter-spacing: 0.02em;
        }
        .land-footer-link {
          font-size: 13px;
          font-weight: 500;
          color: rgba(167, 243, 232, 0.95);
          text-decoration: none;
          transition: color 0.15s;
        }
        .land-footer-link:hover {
          color: #00C9A7;
        }
        .land-bottom-muted {
          color: rgba(255, 255, 255, 0.68);
        }
        .land-bottom-subtle {
          color: rgba(255, 255, 255, 0.55);
        }
        .nav-signin {
          color: rgba(255,255,255,0.65);
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
          padding: 7px 18px;
          border-radius: 99px;
          border: 1px solid rgba(0,201,167,0.2);
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .nav-signin:hover {
          background: rgba(0,201,167,0.08);
          color: #fff;
          border-color: rgba(0,201,167,0.4);
        }
        @media (max-width: 700px) {
          .feat-grid { grid-template-columns: 1fr !important; }
          .hero-h1   { font-size: clamp(36px, 10vw, 64px) !important; }
          .hero-sub  { font-size: 15px !important; }
          .hero-btns { flex-direction: column !important; align-items: stretch !important; }
          .land-cta-primary, .land-cta-ghost { text-align: center; }
          .manifesto  { font-size: clamp(22px, 6vw, 42px) !important; }
          .two-col    { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Deep-water background layer ───────────────────────────────────── */}
      <div ref={bgRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', transition: 'transform 0.5s ease-out', willChange: 'transform' }}>

        {/* Bioluminescent depth blobs */}
        {BLOBS.map((b, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${b.cx}%`, top: `${b.cy}%`,
            width: b.rx, height: b.ry,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${b.colour} 0%, transparent 70%)`,
            opacity: b.op,
            filter: 'blur(3px)',
            animation: `blobDrift ${b.dur}s ease-in-out ${b.delay}s infinite`,
            transform: 'translate(-50%, -50%)',
          }} />
        ))}

        {/* Surface light rays (from above the water) */}
        {RAYS.map((r, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: 0,
            left: `${r.left}%`,
            width: 2,
            height: '60vh',
            background: 'linear-gradient(to bottom, rgba(103,232,249,0.18), rgba(0,201,167,0.06), transparent)',
            filter: 'blur(6px)',
            transformOrigin: 'top center',
            transform: `rotate(${(i - 1) * 8}deg)`,
            animation: `rayShimmer ${r.dur}s ease-in-out ${r.delay}s infinite`,
          }} />
        ))}

        {/* Bioluminescent particles */}
        {PARTICLES.map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: p.colour,
            // @ts-expect-error CSS variable
            '--op': p.opacity,
            opacity: p.opacity,
            boxShadow: p.glow ? `0 0 ${p.size * 3}px ${p.colour}` : 'none',
            animation: `bioFloat ${p.dur}s ease-in-out ${p.delay}s infinite`,
          }} />
        ))}
      </div>

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,201,167,0.08)', backdropFilter: 'blur(20px)', background: 'rgba(2,12,22,0.7)' }}>
        <JalayuLogo size={30} light />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/login" className="nav-signin">Sign in</Link>
          <Link href="/signup" style={{ background: 'linear-gradient(135deg, #009B83, #00C9A7)', color: '#020C16', fontSize: 13, fontWeight: 700, padding: '7px 18px', borderRadius: 99, textDecoration: 'none', boxShadow: '0 2px 16px rgba(0,201,167,0.4)', transition: 'opacity 0.15s, box-shadow 0.15s' }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '120px 24px 80px' }}>

        {/* Glow pool beneath logo */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -62%)', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,201,167,0.16) 0%, transparent 70%)', pointerEvents: 'none', animation: 'ripple 7s ease-in-out infinite' }} />

        {/* Logo — large, floating */}
        <div style={{ marginBottom: 32, animation: 'depthFloat 7s ease-in-out infinite' }}>
          <JalayuLogo size={76} light />
        </div>

        {/* Eyebrow */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,201,167,0.08)', border: '1px solid rgba(0,201,167,0.22)', borderRadius: 99, padding: '5px 14px', marginBottom: 24, animation: 'surfaceRise 0.8s ease both 0.1s' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00C9A7', animation: 'pulseGlow 2.5s infinite' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#00C9A7', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Born from water</span>
        </div>

        {/* Headline */}
        <h1 className="hero-h1" style={{ fontSize: 'clamp(44px, 7vw, 82px)', fontWeight: 800, color: '#ffffff', lineHeight: 1.07, letterSpacing: '-0.035em', margin: '0 0 20px', maxWidth: 840, animation: 'surfaceRise 0.8s ease both 0.2s' }}>
          Rise to the surface<br />
          <span style={{ background: 'linear-gradient(135deg, #00C9A7 0%, #67E8F9 50%, #00C9A7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            of your day.
          </span>
        </h1>

        {/* Sub */}
        <p className="hero-sub" style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, maxWidth: 520, margin: '0 0 44px', fontWeight: 400, animation: 'surfaceRise 0.8s ease both 0.35s' }}>
          A personal AI companion that reads your life, writes you a morning note, tracks your mood, manages your tasks, and quietly trades the markets — so you can focus on what actually matters.
        </p>

        {/* CTAs */}
        <div className="hero-btns" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', animation: 'surfaceRise 0.8s ease both 0.5s' }}>
          <Link href="/signup"><button className="land-cta-primary">Begin your mornings →</button></Link>
          <Link href="/login"><button className="land-cta-ghost">I already have an account</button></Link>
        </div>

        {/* Scroll hint */}
        <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animation: 'depthFloat 3s ease-in-out infinite', opacity: 0.35 }}>
          <div style={{ width: 1, height: 36, background: 'linear-gradient(to bottom, transparent, rgba(0,201,167,0.7))' }} />
          <span style={{ fontSize: 10, color: 'rgba(0,201,167,0.6)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Dive in</span>
        </div>
      </section>

      {/* ── MANIFESTO ────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px', borderTop: '1px solid rgba(0,201,167,0.07)', borderBottom: '1px solid rgba(0,201,167,0.07)', background: 'rgba(0,201,167,0.03)', textAlign: 'center' }}>
        <p className="manifesto" style={{ fontSize: 'clamp(26px, 4.5vw, 52px)', fontWeight: 700, color: 'rgba(255,255,255,0.92)', lineHeight: 1.3, letterSpacing: '-0.025em', maxWidth: 860, margin: '0 auto', fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic' }}>
          &ldquo;Most apps pull you to the surface.<br />
          <span style={{ color: '#00C9A7' }}>Jalayu lets you breathe there.&rdquo;</span>
        </p>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '100px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#00C9A7', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>Life in motion</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.15, margin: 0 }}>
            Everything in one depth.<br />Nothing noise.
          </h2>
        </div>

        <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>

          {/* Morning Note */}
          <div className="feat-card">
            <div style={{ fontSize: 32, marginBottom: 18 }}>🌊</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 10px' }}>Your daily letter</h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.48)', lineHeight: 1.75, margin: 0 }}>
              Every morning, Jalayu reads your goals, your mood history, and what&apos;s ahead — then surfaces a personal 2-sentence note. Not generic wisdom. Your life, reflected back.
            </p>
            <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(0,201,167,0.07)', borderRadius: 12, borderLeft: '2px solid rgba(0,201,167,0.4)' }}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.58)', fontFamily: 'Georgia, serif', fontStyle: 'italic', margin: 0, lineHeight: 1.65 }}>
                &ldquo;You&apos;ve been consistent this week — today might be the day to close the gap on what you&apos;ve been circling.&rdquo;
              </p>
            </div>
          </div>

          {/* Life Tracking */}
          <div className="feat-card">
            <div style={{ fontSize: 32, marginBottom: 18 }}>🧬</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 10px' }}>Intelligent tracking</h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.48)', lineHeight: 1.75, margin: 0 }}>
              Log mood, tasks, goals, meetings, memories — all in one place. Jalayu finds patterns in the depth: your peak hours, stress triggers, what actually moves you forward.
            </p>
            <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Mood tracking', 'Smart tasks', 'Peak hours', 'Memory log'].map(t => (
                <span key={t} style={{ fontSize: 11, fontWeight: 500, color: 'rgba(0,201,167,0.8)', background: 'rgba(0,201,167,0.08)', padding: '3px 10px', borderRadius: 99, border: '1px solid rgba(0,201,167,0.15)' }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Trading */}
          <div className="feat-card">
            <div style={{ fontSize: 32, marginBottom: 18 }}>📡</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 10px' }}>24/7 auto trading</h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.48)', lineHeight: 1.75, margin: 0 }}>
              A two-stage signal engine scans crypto, US stocks, and forex around the clock. RSI, VWAP, volume spikes — it finds the setup, enters, and exits with discipline. While you sleep.
            </p>
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#4ADE80', lineHeight: 1 }}>$547.20</div>
                <div className="land-bottom-subtle" style={{ fontSize: 11, marginTop: 2 }}>+9.4% · paper trading</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {['+$4.20', '+$1.88', '-$0.60', '+$3.11'].map((p, i) => (
                  <div key={i} style={{ fontSize: 11, fontWeight: 600, color: p.startsWith('+') ? '#4ADE80' : '#EF4444', textAlign: 'right' }}>{p}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE RITUAL ───────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px 100px', maxWidth: 900, margin: '0 auto' }}>
        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#00C9A7', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>The ritual</p>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 40px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2, margin: '0 0 18px' }}>
              Open. Read. Answer one question. Surface.
            </h2>
            <p className="land-bottom-muted" style={{ fontSize: 15, lineHeight: 1.8, margin: '0 0 28px' }}>
              The whole home screen is a conversation. Jalayu speaks first — briefly, with intention. Then asks you one honest question. Your answer sets the current for the day.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { e: '〰', t: 'Jalayu writes your morning note from your actual data — not a template' },
                { e: '〰', t: 'You answer one question: what does today need to be about?' },
                { e: '〰', t: 'Your tasks appear below — nothing else competing for your attention' },
              ].map(({ e, t }) => (
                <div key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: '#00C9A7', flexShrink: 0, marginTop: 1, fontWeight: 700 }}>{e}</span>
                  <span className="land-bottom-muted" style={{ fontSize: 14, lineHeight: 1.65 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mock morning note */}
          <div style={{ background: 'rgba(0,201,167,0.04)', border: '1px solid rgba(0,201,167,0.15)', borderRadius: 20, padding: '28px 28px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,201,167,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: '#00C9A7', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>〰 Thursday, May 16 · Day 7</div>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.82)', fontFamily: 'Georgia, serif', fontStyle: 'italic', lineHeight: 1.8, margin: '0 0 20px' }}>
              &ldquo;You kept your streak alive through a tough week. The goal you set isn&apos;t far — today feels like the day to close the gap.&rdquo;
            </p>
            <div style={{ borderTop: '1px solid rgba(0,201,167,0.12)', paddingTop: 16, marginBottom: 16 }}>
              <p className="land-bottom-subtle" style={{ fontSize: 12, margin: '0 0 8px', fontWeight: 600 }}>What does today need to be about?</p>
              <div style={{ background: 'rgba(0,201,167,0.06)', border: '1px solid rgba(0,201,167,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic' }}>
                deep work, no distractions…
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {['Review Q2 goals', 'Call with team at 3pm', 'Journal before sleep'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid rgba(0,201,167,0.3)', flexShrink: 0 }} />
                  <span className="land-bottom-muted" style={{ fontSize: 13 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '100px 24px', textAlign: 'center', borderTop: '1px solid rgba(0,201,167,0.07)' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 600, height: 400, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,201,167,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ marginBottom: 28, animation: 'depthFloat 6s ease-in-out infinite' }}>
          <JalayuLogo size={56} light />
        </div>
        <h2 style={{ fontSize: 'clamp(30px, 5vw, 56px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 16px' }}>
          Your mornings are<br />
          <span style={{ color: '#00C9A7' }}>worth protecting.</span>
        </h2>
        <p className="land-bottom-muted" style={{ fontSize: 16, lineHeight: 1.7, maxWidth: 420, margin: '0 auto 44px' }}>
          Free to start. No credit card. Just a better way to begin each day — from the depths up.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup"><button className="land-cta-primary">Create your account →</button></Link>
          <Link href="/login"><button className="land-cta-ghost">Sign in</button></Link>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="land-footer" style={{ position: 'relative', zIndex: 1, padding: '32px 24px 36px', borderTop: '1px solid rgba(0,201,167,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <JalayuLogo size={22} light />
        <p className="land-footer-tagline">
          Jalayu — जलायु — life in motion.
        </p>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/login" className="land-footer-link">Sign in</Link>
          <Link href="/signup" className="land-footer-link">Sign up</Link>
        </div>
      </footer>

    </div>
  )
}
