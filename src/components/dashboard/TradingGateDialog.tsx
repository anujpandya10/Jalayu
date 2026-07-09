'use client'

import { useState } from 'react'
import { Check, Loader2, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import { RISK_PROFILES, type RiskTier } from '@/lib/risk-profiles'
import type { Profile } from '@/lib/types'

/**
 * One-time gate before a user's first real action in Trading, Academy, or
 * Auto Trader: a plain-English disclaimer (paper money, not advice) plus the
 * Cautious/Balanced/Aggressive risk-tier picker, in a single flow. Global,
 * store-driven (store.tradingGatePrompt), mirrors PremiumLockDialog's "real
 * modal with a real next step" pattern — accepting runs the action that was
 * waiting on it, so nothing dead-ends.
 */
export default function TradingGateDialog() {
  const { tradingGatePrompt, setTradingGatePrompt, setProfile } = useStore()
  const [tier, setTier] = useState<RiskTier>('balanced')
  const [busy, setBusy] = useState(false)

  if (!tradingGatePrompt) return null
  const { onAccept } = tradingGatePrompt

  const close = () => setTradingGatePrompt(null)

  const accept = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/trading/accept-disclaimer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riskProfile: tier }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not save'); return }
      if (json.profile) setProfile(json.profile as Profile)
      setTradingGatePrompt(null)
      onAccept()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(28,25,23,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        backdropFilter: 'blur(2px)', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, background: 'var(--surface)', borderRadius: 16,
          border: '1px solid var(--border)', padding: 22, boxShadow: '0 12px 40px rgba(28,25,23,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: 'var(--morning)', flexShrink: 0 }}>
            <ShieldAlert size={16} color="var(--accent)" />
          </span>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Before you trade</h3>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ margin: 0 }}>This is simulated paper trading — every account here runs on fake money, never real capital.</p>
          <p style={{ margin: 0 }}>Past performance of any setup or bot is not a guarantee of future results, and you&apos;re responsible for reviewing what it does.</p>
        </div>

        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
          Pick your risk posture
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {Object.values(RISK_PROFILES).map((p) => {
            const selected = tier === p.tier
            return (
              <button
                key={p.tier}
                type="button"
                onClick={() => setTier(p.tier)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  padding: '11px 13px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
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
                  {selected && <Check size={12} color="#fff" />}
                </span>
                <span>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.4 }}>{p.tagline}</div>
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => void accept()} disabled={busy}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            {busy && <Loader2 size={13} className="animate-spin" />} I understand — continue
          </button>
          <button type="button" onClick={close} disabled={busy}
            style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
