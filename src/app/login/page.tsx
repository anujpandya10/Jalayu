'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import toast, { Toaster } from 'react-hot-toast'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import JalayuLogo from '@/components/JalayuLogo'
import AuthBackground from '@/components/AuthBackground'

export default function LoginPage() {
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [focused, setFocused]         = useState<string | null>(null)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { toast.error('Please fill in all fields'); return }

    const supabase = createClient()
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        toast.error(error.message.includes('Invalid') ? 'Wrong email or password.' : error.message)
        return
      }
      const { data: profile } = await supabase.from('profiles').select('onboarding_complete').single()
      router.push(profile?.onboarding_complete ? '/dashboard' : '/onboarding')
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (id: string): React.CSSProperties => ({
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${focused === id ? 'rgba(196,131,74,0.7)' : 'rgba(255,255,255,0.1)'}`,
    background: focused === id ? 'rgba(196,131,74,0.06)' : 'rgba(255,255,255,0.04)',
    fontSize: 14,
    color: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.15s, background 0.15s',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#07060A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', position: 'relative', fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}>
      <AuthBackground />

      <Toaster position="top-center" toastOptions={{
        style: { background: 'rgba(30,24,20,0.95)', color: '#fff', border: '1px solid rgba(196,131,74,0.3)', borderRadius: 10, fontSize: 13, backdropFilter: 'blur(12px)' },
      }} />

      <style>{`
        ::placeholder { color: rgba(255,255,255,0.28) !important; }
        .auth-input:-webkit-autofill,
        .auth-input:-webkit-autofill:hover,
        .auth-input:-webkit-autofill:focus {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0 1000px rgba(15,12,10,0.98) inset;
          caret-color: #ffffff;
        }
        @keyframes auth-card-in {
          from { opacity: 0; transform: translateY(24px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1, animation: 'auth-card-in 0.5s ease both' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-block', marginBottom: 16 }}>
            <JalayuLogo size={48} />
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0, letterSpacing: '0.04em' }}>
            your morning companion
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: 24,
          padding: '32px 28px',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)',
          position: 'relative',
          overflow: 'hidden',
        }}>

          {/* Subtle amber glow top-left */}
          <div style={{ position: 'absolute', top: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(196,131,74,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Welcome back
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 24px', lineHeight: 1.6 }}>
            Sign in to continue your journey
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 7, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Email
              </label>
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                style={inputStyle('email')}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 7, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="auth-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                  style={{ ...inputStyle('password'), paddingRight: 44 }}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px',
                marginTop: 4,
                background: loading
                  ? 'rgba(196,131,74,0.3)'
                  : 'linear-gradient(135deg, #C4834A 0%, #E8AA6A 50%, #C4834A 100%)',
                backgroundSize: '200% 200%',
                color: '#1C1008',
                border: 'none',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'transform 0.15s, box-shadow 0.15s',
                boxShadow: loading ? 'none' : '0 4px 24px rgba(196,131,74,0.4)',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={(e) => { if (!loading) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(196,131,74,0.55)' } }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = loading ? 'none' : '0 4px 24px rgba(196,131,74,0.4)' }}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>NEW HERE?</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
          </div>

          <Link href="/signup" style={{ display: 'block', width: '100%', textAlign: 'center', padding: '12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', transition: 'background 0.15s, border-color 0.15s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(196,131,74,0.35)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)' }}
          >
            Create your account
          </Link>
        </div>

        {/* Back to home */}
        <p style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)')}
          >
            ← Back to Jalayu.com
          </Link>
        </p>
      </div>
    </div>
  )
}
