'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { StickyNote, Plus, ChevronRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { SidebarView } from '@/lib/types'
import type { WidgetSize } from '@/lib/dashboard-layout'

interface NoteMeta {
  title?: string
  pinned?: boolean
}

interface Note {
  id: string
  content: string
  type: string
  meta: NoteMeta | null
  created_at: string
  is_folder?: boolean
}

const ACCENT = '#D97757'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function notePreview(n: Note): string {
  if (n.meta?.title) return n.meta.title
  const firstLine = n.content.split('\n')[0].trim()
  return firstLine || 'Untitled'
}

interface Props {
  size: WidgetSize
  setSidebarView: (v: SidebarView) => void
}

export default function NotesWidget({ size, setSidebarView }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const limit = size === 'small' ? 2 : size === 'medium' ? 3 : 5

  const refresh = useCallback(async () => {
    try {
      // Load a few extra so we can filter out folders and still have enough
      const res = await fetch(`/api/notes?limit=${limit + 10}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json() as { notes: Note[] }
      // Exclude folders from the home widget — they're navigation, not content.
      // Sort pinned first then newest.
      const sorted = [...(json.notes ?? [])]
        .filter((n) => !n.is_folder)
        .sort((a, b) => {
          const ap = a.meta?.pinned ? 1 : 0
          const bp = b.meta?.pinned ? 1 : 0
          if (ap !== bp) return bp - ap
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
      setNotes(sorted)
    } catch {
      // silent fail on widget — not critical
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSave = async () => {
    const content = draft.trim()
    if (!content) return
    setSaving(true)
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error('Save failed')
      const { note } = await res.json() as { note: Note }
      setNotes((prev) => [note, ...prev])
      setDraft('')
      setAdding(false)
      toast.success('Note saved')
    } catch {
      toast.error('Could not save note')
    } finally {
      setSaving(false)
    }
  }

  // ── Card wrapper ────────────────────────────────────────────────────────────
  return (
    <div
      className="hwidget"
      style={{
        display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '14px 16px',
        position: 'relative', overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* corner glow */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 90, height: 90,
        background: `radial-gradient(circle at 100% 0%, ${ACCENT}1A 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => setSidebarView('notes')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          }}
        >
          <div style={{
            width: 24, height: 24, borderRadius: 7, background: `${ACCENT}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <StickyNote size={12} color={ACCENT} />
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            Notes
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v)
            setTimeout(() => inputRef.current?.focus(), 50)
          }}
          aria-label={adding ? 'Cancel' : 'Quick add note'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 6,
            background: adding ? 'var(--morning)' : 'transparent',
            border: 'none', cursor: 'pointer', color: ACCENT,
            padding: 0,
          }}
        >
          <Plus
            size={14}
            style={{
              transform: adding ? 'rotate(45deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          />
        </button>
      </div>

      {/* content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {adding && (
          <div style={{ marginBottom: 8 }}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a note…"
              rows={2}
              maxLength={8000}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontSize: 12, padding: '8px 10px',
                background: 'var(--surface-2, var(--surface))',
                border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text)', resize: 'none', outline: 'none',
                fontFamily: 'inherit', lineHeight: 1.5,
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void handleSave()
                }
              }}
            />
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6,
            }}>
              <button
                type="button"
                onClick={() => { setAdding(false); setDraft('') }}
                style={{
                  padding: '4px 10px', fontSize: 11,
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text-2)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !draft.trim()}
                style={{
                  padding: '4px 12px', fontSize: 11, fontWeight: 500,
                  background: draft.trim() ? ACCENT : 'var(--border)',
                  color: draft.trim() ? '#fff' : 'var(--text-3)',
                  border: 'none', borderRadius: 6,
                  cursor: draft.trim() && !saving ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {saving && <Loader2 size={10} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
            <Loader2 size={12} className="animate-spin" color="var(--text-3)" />
          </div>
        ) : notes.length === 0 ? (
          <button
            type="button"
            onClick={() => {
              setAdding(true)
              setTimeout(() => inputRef.current?.focus(), 50)
            }}
            style={{
              flex: 1,
              border: '1px dashed var(--border)',
              borderRadius: 10,
              background: 'transparent',
              color: 'var(--text-3)',
              fontSize: 12,
              cursor: 'pointer',
              padding: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >
            Type a quick note or say it in chat
          </button>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 5,
            flex: 1, minHeight: 0, overflow: 'hidden',
          }}>
            {notes.slice(0, limit).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSidebarView('notes')}
                title={n.content.slice(0, 200)}
                style={{
                  textAlign: 'left',
                  padding: '6px 8px',
                  background: n.meta?.pinned ? 'var(--morning)' : 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'inherit',
                  minWidth: 0,
                }}
              >
                <span style={{
                  fontSize: 12, color: 'var(--text)', fontWeight: 500,
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap', minWidth: 0,
                }}>
                  {notePreview(n)}
                </span>
                <span style={{
                  fontSize: 10, color: 'var(--text-3)', flexShrink: 0,
                }}>
                  {relativeTime(n.created_at)}
                </span>
              </button>
            ))}
            {notes.length > limit && (
              <button
                type="button"
                onClick={() => setSidebarView('notes')}
                style={{
                  padding: '4px 0',
                  background: 'transparent', border: 'none',
                  fontSize: 11, color: ACCENT,
                  cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 2, fontWeight: 500,
                }}
              >
                +{notes.length - limit} more <ChevronRight size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
