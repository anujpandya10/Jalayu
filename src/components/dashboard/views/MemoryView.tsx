'use client'

import { useState, useMemo, useEffect } from 'react'
import { Loader2, Search, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Note, Reflection } from '@/lib/types'

type TimelineItem =
  | { kind: 'note'; id: string; at: string; title: string; body: string }
  | { kind: 'reflection'; id: string; at: string; title: string; body: string }

export default function MemoryView({
  notes,
  reflections,
  todayReflection,
  name,
  onSaveNote,
  onSaveReflection,
}: {
  notes: Note[]
  reflections: Reflection[]
  todayReflection: Reflection | null
  name: string
  onSaveNote: (content: string) => Promise<void>
  onSaveReflection: (data: { one_word: string; win_of_day: string; tomorrow_note: string }) => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [content, setContent] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const [oneWord, setOneWord] = useState(todayReflection?.one_word || '')
  const [winOfDay, setWinOfDay] = useState(todayReflection?.win_of_day || '')
  const [tomorrowNote, setTomorrowNote] = useState(todayReflection?.tomorrow_note || '')
  const [savingReflection, setSavingReflection] = useState(false)

  useEffect(() => {
    setOneWord(todayReflection?.one_word || '')
    setWinOfDay(todayReflection?.win_of_day || '')
    setTomorrowNote(todayReflection?.tomorrow_note || '')
  }, [todayReflection])

  const alreadySaved = !!todayReflection
  const hasReflectionChanges =
    oneWord !== (todayReflection?.one_word || '') ||
    winOfDay !== (todayReflection?.win_of_day || '') ||
    tomorrowNote !== (todayReflection?.tomorrow_note || '')

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

  const handleSaveNote = async () => {
    if (!content.trim()) return
    setSavingNote(true)
    await onSaveNote(content.trim())
    setContent('')
    setSavingNote(false)
  }

  const handleSaveReflection = async () => {
    if (!oneWord.trim() && !winOfDay.trim() && !tomorrowNote.trim()) {
      toast.error('Fill in at least one field')
      return
    }
    setSavingReflection(true)
    await onSaveReflection({
      one_word: oneWord.trim(),
      win_of_day: winOfDay.trim(),
      tomorrow_note: tomorrowNote.trim(),
    })
    setSavingReflection(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, outline: 'none',
    background: 'transparent', border: 'none', color: 'var(--text)',
  }

  return (
    <div className="memory-view" style={{ padding: '16px 14px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Memory</h2>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 16px' }}>
        Reflect on your day, capture thoughts, and browse your life archive.
      </p>

      {/* Today's reflection */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Sparkles size={14} color="var(--accent)" />
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Today&apos;s reflection</h3>
        </div>

        {alreadySaved && !hasReflectionChanges && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
              background: 'var(--success-bg)', border: '1px solid var(--border-2)', marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--success-text)' }}>Saved for today ✦</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          <div className="card">
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--accent)', marginBottom: 6 }}>One word for today</label>
            <input
              type="text"
              value={oneWord}
              onChange={(e) => setOneWord(e.target.value)}
              placeholder="e.g. Focused, chaotic, grateful…"
              style={inputStyle}
            />
          </div>
          <div className="card">
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--accent)', marginBottom: 6 }}>Win of the day</label>
            <input
              type="text"
              value={winOfDay}
              onChange={(e) => setWinOfDay(e.target.value)}
              placeholder="Even the smallest thing counts…"
              style={inputStyle}
            />
          </div>
          <div className="card">
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--accent)', marginBottom: 6 }}>What does tomorrow-you need to know?</label>
            <textarea
              value={tomorrowNote}
              onChange={(e) => setTomorrowNote(e.target.value)}
              placeholder="A reminder, a priority, something to carry forward…"
              rows={2}
              style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveReflection}
          disabled={savingReflection}
          style={{
            width: '100%', padding: '11px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 500,
            cursor: savingReflection ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {savingReflection && <Loader2 size={13} className="animate-spin" />}
          {alreadySaved ? 'Update reflection ✦' : 'Save reflection ✦'}
        </button>
      </section>

      {/* Quick capture */}
      <section style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>Quick capture</h3>
        <div className="card">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`Anything on your mind, ${name}…`}
            rows={3}
            style={{
              width: '100%', fontSize: 13, resize: 'none', outline: 'none',
              background: 'transparent', border: 'none', color: 'var(--text)', lineHeight: 1.7,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
            <button
              type="button"
              onClick={handleSaveNote}
              disabled={savingNote || !content.trim()}
              style={{
                padding: '7px 14px',
                background: content.trim() ? 'var(--accent)' : 'var(--border)',
                color: content.trim() ? '#fff' : 'var(--text-2)',
                border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500,
                cursor: content.trim() && !savingNote ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {savingNote && <Loader2 size={12} className="animate-spin" />}
              Save note
            </button>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>Your archive</h3>
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

        {timeline.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', padding: '24px 8px' }}>
            {q ? 'No matches — try another word.' : 'Your timeline fills as you reflect and save notes.'}
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
      </section>
    </div>
  )
}
