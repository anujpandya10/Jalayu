'use client'

import { useState } from 'react'
import { Check, Loader2, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import { RISK_PROFILES, type RiskTier } from '@/lib/risk-profiles'
import type { Profile } from '@/lib/types'

/**
 * Freely changeable risk-tier switcher — only shown once the user has actually
 * engaged with trading (accepted the disclaimer at least once). Changing tiers
 * is forward-looking only: it takes effect on the next tick/order, never
 * retroactively touches a position that's already open.
 */
export default function RiskProfileSettings() {
  const { profile, setProfile } = useStore()
  const [saving, setSaving] = useState(false)
  if (!profile?.trading_disclaimer_accepted_at) return null

  const currentTier = (profile.risk_profile ?? 'balanced') as RiskTier

  const setTier = async (tier: RiskTier) => {
    if (tier === currentTier || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ risk_profile: tier }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not save'); return }
      if (json.profile) setProfile(json.profile as Profile)
      toast.success(`Switched to ${RISK_PROFILES[tier].label} — takes effect on your next trade/tick`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <TrendingUp size={16} color="var(--text)" />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Trading risk profile</h3>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.55 }}>
        Applies to Trading, Academy, and Auto Trader. Change anytime — an already-open position keeps the stop/target it was given at entry.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.values(RISK_PROFILES).map((p) => {
          const selected = p.tier === currentTier
          return (
            <button
              key={p.tier}
              type="button"
              onClick={() => void setTier(p.tier)}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                padding: '11px 13px', borderRadius: 10, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
                background: selected ? 'var(--morning)' : 'var(--surface)',
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                width: '100%',
              }}
            >
              <span style={{
                width: 18, height: 18, flexShrink: 0, borderRadius: 99,
                border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border-2)'}`,
                background: selected ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected ? <Check size={12} color="#fff" /> : saving ? <Loader2 size={10} className="animate-spin" /> : null}
              </span>
              <span>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.4 }}>{p.tagline}</div>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
