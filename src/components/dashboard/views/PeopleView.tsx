'use client'

import { useState } from 'react'
import { Loader2, Users } from 'lucide-react'
import type { Note } from '@/lib/types'

function isPeopleNote(n: Note) {
  if (n.type === 'people') return true
  return n.tags?.includes('people') ?? false
}

export default function PeopleView({
  notes,
  name,
  onSavePeopleNote,
}: {
  notes: Note[]
  name: string
  onSavePeopleNote: (content: string) => Promise<void>
}) {
  const [focus, setFocus] = useState('')
  const [saving, setSaving] = useState(false)
  const peopleNotes = notes.filter(isPeopleNote).slice(0, 12)

  const handleSave = async () => {
    if (!focus.trim()) return
    setSaving(true)
    await onSavePeopleNote(focus.trim())
    setFocus('')
    setSaving(false)
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Users size={20} color="var(--accent)" />
        People
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 14px' }}>
        Who matters this week? Check in notes, birthdays, hard conversations — kept private.
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)', display: 'block', marginBottom: 6 }}>Who is on your heart?</label>
        <textarea
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder={`Names, moments, something to follow up on — ${name}`}
          rows={4}
          style={{
            width: '100%', fontSize: 13, resize: 'none', outline: 'none',
            background: 'transparent', border: 'none', color: 'var(--text)', lineHeight: 1.7,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !focus.trim()}
            style={{
              padding: '7px 14px',
              background: focus.trim() ? 'var(--accent)' : 'var(--border)',
              color: focus.trim() ? '#fff' : 'var(--text-2)',
              border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500,
              cursor: focus.trim() && !saving ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>

      {peopleNotes.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 8 }}>Recent</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {peopleNotes.map((n) => (
              <div key={n.id} className="card">
                <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>{n.content}</p>
                <p style={{ fontSize: 10, color: 'var(--text-2)', margin: '8px 0 0' }}>
                  {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
