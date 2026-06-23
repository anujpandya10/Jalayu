'use client'

import { useState, useEffect, useCallback } from 'react'
import { Inbox, Loader2, Check, X, Mail, ChevronDown, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

interface RequestRow {
  id: string
  name: string
  email: string
  answers: {
    role?: string
    interests?: string[]
    why?: string
    referral?: string
  } | null
  status: 'pending' | 'approved' | 'declined'
  decision_note: string | null
  created_at: string
  reviewed_at: string | null
}

type Tab = 'pending' | 'approved' | 'declined'

export default function SignupRequestsView() {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [tab, setTab] = useState<Tab>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/access-request', { cache: 'no-store' })
      if (res.status === 403) { setForbidden(true); return }
      if (res.ok) setRows(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const decide = async (row: RequestRow, decision: 'approved' | 'declined', note?: string) => {
    setBusy(row.id)
    try {
      const res = await fetch('/api/access-request/decide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, decision, note: note ?? null }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed'); return }
      if (decision === 'approved') {
        toast.success(json.invited ? `Invite emailed to ${row.email}` : 'Approved')
        if (json.inviteError) toast.error(`Invite email failed: ${json.inviteError}`)
      } else {
        // Open a prefilled decline email for the owner to send
        const subject = encodeURIComponent('Your Jalayu access request')
        const body = encodeURIComponent(`Hi ${row.name.split(' ')[0] || ''},\n\nThank you for your interest in Jalayu. After review, we're not able to offer access at this time${note ? ` — ${note}` : ''}.\n\nWe genuinely appreciate you reaching out, and wish you the best.\n\n— Jalayu`)
        window.location.href = `mailto:${row.email}?subject=${subject}&body=${body}`
        toast.success('Marked declined — decline email drafted')
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (forbidden) {
    return <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', color: 'var(--text-3)', fontSize: 14 }}>This area is for the account owner only.</div>
  }

  const shown = rows.filter((r) => r.status === tab)
  const counts = {
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    declined: rows.filter((r) => r.status === 'declined').length,
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 20px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Inbox size={20} color="var(--accent)" />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Sign-up requests</h1>
        {loading && <Loader2 size={14} className="animate-spin" color="var(--text-3)" />}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 18px' }}>
        Review who wants in. Approve to email them an invite link; decline to draft a polite note.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['pending', 'approved', 'declined'] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
              background: tab === t ? 'var(--accent)' : 'var(--morning)', color: tab === t ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)' }}>
            {t} ({counts[t]})
          </button>
        ))}
      </div>

      {shown.length === 0 && !loading && (
        <div style={{ padding: 28, textAlign: 'center', borderRadius: 12, border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13 }}>
          No {tab} requests.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.map((row) => {
          const open = expanded === row.id
          const a = row.answers ?? {}
          return (
            <div key={row.id} style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
              <button type="button" onClick={() => setExpanded(open ? null : row.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                {open ? <ChevronDown size={15} color="var(--text-3)" /> : <ChevronRight size={15} color="var(--text-3)" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.email}{a.role ? ` · ${a.role}` : ''}</div>
                </div>
                <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{new Date(row.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              </button>

              {open && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                  {a.why && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Why they want in</div>
                      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.why}</p>
                    </div>
                  )}
                  {a.interests && a.interests.length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {a.interests.map((i) => <span key={i} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'var(--morning)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>{i}</span>)}
                    </div>
                  )}
                  {a.referral && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>Heard via: {a.referral}</div>}
                  {row.decision_note && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>Note: {row.decision_note}</div>}

                  {row.status === 'pending' ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                      <button type="button" disabled={busy === row.id} onClick={() => void decide(row, 'approved')}
                        style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', background: '#16A34A', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {busy === row.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />} Approve & invite
                      </button>
                      <button type="button" disabled={busy === row.id} onClick={() => { const note = window.prompt('Optional reason for declining (used in the email):') ?? undefined; void decide(row, 'declined', note) }}
                        style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <X size={14} /> Decline
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: row.status === 'approved' ? '#15803d' : '#b91c1c' }}>
                        {row.status === 'approved' ? '✓ Approved' : '✕ Declined'}
                        {row.reviewed_at ? ` · ${new Date(row.reviewed_at).toLocaleDateString()}` : ''}
                      </span>
                      <a href={`mailto:${row.email}`} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                        <Mail size={12} /> Email
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
