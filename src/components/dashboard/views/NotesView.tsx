'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Loader2, Search, Pin, PinOff, Trash2, Pencil, Plus, X, Check,
  StickyNote,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface NoteMeta {
  title?: string
  pinned?: boolean
}

export interface NoteItem {
  id: string
  content: string
  type: string
  tags: string[] | null
  meta: NoteMeta | null
  created_at: string
  updated_at: string
  is_voice?: boolean
}

interface Props {
  name: string
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const dateStr = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${dateStr} · ${timeStr}`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return formatDateTime(iso)
}

function previewTitle(note: NoteItem): string {
  if (note.meta?.title) return note.meta.title
  // Generate title from first line / first ~60 chars
  const firstLine = note.content.split('\n')[0].trim()
  if (firstLine.length <= 60) return firstLine || 'Untitled note'
  return firstLine.slice(0, 60) + '…'
}

export default function NotesView({ name }: Props) {
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [showTitle, setShowTitle] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const newAreaRef = useRef<HTMLTextAreaElement>(null)

  // ── Fetch notes ─────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notes?limit=300', { cache: 'no-store' })
      if (!res.ok) throw new Error('Load failed')
      const json = await res.json() as { notes: NoteItem[] }
      setNotes(json.notes ?? [])
    } catch (err) {
      console.error(err)
      toast.error('Could not load notes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // ── Filter + sort: pinned first, then newest ───────────────────────────────
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = notes
    if (needle) {
      list = list.filter((n) =>
        n.content.toLowerCase().includes(needle) ||
        (n.meta?.title?.toLowerCase().includes(needle) ?? false) ||
        (n.tags?.some((t) => t.toLowerCase().includes(needle)) ?? false),
      )
    }
    return [...list].sort((a, b) => {
      const ap = a.meta?.pinned ? 1 : 0
      const bp = b.meta?.pinned ? 1 : 0
      if (ap !== bp) return bp - ap
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [notes, q])

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const content = newContent.trim()
    if (!content) return
    setSaving(true)
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          title: newTitle.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Save failed')
      }
      const { note } = await res.json() as { note: NoteItem }
      setNotes((prev) => [note, ...prev])
      setNewContent('')
      setNewTitle('')
      setShowTitle(false)
      toast.success('Note saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save note')
    } finally {
      setSaving(false)
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  const startEdit = (note: NoteItem) => {
    setEditingId(note.id)
    setEditContent(note.content)
    setEditTitle(note.meta?.title ?? '')
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditContent('')
    setEditTitle('')
  }
  const saveEdit = async () => {
    if (!editingId) return
    const content = editContent.trim()
    if (!content) {
      toast.error('Note cannot be empty')
      return
    }
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/notes/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          title: editTitle.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Update failed')
      }
      const { note } = await res.json() as { note: NoteItem }
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
      cancelEdit()
      toast.success('Note updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update')
    } finally {
      setSavingEdit(false)
    }
  }

  // ── Pin / unpin ─────────────────────────────────────────────────────────────
  const togglePin = async (note: NoteItem) => {
    const nextPinned = !note.meta?.pinned
    // Optimistic update
    setNotes((prev) => prev.map((n) => (
      n.id === note.id
        ? { ...n, meta: { ...(n.meta ?? {}), pinned: nextPinned } }
        : n
    )))
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: nextPinned }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      // Rollback
      setNotes((prev) => prev.map((n) => (
        n.id === note.id ? note : n
      )))
      toast.error('Could not update pin')
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note? This cannot be undone.')) return
    const prev = notes
    setNotes((p) => p.filter((n) => n.id !== id))
    try {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Note deleted')
    } catch {
      setNotes(prev)
      toast.error('Could not delete')
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 12,
  }

  const buttonIcon: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 5,
    borderRadius: 6,
    color: 'var(--text-3)',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.15s, background 0.15s',
  }

  return (
    <div
      className="notes-view"
      style={{
        padding: '16px max(14px, env(safe-area-inset-right)) 20px max(14px, env(safe-area-inset-left))',
        maxWidth: 720,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <StickyNote size={18} color="var(--accent)" />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Notes</h2>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 16px' }}>
        Quick thoughts, ideas, anything you want to remember{name ? `, ${name}` : ''}.
        Just say &ldquo;add this to my notes&rdquo; in chat and Jalayu will save it for you.
      </p>

      {/* Quick add */}
      <section style={{ marginBottom: 18 }}>
        <div style={cardStyle}>
          {showTitle && (
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title (optional)"
              maxLength={200}
              style={{
                width: '100%',
                fontSize: 14,
                fontWeight: 600,
                outline: 'none',
                border: 'none',
                background: 'transparent',
                color: 'var(--text)',
                marginBottom: 8,
              }}
            />
          )}
          <textarea
            ref={newAreaRef}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Type a note…"
            rows={3}
            maxLength={8000}
            style={{
              width: '100%',
              fontSize: 13,
              resize: 'vertical',
              minHeight: 60,
              outline: 'none',
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              lineHeight: 1.6,
              fontFamily: 'inherit',
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void handleCreate()
              }
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            paddingTop: 8,
            borderTop: '0.5px solid var(--border)',
          }}>
            <button
              type="button"
              onClick={() => setShowTitle((v) => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 11,
                color: 'var(--text-3)',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 6,
              }}
            >
              {showTitle ? '− Hide title' : '+ Add title'}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !newContent.trim()}
              style={{
                padding: '7px 14px',
                background: newContent.trim() ? 'var(--accent)' : 'var(--border)',
                color: newContent.trim() ? '#fff' : 'var(--text-2)',
                border: 'none',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                cursor: newContent.trim() && !saving ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Save note
            </button>
          </div>
        </div>
      </section>

      {/* Search */}
      {notes.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 10,
            marginBottom: 12,
            background: 'var(--surface)',
          }}
        >
          <Search size={14} color="var(--text-3)" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…"
            style={{
              flex: 1,
              fontSize: 13,
              outline: 'none',
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
            }}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              style={buttonIcon}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* Notes list */}
      <section>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <Loader2 size={18} className="animate-spin" color="var(--text-3)" />
          </div>
        ) : visible.length === 0 ? (
          <div style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--text-3)',
            fontSize: 13,
          }}>
            {q
              ? <>No notes match &ldquo;{q}&rdquo;</>
              : <>No notes yet. Type one above, or say &ldquo;add this to my notes&rdquo; in chat.</>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map((note) => {
              const isEditing = editingId === note.id
              const isPinned = !!note.meta?.pinned
              return (
                <div
                  key={note.id}
                  style={{
                    ...cardStyle,
                    borderColor: isPinned ? 'var(--accent)' : 'var(--border)',
                    borderWidth: isPinned ? 1 : 1,
                    background: isPinned ? 'var(--morning)' : 'var(--surface)',
                  }}
                >
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Title (optional)"
                        maxLength={200}
                        style={{
                          width: '100%',
                          fontSize: 14,
                          fontWeight: 600,
                          outline: 'none',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text)',
                          marginBottom: 6,
                        }}
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={Math.min(8, Math.max(3, editContent.split('\n').length))}
                        maxLength={8000}
                        autoFocus
                        style={{
                          width: '100%',
                          fontSize: 13,
                          resize: 'vertical',
                          outline: 'none',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text)',
                          lineHeight: 1.6,
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 6,
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: '0.5px solid var(--border)',
                      }}>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          style={{
                            padding: '6px 12px',
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            color: 'var(--text-2)',
                            borderRadius: 7,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={savingEdit || !editContent.trim()}
                          style={{
                            padding: '6px 14px',
                            background: 'var(--accent)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 7,
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: editContent.trim() && !savingEdit ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {savingEdit ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Save
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {note.meta?.title && (
                            <div style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'var(--text)',
                              marginBottom: 4,
                            }}>
                              {note.meta.title}
                            </div>
                          )}
                          <div style={{
                            fontSize: 13,
                            color: 'var(--text)',
                            lineHeight: 1.55,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}>
                            {note.content}
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            marginTop: 8,
                            fontSize: 10.5,
                            color: 'var(--text-3)',
                          }}>
                            <span title={formatDateTime(note.created_at)}>
                              {relativeTime(note.created_at)}
                            </span>
                            {note.updated_at && note.updated_at !== note.created_at && (
                              <span title={`Edited ${formatDateTime(note.updated_at)}`}>
                                · edited
                              </span>
                            )}
                            {note.type && note.type !== 'note' && (
                              <span style={{
                                padding: '1px 6px',
                                background: 'var(--surface-2)',
                                borderRadius: 4,
                                fontSize: 9.5,
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                              }}>
                                {note.type}
                              </span>
                            )}
                            {note.tags && note.tags.length > 0 && note.tags.slice(0, 3).map((tag) => (
                              <span key={tag} style={{
                                padding: '1px 6px',
                                background: 'var(--surface-2)',
                                borderRadius: 4,
                                fontSize: 10,
                              }}>
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => togglePin(note)}
                            title={isPinned ? 'Unpin' : 'Pin to top'}
                            style={{
                              ...buttonIcon,
                              color: isPinned ? 'var(--accent)' : 'var(--text-3)',
                            }}
                          >
                            {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            title="Edit"
                            style={buttonIcon}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(note.id)}
                            title="Delete"
                            style={buttonIcon}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#EF4444'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--text-3)'
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

// Pretitle export for cross-file use
export { previewTitle, formatDateTime, relativeTime }
