'use client'

import { useState, useMemo, useEffect } from 'react'
import { Loader2, BookMarked } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Note } from '@/lib/types'

function isLearningNote(n: Note) {
  if (n.type === 'learning') return true
  return n.tags?.includes('learning') ?? false
}

type Track = { id: string; title: string; description: string; days: number }

export default function LearningView({
  notes,
  name,
  onSaveLearning,
}: {
  notes: Note[]
  name: string
  onSaveLearning: (content: string) => Promise<void>
}) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [tracks, setTracks] = useState<Track[]>([])
  const [enrolling, setEnrolling] = useState<string | null>(null)
  const learningNotes = useMemo(() => notes.filter(isLearningNote).slice(0, 20), [notes])

  useEffect(() => {
    fetch('/data/learning-tracks.json')
      .then((r) => r.json())
      .then((d) => setTracks(Array.isArray(d) ? d : []))
      .catch(() => setTracks([]))
  }, [])

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    await onSaveLearning(content.trim())
    setContent('')
    setSaving(false)
  }

  const enroll = async (id: string) => {
    setEnrolling(id)
    try {
      const res = await fetch('/api/learning/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      toast.success(`Track started — ${j.tasksCreated || 0} tasks added for today`)
    } catch {
      toast.error('Could not start track')
    } finally {
      setEnrolling(null)
    }
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <BookMarked size={20} color="#534AB7" />
        Learning
      </h2>
      <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 14px' }}>Prebuilt tracks add today&apos;s tasks; your saves stay in this list.</p>

      {tracks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {tracks.map((t) => (
            <div key={t.id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>{t.title}</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{t.description}</p>
              </div>
              <button
                type="button"
                onClick={() => enroll(t.id)}
                disabled={enrolling === t.id}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#534AB7',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: enrolling === t.id ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {enrolling === t.id && <Loader2 size={14} className="animate-spin" />}
                Start
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`What do you want to learn or read, ${name}?`}
          rows={4}
          style={{
            width: '100%', fontSize: 13, resize: 'none', outline: 'none',
            background: 'transparent', border: 'none', color: '#374151', lineHeight: 1.7,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #F3F4F6' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !content.trim()}
            style={{
              padding: '7px 14px',
              background: content.trim() ? '#534AB7' : '#E5E3FF',
              color: content.trim() ? '#fff' : '#9CA3AF',
              border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500,
              cursor: content.trim() && !saving ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save for later
          </button>
        </div>
      </div>

      {learningNotes.length === 0 ? (
        <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', padding: '24px 8px' }}>Nothing saved yet. Paste a link or a sentence above.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {learningNotes.map((note) => (
            <div key={note.id} className="card">
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{note.content}</p>
              <p style={{ fontSize: 10, color: '#9CA3AF', margin: '8px 0 0' }}>
                {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
