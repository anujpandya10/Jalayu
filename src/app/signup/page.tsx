'use client'

import { useState } from 'react'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react'
import JalayuLogo from '@/components/JalayuLogo'
import AuthBackground from '@/components/AuthBackground'

const INTERESTS = [
  'AI assistant (research, drafting, planning)',
  'Trading Academy (paper trading + lessons)',
  'Notes, memory & journaling',
  'Calendar, tasks & reminders',
  'Health & wellness tracking',
  'Something else',
]

export default function RequestAccessPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [why, setWhy] = useState('')
  const [referral, setReferral] = useState('')
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const toggleInterest = (i: string) =>
    setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) { toast.error('Please add your name and email'); return }
    if (why.trim().length < 10) { toast.error('Tell us a little more about why you want in'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/access-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), answers: { role, interests, why, referral } }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Could not submit'); return }
      setDone(true)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (id: string): React.CSSProperties => ({
    width: '100%', padding: '12px 14px', borderRadius: 12,
    border: `1px solid ${focused === id ? 'rgba(0,201,167,0.7)' : 'rgba(255,255,255,0.1)'}`,
    background: focused === id ? 'rgba(0,201,167,0.06)' : 'rgba(255,255,255,0.04)',
    fontSize: 14, color: '#ffffff', outline: 'none', transition: 'border-color 0.15s, background 0.15s',
    fontFamily: 'inherit', boxSizing: 'border-box',
  })
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 7, letterSpacing: '0.06em', textTransform: 'uppercase' }

  return (
    <div style={{ minHeight: '100vh', background: '#020C16', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', position: 'relative', fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}>
      <AuthBackground />
      <Toaster position="top-center" containerStyle={{ top: 'max(20px, env(safe-area-inset-top))', zIndex: 9999 }} toastOptions={{ style: { background: 'rgba(2,15,30,0.95)', color: '#fff', border: '1px solid rgba(0,201,167,0.3)', borderRadius: 10, fontSize: 13, backdropFilter: 'blur(12px)' } }} />
      <style>{`::placeholder { color: rgba(255,255,255,0.28) !important; } @keyframes auth-card-in { from { opacity: 0; transform: translateY(24px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>

      <div style={{ width: '100%', maxWidth: 460, position: 'relative', zIndex: 1, animation: 'auth-card-in 0.5s ease both' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-block', marginBottom: 16 }}><JalayuLogo size={48} light tagline /></div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0, letterSpacing: '0.04em' }}>invite-only · request access</p>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: 24, padding: '32px 28px', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,201,167,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

          {done ? (
            <div style={{ textAlign: 'center', padding: '12px 4px' }}>
              <CheckCircle2 size={40} color="#4ADE80" style={{ margin: '0 auto 14px' }} />
              <h2 style={{ fontSize: 21, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Request received</h2>
              <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', margin: '0 0 22px', lineHeight: 1.6 }}>
                Thanks, {name.split(' ')[0] || 'there'}. We personally review every request. If it&apos;s a fit, you&apos;ll get an invite link by email to set up your account.
              </p>
              <Link href="/" style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>← Back to Jalayu.com</Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Request access</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 22px', lineHeight: 1.6 }}>
                Jalayu is a private, personal life OS — AI assistant, trading academy, notes, health and more. Tell us a bit about you and we&apos;ll be in touch.
              </p>

              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Your name</label>
                  <input className="auth-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required autoComplete="name" style={inputStyle('name')} onFocus={() => setFocused('name')} onBlur={() => setFocused(null)} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" style={inputStyle('email')} onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} />
                </div>
                <div>
                  <label style={labelStyle}>What do you do?</label>
                  <input className="auth-input" type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. founder, student, designer, trader…" style={inputStyle('role')} onFocus={() => setFocused('role')} onBlur={() => setFocused(null)} />
                </div>
                <div>
                  <label style={labelStyle}>Which parts interest you most?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {INTERESTS.map((i) => {
                      const on = interests.includes(i)
                      return (
                        <button type="button" key={i} onClick={() => toggleInterest(i)}
                          style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 10, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                            border: `1px solid ${on ? 'rgba(0,201,167,0.6)' : 'rgba(255,255,255,0.1)'}`, background: on ? 'rgba(0,201,167,0.1)' : 'rgba(255,255,255,0.03)', color: on ? '#7FFFE0' : 'rgba(255,255,255,0.65)' }}>
                          {on ? '✓ ' : ''}{i}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Why do you want to use Jalayu, and what for?</label>
                  <textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="The more specific, the better — what would you actually use it for?" required rows={4}
                    style={{ ...inputStyle('why'), resize: 'vertical' }} onFocus={() => setFocused('why')} onBlur={() => setFocused(null)} />
                </div>
                <div>
                  <label style={labelStyle}>How did you hear about Jalayu?</label>
                  <input className="auth-input" type="text" value={referral} onChange={(e) => setReferral(e.target.value)} placeholder="A friend, X/Twitter, etc." style={inputStyle('referral')} onFocus={() => setFocused('referral')} onBlur={() => setFocused(null)} />
                </div>

                <button type="submit" disabled={loading}
                  style={{ width: '100%', padding: '13px', marginTop: 4, background: loading ? 'rgba(0,201,167,0.3)' : 'linear-gradient(135deg, #009B83 0%, #00C9A7 50%, #67E8F9 100%)', color: '#020C16', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: loading ? 'none' : '0 4px 24px rgba(0,201,167,0.4)' }}>
                  {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                  {loading ? 'Sending request…' : 'Request access →'}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 10, padding: '10px 12px', marginTop: 16 }}>
                <ShieldCheck size={13} color="#4ADE80" style={{ marginTop: 1, flexShrink: 0 }} />
                <p style={{ fontSize: 11, color: 'rgba(74,222,128,0.85)', margin: 0, lineHeight: 1.5 }}>Your data belongs to you. Always private. Never sold.</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>ALREADY INVITED?</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              </div>
              <Link href="/login" style={{ display: 'block', width: '100%', textAlign: 'center', padding: '12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>Sign in</Link>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textDecoration: 'none' }}>← Back to Jalayu.com</Link>
        </p>
      </div>
    </div>
  )
}
