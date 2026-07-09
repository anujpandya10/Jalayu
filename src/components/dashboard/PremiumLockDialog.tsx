'use client'

import { Lock, X } from 'lucide-react'
import { useStore } from '@/store/useStore'

/**
 * The premium-lock modal — replaces the old dead-end toast. When a locked
 * premium nav item is clicked, this opens with a real next step: "Request
 * access" hands off to the Feedback view with the module + intent pre-filled,
 * so the user lands somewhere actionable instead of a message that goes nowhere.
 * Rendered once, globally (dashboard layout), driven by store.premiumLockPrompt.
 */
export default function PremiumLockDialog() {
  const { premiumLockPrompt, setPremiumLockPrompt, setSidebarView, setFeedbackPrefill } = useStore()
  if (!premiumLockPrompt) return null
  const { label } = premiumLockPrompt

  const close = () => setPremiumLockPrompt(null)
  const requestAccess = () => {
    setFeedbackPrefill({
      category: 'support',
      message: `I'd like to keep using ${label}. My free trial has ended — can I get continued access?`,
    })
    setSidebarView('feedback')
    setPremiumLockPrompt(null)
  }

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(28,25,23,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, background: 'var(--surface)', borderRadius: 16,
          border: '1px solid var(--border)', padding: 22, boxShadow: '0 12px 40px rgba(28,25,23,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, background: 'var(--morning)' }}>
              <Lock size={16} color="var(--accent)" />
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{label} is premium</h3>
          </div>
          <button type="button" onClick={close} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 18px' }}>
          Premium modules — Trading, Academy, Vault, and Health — come with a free 7-day trial.
          Yours has ended. Paid plans are coming soon; in the meantime you can request continued
          access and we&apos;ll set you up.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={requestAccess}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Request access
          </button>
          <button type="button" onClick={close}
            style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
