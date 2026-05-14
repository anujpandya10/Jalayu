'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Reflection } from '@/lib/types'

export default function ReflectView({
  todayReflection,
  onSave,
}: {
  todayReflection: Reflection | null
  onSave: (data: { one_word: string; win_of_day: string; tomorrow_note: string }) => Promise<void>
}) {
  const [oneWord, setOneWord] = useState(todayReflection?.one_word || '')
  const [winOfDay, setWinOfDay] = useState(todayReflection?.win_of_day || '')
  const [tomorrowNote, setTomorrowNote] = useState(todayReflection?.tomorrow_note || '')
  const [saving, setSaving] = useState(false)

  const alreadySaved = !!todayReflection
  const hasChanges =
    oneWord !== (todayReflection?.one_word || '') ||
    winOfDay !== (todayReflection?.win_of_day || '') ||
    tomorrowNote !== (todayReflection?.tomorrow_note || '')

  const handleSave = async () => {
    if (!oneWord.trim() && !winOfDay.trim() && !tomorrowNote.trim()) {
      toast.error('Fill in at least one field')
      return
    }
    setSaving(true)
    await onSave({ one_word: oneWord.trim(), win_of_day: winOfDay.trim(), tomorrow_note: tomorrowNote.trim() })
    setSaving(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, outline: 'none',
    background: 'transparent', border: 'none', color: '#374151',
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>End of day reflection</h2>
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>Takes 2 minutes. Builds your life archive.</p>
      </div>

      {alreadySaved && !hasChanges && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#EAF3DE', border: '1px solid #c4e09c', marginBottom: 14 }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: '#3B6D11' }}>Today&apos;s reflection is saved ✦</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        <div className="card">
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#534AB7', marginBottom: 6 }}>One word for today</label>
          <input
            type="text"
            value={oneWord}
            onChange={(e) => setOneWord(e.target.value)}
            placeholder="e.g. Focused, chaotic, grateful…"
            style={inputStyle}
          />
        </div>
        <div className="card">
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#534AB7', marginBottom: 6 }}>Win of the day</label>
          <input
            type="text"
            value={winOfDay}
            onChange={(e) => setWinOfDay(e.target.value)}
            placeholder="Even the smallest thing counts…"
            style={inputStyle}
          />
        </div>
        <div className="card">
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#534AB7', marginBottom: 6 }}>What does tomorrow-you need to know?</label>
          <textarea
            value={tomorrowNote}
            onChange={(e) => setTomorrowNote(e.target.value)}
            placeholder="A reminder, a priority, something to carry forward…"
            rows={3}
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%', padding: '13px', background: '#534AB7', color: '#fff',
          border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 500,
          cursor: saving ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        {alreadySaved ? 'Update reflection ✦' : 'Save reflection ✦'}
      </button>

      <p style={{ textAlign: 'center', fontSize: 11, color: '#9CA3AF', marginTop: 12 }}>
        Your reflections are private and build your personal life archive over time
      </p>
    </div>
  )
}
