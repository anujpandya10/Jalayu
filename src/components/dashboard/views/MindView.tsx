'use client'

import { useState, useMemo } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import type { Note } from '@/lib/types'

async function getSupabase() {
  const { createClient } = await import('@/lib/supabase')
  return createClient()
}

const PROMPTS = [
  "What's looping in your head right now?",
  'What are you avoiding saying out loud?',
  'If your mind were a room, what needs tidying?',
]

export default function MindView({
  notes,
  name,
  onSaveMind,
}: {
  notes: Note[]
  name: string
  onSaveMind: (content: string) => Promise<void>
}) {
  const { setShowChatPanel } = useStore()
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const prompt = PROMPTS[Math.floor(Date.now() / 86400000) % PROMPTS.length]

  const mindNotes = useMemo(
    () => notes.filter((n) => n.type === 'mind').slice(0, 12),
    [notes],
  )

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    await onSaveMind(content.trim())
    setContent('')
    setSaving(false)
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 4px' }}>My mind</h2>
      <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 14px' }}>Dump thoughts here — only you see them.</p>

      <div className="card" style={{ marginBottom: 12, padding: '12px 14px', background: '#FDFCFF' }}>
        <p style={{ fontSize: 12, color: '#534AB7', fontWeight: 500, margin: '0 0 8px' }}>Today&apos;s prompt</p>
        <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.5 }}>{prompt}</p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`Brain dump, ${name}…`}
          rows={6}
          style={{
            width: '100%', fontSize: 13, resize: 'none', outline: 'none',
            background: 'transparent', border: 'none', color: '#374151', lineHeight: 1.7,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #F3F4F6' }}>
          <button
            type="button"
            onClick={() => setShowChatPanel(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#534AB7',
              background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
            }}
          >
            <MessageCircle size={14} />
            Talk it through in chat
          </button>
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
            Save to mind
          </button>
        </div>
      </div>

      {mindNotes.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Recent mind captures</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mindNotes.map((note) => (
              <div key={note.id} className="card">
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>
                  {note.content.length > 200 ? `${note.content.slice(0, 200)}…` : note.content}
                </p>
                <p style={{ fontSize: 10, color: '#9CA3AF', margin: '8px 0 0' }}>
                  {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
