'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import JalayuLogo from '@/components/JalayuLogo'

// ── Pre-seeded star field (avoids SSR mismatch) ────────────────────────────────
const STARS = Array.from({ length: 180 }, (_, i) => {
  // Deterministic pseudo-random from index
  const x = ((i * 7919 + 1) % 10000) / 100
  const y = ((i * 6271 + 3) % 10000) / 100
  const size = ((i * 3571) % 3) === 0 ? 2.5 : ((i * 2333) % 3) === 1 ? 1.5 : 1
  const opacity = 0.3 + ((i * 1747) % 70) / 100
  const delay = ((i * 997) % 400) / 100
  const dur = 3 + ((i * 1123) % 40) / 10
  return { x, y, size, opacity, delay, dur }
})

const SHOOTING_STARS = [
  { top: 18, delay: 0,  dur: 1.2 },
  { top: 42, delay: 4,  dur: 0.9 },
  { top: 68, delay: 9,  dur: 1.4 },
]

export default function LandingPage() {
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Parallax tilt on mouse move
    const el = canvasRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      const { innerWidth: w, innerHeight: h } = window
      const dx = (e.clientX / w - 0.5) * 18
      const dy = (e.clientY / h - 0.5) * 10
      el.style.transform = `translate(${dx}px, ${dy}px)`
    }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  return (
    <div style={{ background: '#07060A', minHeight: '100vh', overflowX: 'hidden', fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}>

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: var(--op); transform: scale(1); }
          50%       { opacity: calc(var(--op) * 0.25); transform: scale(0.7); }
        }
        @keyframes shoot {
          0%   { transform: translateX(0) translateY(0); opacity: 0; }
          5%   { opacity: 1; }
          100% { transform: translateX(-900px) translateY(300px); opacity: 0; }
        }
        @keyframes floatUp {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-14px); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(196,131,74,0.5); }
          70%  { transform: scale(1);    box-shadow: 0 0 0 20px rgba(196,131,74,0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(196,131,74,0); }
        }
        @keyframes nebula-drift {
          0%, 100% { transform: scale(1)   rotate(0deg); }
          50%       { transform: scale(1.08) rotate(4deg); }
        }
        @keyframes orbit-glow {
          0%, 100% { opacity: 0.35; }
          50%       { opacity: 0.65; }
        }
        .land-cta-primary {
          background: linear-gradient(135deg, #C4834A 0%, #E8AA6A 50%, #C4834A 100%);
          background-size: 200% 200%;
          color: #1C1008;
          font-weight: 700;
          font-size: 15px;
          padding: 14px 36px;
          border-radius: 50px;
          border: none;
          cursor: pointer;
          letter-spacing: -0.01em;
          transition: transform 0.18s, box-shadow 0.18s, background-position 0.4s;
          box-shadow: 0 4px 32px rgba(196,131,74,0.45);
        }
        .land-cta-primary:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 8px 48px rgba(196,131,74,0.6);
          background-position: right center;
        }
        .land-cta-ghost {
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.82);
          font-weight: 500;
          font-size: 15px;
          padding: 14px 36px;
          border-radius: 50px;
          border: 1px solid rgba(255,255,255,0.14);
          cursor: pointer;
          letter-spacing: -0.01em;
          transition: background 0.18s, transform 0.18s;
          backdrop-filter: blur(8px);
        }
        .land-cta-ghost:hover {
          background: rgba(255,255,255,0.12);
          transform: translateY(-2px);
        }
        .feat-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          padding: 32px 28px;
          transition: transform 0.22s, border-color 0.22s, background 0.22s;
          position: relative;
          overflow: hidden;
        }
        .feat-card:hover {
          transform: translateY(-6px);
          border-color: rgba(196,131,74,0.35);
          background: rgba(196,131,74,0.05);
        }
        .feat-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(196,131,74,0.5), transparent);
          opacity: 0;
          transition: opacity 0.22s;
        }
        .feat-card:hover::before { opacity: 1; }
        .nav-signin {
          color: rgba(255,255,255,0.7);
          font-size: 13px;
          font-weight: 500;
          text-decoration: none;
          padding: 7px 18px;
          border-radius: 99px;
          border: 1px solid rgba(255,255,255,0.14);
          transition: background 0.15s, color 0.15s;
        }
        .nav-signin:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .morning-note-mock {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(196,131,74,0.2);
          border-radius: 20px;
          padding: 28px 32px;
          position: relative;
          overflow: hidden;
        }
        .morning-note-mock::after {
          content: '\\201C';
          position: absolute;
          top: -12px; right: 16px;
          font-size: 120px;
          color: rgba(196,131,74,0.07);
          font-family: Georgia, serif;
          line-height: 1;
          pointer-events: none;
        }
        @media (max-width: 700px) {
          .feat-grid { grid-template-columns: 1fr !important; }
          .hero-headline { font-size: clamp(36px, 10vw, 64px) !important; }
          .hero-sub { font-size: 15px !important; }
          .hero-btns { flex-direction: column !important; align-items: stretch !important; }
          .land-cta-primary, .land-cta-ghost { text-align: center; }
          .manifesto-text { font-size: clamp(22px, 6vw, 42px) !important; }
          .two-col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Starfield layer ────────────────────────────────────────────────── */}
      <div ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', transition: 'transform 0.4s ease-out', willChange: 'transform' }}>
        {/* Nebula blobs */}
        <div style={{ position: 'absolute', top: '5%', left: '10%', width: 600, height: 400, borderRadius: '60%', background: 'radial-gradient(ellipse, rgba(196,131,74,0.12) 0%, transparent 70%)', animation: 'nebula-drift 18s ease-in-out infinite', filter: 'blur(1px)' }} />
        <div style={{ position: 'absolute', top: '40%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(120,80,180,0.1) 0%, transparent 70%)', animation: 'nebula-drift 24s ease-in-out infinite reverse', filter: 'blur(2px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', left: '30%', width: 700, height: 300, borderRadius: '60%', background: 'radial-gradient(ellipse, rgba(196,131,74,0.07) 0%, transparent 70%)', animation: 'nebula-drift 20s ease-in-out infinite 6s' }} />

        {/* Stars */}
        {STARS.map((s, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: i % 7 === 0 ? '#E8AA6A' : '#ffffff',
            // @ts-expect-error CSS variable
            '--op': s.opacity,
            opacity: s.opacity,
            animation: `twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }} />
        ))}

        {/* Shooting stars */}
        {SHOOTING_STARS.map((ss, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: `${ss.top}%`,
            right: '-5%',
            width: 180,
            height: 1.5,
            background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.85), rgba(232,170,106,0.5))',
            borderRadius: 99,
            animation: `shoot ${ss.dur}s linear ${ss.delay}s infinite`,
            opacity: 0,
          }} />
        ))}
      </div>

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', background: 'rgba(7,6,10,0.6)' }}>
        <JalayuLogo size={30} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/login" className="nav-signin">Sign in</Link>
          <Link href="/signup" style={{ background: '#C4834A', color: '#1C1008', fontSize: 13, fontWeight: 700, padding: '7px 18px', borderRadius: 99, textDecoration: 'none', transition: 'opacity 0.15s' }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '120px 24px 80px' }}>
        {/* Glowing orb behind logo */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -60%)', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(196,131,74,0.18) 0%, transparent 70%)', pointerEvents: 'none', animation: 'orbit-glow 6s ease-in-out infinite' }} />

        {/* Logo — big, floating */}
        <div style={{ marginBottom: 32, animation: 'floatUp 6s ease-in-out infinite' }}>
          <JalayuLogo size={72} />
        </div>

        {/* Eyebrow */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(196,131,74,0.1)', border: '1px solid rgba(196,131,74,0.25)', borderRadius: 99, padding: '5px 14px', marginBottom: 24, animation: 'fadeInUp 0.8s ease both 0.1s' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C4834A', animation: 'pulse-ring 2s infinite' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#C4834A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Your morning companion</span>
        </div>

        {/* Headline */}
        <h1 className="hero-headline" style={{ fontSize: 'clamp(44px, 7vw, 80px)', fontWeight: 800, color: '#ffffff', lineHeight: 1.08, letterSpacing: '-0.035em', margin: '0 0 20px', maxWidth: 820, animation: 'fadeInUp 0.8s ease both 0.2s' }}>
          The day doesn&apos;t begin<br />
          <span style={{ background: 'linear-gradient(135deg, #C4834A 0%, #F0C080 50%, #C4834A 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            until Jalayu does.
          </span>
        </h1>

        {/* Sub */}
        <p className="hero-sub" style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 520, margin: '0 0 44px', fontWeight: 400, animation: 'fadeInUp 0.8s ease both 0.35s' }}>
          A personal AI that reads your life, writes you a morning note, tracks your mood, manages your tasks, and quietly trades the markets while you focus on what matters.
        </p>

        {/* CTAs */}
        <div className="hero-btns" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', animation: 'fadeInUp 0.8s ease both 0.5s' }}>
          <Link href="/signup"><button className="land-cta-primary">Start your mornings →</button></Link>
          <Link href="/login"><button className="land-cta-ghost">I already have an account</button></Link>
        </div>

        {/* Scroll hint */}
        <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animation: 'floatUp 3s ease-in-out infinite', opacity: 0.4 }}>
          <div style={{ width: 1, height: 36, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.5))' }} />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Scroll</span>
        </div>
      </section>

      {/* ── MANIFESTO BAND ──────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(196,131,74,0.04)', textAlign: 'center' }}>
        <p className="manifesto-text" style={{ fontSize: 'clamp(26px, 4.5vw, 52px)', fontWeight: 700, color: 'rgba(255,255,255,0.92)', lineHeight: 1.3, letterSpacing: '-0.025em', maxWidth: 860, margin: '0 auto', fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic' }}>
          &ldquo;Most apps demand your attention.<br />
          <span style={{ color: '#C4834A' }}>Jalayu gives it back.</span>&rdquo;
        </p>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '100px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#C4834A', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>What Jalayu does</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.15, margin: 0 }}>
            Everything you need.<br />Nothing you don&apos;t.
          </h2>
        </div>

        <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>

          {/* Morning Note */}
          <div className="feat-card">
            <div style={{ fontSize: 32, marginBottom: 18 }}>🌅</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 10px' }}>Your daily letter</h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>
              Every morning, Jalayu reads your goals, your mood history, and your tasks — then writes you a personal 2-sentence note. Not generic motivation. Your life, reflected back.
            </p>
            <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(196,131,74,0.08)', borderRadius: 12, borderLeft: '2px solid rgba(196,131,74,0.4)' }}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'Georgia, serif', fontStyle: 'italic', margin: 0, lineHeight: 1.6 }}>
                &ldquo;You've been consistent this week — today might be the day to push on what you've been avoiding.&rdquo;
              </p>
            </div>
          </div>

          {/* Life Tracking */}
          <div className="feat-card">
            <div style={{ fontSize: 32, marginBottom: 18 }}>🧠</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 10px' }}>Intelligent life tracking</h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>
              Log your mood, tasks, goals, meetings and memories in one place. Jalayu finds patterns in your data — your peak hours, stress triggers, and what actually makes you productive.
            </p>
            <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Mood tracking', 'Smart tasks', 'Peak hours', 'Memory log'].map(t => (
                <span key={t} style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', padding: '3px 10px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.08)' }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Trading */}
          <div className="feat-card">
            <div style={{ fontSize: 32, marginBottom: 18 }}>📈</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 10px' }}>24/7 auto trading</h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>
              A two-stage signal engine scans crypto, US stocks, and forex around the clock. RSI, VWAP, volume spikes — it finds the setup, enters the trade, and exits with discipline.
            </p>
            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#22C55E', lineHeight: 1 }}>$547.20</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>+9.4% · paper trading</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {['+$4.20', '+$1.88', '-$0.60', '+$3.11'].map((p, i) => (
                  <div key={i} style={{ fontSize: 11, fontWeight: 600, color: p.startsWith('+') ? '#22C55E' : '#EF4444', textAlign: 'right' }}>{p}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE MORNING RITUAL ──────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '80px 24px 100px', maxWidth: 900, margin: '0 auto' }}>
        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#C4834A', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>The ritual</p>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 40px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2, margin: '0 0 18px' }}>
              Open. Read. Answer one question. Begin.
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, margin: '0 0 28px' }}>
              The whole home screen is a conversation. Jalayu speaks first — briefly. Then asks you one honest question. Your answer sets the tone for the day. That&apos;s it.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { emoji: '✦', text: 'Jalayu writes your morning note based on your actual data' },
                { emoji: '✦', text: 'You answer one question: what does today need to be about?' },
                { emoji: '✦', text: 'Your tasks appear below — nothing else competing for attention' },
              ].map(({ emoji, text }) => (
                <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: '#C4834A', flexShrink: 0, marginTop: 1 }}>{emoji}</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mock UI */}
          <div className="morning-note-mock">
            <div style={{ fontSize: 11, fontWeight: 700, color: '#C4834A', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>✦ Thursday, May 16 · Day 7</div>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.82)', fontFamily: 'Georgia, serif', fontStyle: 'italic', lineHeight: 1.75, margin: '0 0 20px' }}>
              &ldquo;You&apos;ve kept your streak alive through a tough week. The goal you set isn&apos;t far — today feels like a day to close the gap.&rdquo;
            </p>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '0 0 8px' }}>What does today need to be about?</p>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(196,131,74,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                deep work, no distractions…
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['Review Q2 goals', 'Call with team at 3pm', 'Journal before sleep'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 1, padding: '100px 24px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Glow */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 500, height: 300, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(196,131,74,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ marginBottom: 28, animation: 'floatUp 5s ease-in-out infinite' }}>
          <JalayuLogo size={52} />
        </div>
        <h2 style={{ fontSize: 'clamp(30px, 5vw, 56px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 16px' }}>
          Your mornings are<br />
          <span style={{ color: '#C4834A' }}>worth protecting.</span>
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: 440, margin: '0 auto 44px' }}>
          Free to start. No credit card. Just a better way to begin each day.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup"><button className="land-cta-primary">Create your account →</button></Link>
          <Link href="/login"><button className="land-cta-ghost">Sign in</button></Link>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer style={{ position: 'relative', zIndex: 1, padding: '28px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <JalayuLogo size={22} />
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', margin: 0 }}>
          Built for people who take their mornings seriously.
        </p>
        <div style={{ display: 'flex', gap: 20 }}>
          <Link href="/login"  style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>Sign in</Link>
          <Link href="/signup" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>Sign up</Link>
        </div>
      </footer>

    </div>
  )
}
