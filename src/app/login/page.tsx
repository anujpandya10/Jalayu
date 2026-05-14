'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import toast, { Toaster } from 'react-hot-toast'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
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
    padding: '11px 14px',
    borderRadius: 10,
    border: `1px solid ${focusedField === id ? 'var(--accent)' : 'var(--border)'}`,
    background: 'var(--surface-2)',
    fontSize: 13,
    color: 'var(--text)',
    outline: 'none',
    transition: 'border-color 0.15s',
    fontFamily: 'inherit',
  })

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--bg)',
      }}
    >
      <Toaster
        position="top-center"
        toastOptions={{ style: { borderRadius: 10, fontSize: 13 } }}
      />

      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 600,
              color: 'var(--text)',
              margin: '0 0 4px',
              letterSpacing: '-0.02em',
            }}
          >
            Jalayu
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
            Your morning companion
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 16,
            padding: 28,
            border: '1px solid var(--border)',
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 4, marginTop: 0 }}>
            Welcome back
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, marginTop: 0 }}>
            Sign in to continue your journey
          </p>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                style={inputStyle('email')}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                  style={{ ...inputStyle('password'), paddingRight: 40 }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
                    display: 'flex', alignItems: 'center',
                  }}
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
                padding: '12px',
                background: loading ? 'var(--border-2)' : 'var(--accent)',
                color: 'var(--accent-fg)',
                border: 'none',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'background 0.15s',
              }}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Sign in
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-2)', marginTop: 16, marginBottom: 0 }}>
            New here?{' '}
            <Link href="/signup" style={{ color: 'var(--text)', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Create your account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
