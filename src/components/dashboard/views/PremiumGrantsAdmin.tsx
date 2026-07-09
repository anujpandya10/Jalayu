'use client'

import { useState, useEffect } from 'react'
import { Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { MODULE_REGISTRY } from '@/lib/modules-registry'

const PREMIUM_MODULES = MODULE_REGISTRY.filter((m) => m.tier === 'premium')

interface Grant {
  user_id: string
  email: string
  module_id: string
  granted_at: string
  note: string | null
}

/** Owner-only. Manual (non-Stripe) grants of premium modules to a specific user by email. */
export default function PremiumGrantsAdmin() {
  const [grants, setGrants] = useState<Grant[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [moduleId, setModuleId] = useState<string>(PREMIUM_MODULES[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/premium-grants', { cache: 'no-store' })
      if (res.ok) setGrants(await res.json())
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const grant = async () => {
    if (!email.trim() || !moduleId) { toast.error('Enter an email and pick a module'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/premium-grants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), moduleId, note: note.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not grant access'); return }
      toast.success(`Granted ${moduleId} to ${email.trim()}`)
      setEmail(''); setNote('')
      await load()
    } finally { setBusy(false) }
  }

  const revoke = async (g: Grant) => {
    if (!confirm(`Revoke ${g.module_id} from ${g.email}?`)) return
    setBusy(true)
    try {
      await fetch('/api/admin/premium-grants', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: g.email, moduleId: g.module_id }),
      })
      await load()
      toast.success('Revoked')
    } finally { setBusy(false) }
  }

  return (
    <section className="card">
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
        Owner only
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <ShieldCheck size={16} color="var(--text)" />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Premium grants</h3>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.55 }}>
        No billing yet — grant a specific person access to a premium module (Trading, Academy, Vault, Health) by email.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@email.com"
          style={{ padding: '9px 11px', fontSize: 13, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}
            style={{ flex: 1, padding: '9px 11px', fontSize: 13, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }}>
            {PREMIUM_MODULES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <button type="button" onClick={() => void grant()} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : null} Grant
          </button>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) — e.g. beta tester"
          style={{ padding: '8px 11px', fontSize: 12, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }} />
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading…</div>
      ) : grants.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No premium grants yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {grants.map((g) => (
            <div key={`${g.user_id}-${g.module_id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border-2)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{g.email}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {MODULE_REGISTRY.find((m) => m.id === g.module_id)?.label ?? g.module_id}{g.note ? ` · ${g.note}` : ''}
                </div>
              </div>
              <button type="button" onClick={() => void revoke(g)} disabled={busy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                <Trash2 size={11} /> Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
