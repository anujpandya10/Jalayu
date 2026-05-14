'use client'

import { useState } from 'react'
import { Loader2, ClipboardList } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import { todayString } from '@/lib/utils'
import type { Task } from '@/lib/types'

async function getSupabase() {
  const { createClient } = await import('@/lib/supabase')
  return createClient()
}

export default function MeetingsView() {
  const { addNote, addTask } = useStore()
  const [transcript, setTranscript] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionItems, setActionItems] = useState<string[]>([])
  const [summary, setSummary] = useState('')

  const extract = async () => {
    if (transcript.trim().length < 30) {
      toast.error('Paste a longer transcript first')
      return
    }
    setLoading(true)
    setActionItems([])
    setSummary('')
    try {
      const res = await fetch('/api/meetings/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcript.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Extract failed')
        return
      }
      setActionItems(data.actionItems || [])
      setSummary(data.summary || '')
      toast.success('Meeting saved to Memory')
      if (data.note) addNote(data.note as never)
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  const addSelectedToToday = async () => {
    if (!actionItems.length) return
    const supabase = await getSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    for (const title of actionItems) {
      const { data, error } = await supabase
        .from('tasks')
        .insert({ user_id: user.id, title, due_date: todayString(), priority: 'medium' })
        .select()
        .single()
      if (!error && data) {
        addTask(data as Task)
      }
    }
    toast.success('Tasks added for today')
    setActionItems([])
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <ClipboardList size={20} color="#534AB7" />
        Meetings
      </h2>
      <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 14px' }}>
        Paste a transcript (or export from Zoom / Meet). Jalayu extracts a summary and action items — nothing is recorded until you run extract.
      </p>

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste meeting transcript here…"
        rows={12}
        style={{
          width: '100%',
          fontSize: 13,
          padding: 12,
          borderRadius: 10,
          border: '0.5px solid #E5E3FF',
          marginBottom: 10,
          resize: 'vertical',
          lineHeight: 1.6,
          color: '#374151',
        }}
      />

      <button
        type="button"
        onClick={extract}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: 10,
          border: 'none',
          background: '#534AB7',
          color: '#fff',
          fontSize: 13,
          fontWeight: 500,
          cursor: loading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        Extract summary & actions
      </button>

      {summary && (
        <div className="card" style={{ marginTop: 14, padding: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#534AB7', margin: '0 0 6px' }}>Summary</p>
          <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6 }}>{summary}</p>
        </div>
      )}

      {actionItems.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', marginBottom: 8 }}>Action items</p>
          <ul style={{ margin: '0 0 10px', paddingLeft: 18, color: '#374151', fontSize: 13 }}>
            {actionItems.map((a) => (
              <li key={a} style={{ marginBottom: 4 }}>
                {a}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={addSelectedToToday}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#22C55E',
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Add all to today&apos;s tasks
          </button>
        </div>
      )}
    </div>
  )
}
