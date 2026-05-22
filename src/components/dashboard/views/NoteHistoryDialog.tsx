'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, X, History, RotateCcw, User, Sparkles, Wand2, Undo2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Revision {
  id: string
  content: string
  body_md: string | null
  attachments: unknown
  updated_by: 'user' | 'ai' | 'compose' | 'restore'
  source: string | null
  created_at: string
}

interface Props {
  open: boolean
  noteId: string | null
  noteName?: string
  onClose: () => void
  /** Called with the restored note when restore succeeds. */
  onRestored: (note: unknown) => void
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

const SOURCE_META: Record<Revision['updated_by'], { icon: typeof User; label: string; color: string }> = {
  user:    { icon: User,      label: 'You edited',     color: '#0A7B6A' },
  ai:      { icon: Sparkles,  label: 'AI updated',     color: '#8B5CF6' },
  compose: { icon: Wand2,     label: 'AI composed',    color: '#D97757' },
  restore: { icon: Undo2,     label: 'Restored',       color: '#F59E0B' },
}

export default function NoteHistoryDialog({ open, noteId, noteName, onClose, onRestored }: Props) {
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  const load = useCallback(async () => {
    if (!noteId) return
    setLoading(true)
    setSelectedId(null)
    try {
      const res = await fetch(`/api/notes/${noteId}/revisions`, { cache: 'no-store' })
      if (!res.ok) throw new Error('load failed')
      const json = await res.json() as { revisions: Revision[] }
      setRevisions(json.revisions ?? [])
    } catch {
      toast.error('Could not load history')
    } finally {
      setLoading(false)
    }
  }, [noteId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const handleRestore = async (rev: Revision) => {
    if (!noteId) return
    if (!confirm(
      `Restore the version from ${formatDateTime(rev.created_at)}?\n\n` +
      `Your current content will also be saved to history so you can undo this restore.`,
    )) return
    setRestoring(true)
    try {
      const res = await fetch(`/api/notes/${noteId}/revisions/${rev.id}/restore`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('restore failed')
      const json = await res.json() as { note: unknown }
      onRestored(json.note)
      toast.success('Restored — current version saved in history')
      onClose()
    } catch {
      toast.error('Could not restore')
    } finally {
      setRestoring(false)
    }
  }

  if (!open || !noteId) return null

  const selected = selectedId ? revisions.find((r) => r.id === selectedId) : null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10500,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 14,
          width: 820, maxWidth: '95vw', maxHeight: '85vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={16} color="var(--accent)" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                Version history
              </div>
              {noteName && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  {noteName}
                </div>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', padding: 4, display: 'flex',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <Loader2 size={18} className="animate-spin" color="var(--text-3)" />
          </div>
        ) : revisions.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center',
            color: 'var(--text-3)', fontSize: 13, lineHeight: 1.6,
          }}>
            No previous versions yet.<br />
            <span style={{ fontSize: 11 }}>
              Each edit (manual or AI) creates a snapshot. You&apos;ll see versions here after the next edit.
            </span>
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'grid',
            gridTemplateColumns: 'minmax(240px, 280px) 1fr',
            minHeight: 0, overflow: 'hidden',
          }}>
            {/* Version list */}
            <div style={{
              borderRight: '1px solid var(--border)',
              overflowY: 'auto', padding: 8,
            }}>
              {revisions.map((rev) => {
                const meta = SOURCE_META[rev.updated_by] || SOURCE_META.user
                const Icon = meta.icon
                const isSelected = selectedId === rev.id
                return (
                  <button
                    key={rev.id}
                    type="button"
                    onClick={() => setSelectedId(rev.id)}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '9px 10px', marginBottom: 4,
                      background: isSelected ? 'var(--morning)' : 'transparent',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      fontFamily: 'inherit',
                    }}
                  >
                    <Icon size={13} color={meta.color} style={{ marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 500, color: 'var(--text)',
                        display: 'flex', alignItems: 'baseline', gap: 6,
                      }}>
                        <span>{meta.label}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                          {relativeTime(rev.created_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                        {formatDateTime(rev.created_at)}
                      </div>
                      {rev.source && (
                        <div style={{
                          fontSize: 10.5, color: 'var(--text-3)', marginTop: 4,
                          fontStyle: 'italic',
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>
                          “{rev.source}”
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Preview pane */}
            <div style={{
              padding: '14px 18px', overflowY: 'auto',
              display: 'flex', flexDirection: 'column',
            }}>
              {selected ? (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 8, gap: 8,
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      This is how the note looked before this change:
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestore(selected)}
                      disabled={restoring}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', fontSize: 12, fontWeight: 500,
                        background: 'var(--accent)', color: '#fff',
                        border: 'none', borderRadius: 7,
                        cursor: restoring ? 'not-allowed' : 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {restoring ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      Restore this version
                    </button>
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--text)',
                    paddingBottom: 6, borderBottom: '0.5px solid var(--border)',
                    marginBottom: 8,
                  }}>
                    {selected.content || 'Untitled'}
                  </div>
                  <div className="md-body" style={{
                    fontSize: 13, lineHeight: 1.6, color: 'var(--text)',
                  }}>
                    {selected.body_md ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selected.body_md}
                      </ReactMarkdown>
                    ) : (
                      <em style={{ color: 'var(--text-3)' }}>(no body)</em>
                    )}
                  </div>
                </>
              ) : (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-3)', fontSize: 12,
                }}>
                  Pick a version on the left to preview & restore
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
