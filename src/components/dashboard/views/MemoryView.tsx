'use client'

import { useState, useMemo } from 'react'
import { Loader2, Search } from 'lucide-react'
import type { Note, Reflection } from '@/lib/types'

type TimelineItem =
  | { kind: 'note'; id: string; at: string; title: string; body: string }
  | { kind: 'reflection'; id: string; at: string; title: string; body: string }

export default function MemoryView({
  notes,
  reflections,
  name,
  onSaveNote,
}: {
  notes: Note[]
  reflections: Reflection[]
  name: string
  onSaveNote: (content: string) => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [
      ...notes.map((n) => ({
        kind: 'note' as const,
        id: n.id,
        at: n.created_at,
        title: n.type === 'note' ? 'Note' : n.type,
        body: n.content,
      })),
      ...reflections.map((r) => ({
        kind: 'reflection' as const,
        id: r.id,
        at: `${r.date}T12:00:00`,
        title: 'Reflection',
        body: [r.one_word && `Word: ${r.one_word}`, r.win_of_day && `Win: ${r.win_of_day}`, r.tomorrow_note && `Tomorrow: ${r.tomorrow_note}`]
          .filter(Boolean)
          .join(' · '),
      })),
    ]
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((i) => i.body.toLowerCase().includes(needle) || i.title.toLowerCase().includes(needle))
  }, [notes, reflections, q])

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    await onSaveNote(content.trim())
    setContent('')
    setSaving(false)
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Memory</h2>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 14px' }}>Search everything you&apos;ve saved and reflected on.</p>

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={14} color="var(--text-2)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search memory…"
          style={{
            width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10,
            border: '0.5px solid var(--border-2)', fontSize: 13, outline: 'none', color: 'var(--text)',
            background: 'var(--surface-2)',
          }}
        />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`Quick capture, ${name}…`}
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
            disabled={saving || !content.trim()}
            style={{
              padding: '7px 14px',
              background: content.trim() ? 'var(--accent)' : 'var(--border)',
              color: content.trim() ? '#fff' : 'var(--text-2)',
              border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500,
              cursor: content.trim() && !saving ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save to memory
          </button>
        </div>
      </div>

      {timeline.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', padding: '32px 8px' }}>
          {q ? 'No matches — try another word.' : 'Your timeline will fill as you save notes and reflections.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {timeline.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>{item.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
                  {new Date(item.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
                {item.body.length > 280 ? `${item.body.slice(0, 280)}…` : item.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
