'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import toast, { Toaster } from 'react-hot-toast'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const router = useRouter()

  const inputStyle = (id: string): React.CSSProperties => ({
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    border: `1px solid ${focusedField === id ? '#534AB7' : '#E5E3FF'}`,
    background: '#FAFAFA',
    fontSize: 13,
    color: '#111827',
    outline: 'none',
    transition: 'border-color 0.15s',
  })

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email || !password) { toast.error('Please fill in all fields'); return }
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return }

    const supabase = createClient()
    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() } },
      })
      if (error) {
        toast.error(error.message.includes('already') ? 'This email is already registered. Try signing in.' : error.message)
        return
      }
      router.push('/onboarding')
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'linear-gradient(135deg, #F5F4FF 0%, #EEF2FF 100%)',
      }}
    >
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: 10, fontSize: 13 } }} />

      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 16, background: '#534AB7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px', fontSize: 22, color: '#fff',
            }}
          >
            ✦
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: '#26215C', margin: 0 }}>Jalayu</h1>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 28, border: '0.5px solid #E5E3FF' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 4, marginTop: 0 }}>
            Begin your journey
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, marginTop: 0 }}>
            This will be the most personal account you&apos;ve ever made
          </p>

          <form onSubmit={handleSignup}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                What should Jalayu call you?
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name or nickname"
                required
                autoComplete="name"
                style={inputStyle('name')}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
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
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  style={{ ...inputStyle('password'), paddingRight: 40 }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF',
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
                width: '100%', padding: '12px',
                background: loading ? '#9b94d4' : '#534AB7',
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 13, fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Begin my Jalayu journey
            </button>
          </form>

          {/* Privacy */}
          <div
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: '#EAF3DE', borderRadius: 8, padding: '9px 11px',
              marginTop: 14,
            }}
          >
            <ShieldCheck size={13} color="#27500A" style={{ marginTop: 1, flexShrink: 0 }} />
            <p style={{ fontSize: 11, color: '#27500A', margin: 0, lineHeight: 1.5 }}>
              Your data belongs to you. Always private. Never sold.
            </p>
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginTop: 14, marginBottom: 0 }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#534AB7', fontWeight: 500 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
