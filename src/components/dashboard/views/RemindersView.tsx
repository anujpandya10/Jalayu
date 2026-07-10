'use client'

import { useMemo, useState } from 'react'
import { Bell, Loader2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { todayString } from '@/lib/utils'
import type { Reminder } from '@/lib/types'

async function getSupabase() {
  const { createClient } = await import('@/lib/supabase')
  return createClient()
}

function formatReminderTime(remindAt: string) {
  const d = new Date(remindAt)
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  const parts = String(remindAt).split(':')
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
  return String(remindAt)
}

export default function RemindersView({
  reminders,
  onAdded,
  onUpdated,
}: {
  reminders: Reminder[]
  onAdded: (r: Reminder) => void
  onUpdated: (id: string, updates: Partial<Reminder>) => void
}) {
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('09:00')
  const [saving, setSaving] = useState(false)

  const sorted = useMemo(() => {
    return [...reminders].sort((a, b) => {
      const ta = new Date(a.remind_at).getTime()
      const tb = new Date(b.remind_at).getTime()
      const aOk = !Number.isNaN(ta)
      const bOk = !Number.isNaN(tb)
      if (aOk && bOk) return ta - tb
      return String(a.remind_at).localeCompare(String(b.remind_at))
    })
  }, [reminders])

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Give it a short title')
      return
    }
    setSaving(true)
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const [hh, mm] = time.split(':').map((x) => parseInt(x, 10))
    const day = todayString()
    const local = new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}:00`)
    const { data, error } = await supabase.from('reminders').insert({
      user_id: user.id,
      title: title.trim(),
      remind_at: local.toISOString(),
      is_active: true,
    }).select().single()
    setSaving(false)
    if (error || !data) {
      toast.error('Could not save reminder')
      return
    }
    onAdded(data as Reminder)
    setTitle('')
    toast.success('Reminder saved')
  }

  const toggleActive = async (r: Reminder) => {
    const supabase = await getSupabase()
    const next = !r.is_active
    const { error } = await supabase.from('reminders').update({ is_active: next }).eq('id', r.id)
    if (!error) onUpdated(r.id, { is_active: next })
  }

  const active = sorted.filter((r) => r.is_active)
  const paused = sorted.filter((r) => !r.is_active)

  return (
    <div style={{ padding: '16px 14px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={20} color="var(--accent)" />
          Reminders
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 0' }}>Nudges at the time you pick</p>
      </div>

      <div className="card" style={{ marginBottom: 14, padding: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)', margin: '0 0 8px' }}>New reminder</p>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What should we remember?"
          style={{
            width: '100%', fontSize: 13, padding: '10px 12px', borderRadius: 8,
            border: '0.5px solid var(--border-2)', marginBottom: 8, outline: 'none', color: 'var(--text)',
            background: 'var(--surface-2)',
          }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            style={{
              fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '0.5px solid var(--border-2)',
              background: 'var(--surface-2)', color: 'var(--text)',
            }}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
        </div>
      </div>

      {active.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Active</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {active.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleActive(r)}
                style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 10,
                  border: '0.5px solid var(--border-2)', background: 'var(--surface)', cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{r.title}</div>
                <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>{formatReminderTime(String(r.remind_at))}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6 }}>Tap to pause</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {paused.length > 0 && (
        <section>
          <p style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Paused</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paused.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleActive(r)}
                style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 10,
                  border: '0.5px dashed var(--border-2)', background: 'var(--surface-2)', cursor: 'pointer', opacity: 0.85,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>{r.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6 }}>Tap to turn back on</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {reminders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 12px' }}>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0 }}>No reminders yet. Add one above — Jalayu will grow with you.</p>
        </div>
      )}
    </div>
  )
}
