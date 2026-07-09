'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageCircle, Loader2, Send, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { isOwnerEmail } from '@/lib/owner'
import { useStore } from '@/store/useStore'

interface FeedbackRow {
  id: string
  category: 'general' | 'bug' | 'feature' | 'support'
  message: string
  status: 'open' | 'replied' | 'closed'
  admin_reply: string | null
  replied_at: string | null
  created_at: string
}

interface AdminFeedbackRow extends FeedbackRow {
  email: string
}

const CATEGORIES: { id: FeedbackRow['category']; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'bug', label: 'Bug' },
  { id: 'feature', label: 'Feature request' },
  { id: 'support', label: 'I need help' },
]

export default function FeedbackView() {
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((d) => setAuthEmail(d?.auth_email ?? null)).catch(() => {})
  }, [])
  const owner = isOwnerEmail(authEmail)

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 20px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <MessageCircle size={20} color="var(--accent)" />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Feedback & support</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 18px' }}>
        Tell us what&apos;s broken, missing, or on your mind — we read every one.
      </p>

      {owner && <AdminInbox />}
      <UserThread />
    </div>
  )
}

// ── The regular user's own submit form + reply thread ──────────────────────
function UserThread() {
  const { feedbackPrefill, setFeedbackPrefill } = useStore()
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<FeedbackRow['category']>('general')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback', { cache: 'no-store' })
      if (res.ok) setRows(await res.json())
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  // Hand-off from the premium-lock dialog: pre-select the category + message, then clear the
  // hand-off so it doesn't re-apply on the next visit or clobber the user's own edits.
  useEffect(() => {
    if (!feedbackPrefill) return
    const cats = ['general', 'bug', 'feature', 'support'] as const
    if (cats.includes(feedbackPrefill.category as typeof cats[number])) setCategory(feedbackPrefill.category as FeedbackRow['category'])
    if (feedbackPrefill.message) setMessage(feedbackPrefill.message)
    setFeedbackPrefill(null)
  }, [feedbackPrefill, setFeedbackPrefill])

  const submit = async () => {
    if (!message.trim()) { toast.error('Say a bit more first'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message: message.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not send'); return }
      toast.success('Sent — thank you')
      setMessage('')
      await load()
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
          Send feedback
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => setCategory(c.id)}
              style={{ padding: '5px 11px', fontSize: 12, fontWeight: 600, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                background: category === c.id ? 'var(--accent)' : 'var(--morning)', color: category === c.id ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)' }}>
              {c.label}
            </button>
          ))}
        </div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
          placeholder="What's on your mind?"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-2)', fontSize: 14, outline: 'none', color: 'var(--text)', background: 'var(--surface-2)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
        <button type="button" onClick={() => void submit()} disabled={saving}
          style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
        </button>
      </div>

      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
        Your history
      </p>
      {loading ? (
        <Loader2 size={16} className="animate-spin" color="var(--text-3)" />
      ) : rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', borderRadius: 12, border: '1px dashed var(--border)', color: 'var(--text-3)', fontSize: 13 }}>
          Nothing sent yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--morning)', color: 'var(--text-2)' }}>
                  {CATEGORIES.find((c) => c.id === r.category)?.label ?? r.category}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--text-3)', marginLeft: 'auto' }}>{new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{r.message}</p>
              {r.admin_reply && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--morning)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Reply</div>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{r.admin_reply}</p>
                </div>
              )}
              {r.status === 'open' && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>Waiting on a reply.</div>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Owner-only: every user's open/replied feedback, with a reply box ───────
function AdminInbox() {
  const [rows, setRows] = useState<AdminFeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/feedback/admin', { cache: 'no-store' })
      if (res.ok) setRows(await res.json())
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const open = rows.filter((r) => r.status === 'open')

  const reply = async (row: AdminFeedbackRow) => {
    if (!replyDraft.trim()) { toast.error('Write a reply first'); return }
    setBusy(row.id)
    try {
      const res = await fetch('/api/feedback/admin', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, reply: replyDraft.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not reply'); return }
      toast.success('Replied')
      setReplyDraft('')
      setExpanded(null)
      await load()
    } finally { setBusy(null) }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ShieldCheck size={15} color="var(--text)" />
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          Owner inbox — {open.length} open
        </p>
        {loading && <Loader2 size={12} className="animate-spin" color="var(--text-3)" />}
      </div>
      {open.length === 0 && !loading ? (
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '8px 0 0' }}>Nothing waiting on a reply.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {open.map((r) => {
            const isOpen = expanded === r.id
            return (
              <div key={r.id} style={{ border: '1px solid var(--border-2)', borderRadius: 10, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <button type="button" onClick={() => { setExpanded(isOpen ? null : r.id); setReplyDraft('') }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  {isOpen ? <ChevronDown size={13} color="var(--text-3)" /> : <ChevronRight size={13} color="var(--text-3)" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{r.email} · {r.category}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.message}</div>
                  </div>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 12px 12px' }}>
                    <p style={{ fontSize: 12.5, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{r.message}</p>
                    <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} rows={3} placeholder="Your reply…"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, outline: 'none', color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                    <button type="button" onClick={() => void reply(r)} disabled={busy === r.id}
                      style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: busy === r.id ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                      {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Reply
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
