'use client'

import { useState, useEffect } from 'react'
import { Loader2, User } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Profile } from '@/lib/types'
import { useStore } from '@/store/useStore'
import ConnectAgent from '@/components/dashboard/views/ConnectAgent'

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-2)',
  marginBottom: 5,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border-2)',
  fontSize: 16,
  outline: 'none',
  color: 'var(--text)',
  background: 'var(--surface-2)',
  boxSizing: 'border-box',
}

export default function SettingsView() {
  const { profile, setProfile } = useStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [authEmail, setAuthEmail] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('US')

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.profile) return
        const p = data.profile as Profile
        setProfile(p)
        setAuthEmail(data.auth_email ?? null)
        setFullName(p.full_name ?? '')
        setNickname(p.nickname ?? '')
        setPhone(p.phone ?? '')
        setContactEmail(p.contact_email ?? data.auth_email ?? '')
        setAddress1(p.address_line1 ?? '')
        setAddress2(p.address_line2 ?? '')
        setCity(p.city ?? '')
        setState(p.state ?? '')
        setPostalCode(p.postal_code ?? '')
        setCountry(p.country ?? 'US')
      })
      .catch(() => toast.error('Could not load profile'))
      .finally(() => setLoading(false))
  }, [setProfile])

  useEffect(() => {
    if (!profile || loading) return
    setFullName(profile.full_name ?? '')
    setNickname(profile.nickname ?? '')
    setPhone(profile.phone ?? '')
    setContactEmail(profile.contact_email ?? authEmail ?? '')
    setAddress1(profile.address_line1 ?? '')
    setAddress2(profile.address_line2 ?? '')
    setCity(profile.city ?? '')
    setState(profile.state ?? '')
    setPostalCode(profile.postal_code ?? '')
    setCountry(profile.country ?? 'US')
  }, [profile, loading, authEmail])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          nickname,
          phone,
          contact_email: contactEmail,
          address_line1: address1,
          address_line2: address2,
          city,
          state,
          postal_code: postalCode,
          country,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.profile) {
        toast.error(data.error ?? 'Could not save')
        return
      }
      setProfile(data.profile as Profile)
      toast.success('Profile saved ✦ Jalayu will use this in chat')
    } catch {
      toast.error('Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
        <Loader2 size={22} className="animate-spin" color="var(--accent)" />
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '16px max(14px, env(safe-area-inset-right)) 24px max(14px, env(safe-area-inset-left))',
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <User size={20} color="var(--accent)" />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Your profile</h2>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 18px', lineHeight: 1.5 }}>
        Jalayu uses this when you ask about appointments, contacts, or anything personal — so answers match your real details.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ConnectAgent />
        <section className="card">
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            Identity
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={labelStyle}>Full name</label>
              <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Anuj Pandya" autoComplete="name" />
            </div>
            <div>
              <label style={labelStyle}>What should Jalayu call you?</label>
              <input style={inputStyle} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Nickname" autoComplete="nickname" />
            </div>
          </div>
        </section>

        <section className="card">
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            Contact
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" autoComplete="tel" />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder={authEmail ?? 'you@email.com'} autoComplete="email" />
              {authEmail && contactEmail !== authEmail && (
                <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>Login email: {authEmail}</p>
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            Address
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={labelStyle}>Street</label>
              <input style={inputStyle} value={address1} onChange={(e) => setAddress1(e.target.value)} placeholder="123 Main St" autoComplete="address-line1" />
            </div>
            <div>
              <label style={labelStyle}>Apt / suite (optional)</label>
              <input style={inputStyle} value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="Apt 4B" autoComplete="address-line2" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>City</label>
                <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input style={inputStyle} value={state} onChange={(e) => setState(e.target.value)} autoComplete="address-level1" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>ZIP</label>
                <input style={inputStyle} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} autoComplete="postal-code" />
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <input style={inputStyle} value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" />
              </div>
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '13px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save profile
        </button>
      </div>
    </div>
  )
}
