'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Loader2, Search, Pin, PinOff, Trash2, Pencil, Plus, X, Check,
  StickyNote, FolderPlus, Folder, FolderOpen, ChevronRight, ChevronDown,
  FileText, Paperclip, Download, Eye, EyeOff, Upload, ArrowLeft, Move, Lock,
  History,
  Image as ImageIcon, File as FileIcon, FolderSymlink, Maximize2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '@/store/useStore'
import VaultUnlockDialog from '@/components/chat/VaultUnlockDialog'
import NoteHistoryDialog from '@/components/dashboard/views/NoteHistoryDialog'

interface NoteMeta {
  title?: string
  pinned?: boolean
  hideFromHome?: boolean
}

interface Attachment {
  path: string
  name: string
  size: number
  mime: string
  uploaded_at: string
}

interface Note {
  id: string
  content: string
  body_md: string | null
  type: string
  tags: string[] | null
  meta: NoteMeta | null
  parent_id: string | null
  is_folder: boolean
  attachments: Attachment[]
  created_at: string
  updated_at: string
  is_voice?: boolean
}

const MAX_UPLOAD_MB = 25

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
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
  if (d < 7) return `${d}d ago`
  return formatDateTime(iso)
}

function previewTitle(note: Note): string {
  if (note.meta?.title) return note.meta.title
  const firstLine = note.content.split('\n')[0].trim()
  if (firstLine.length <= 60) return firstLine || 'Untitled note'
  return firstLine.slice(0, 60) + '…'
}

function mimeIcon(mime: string) {
  if (mime.startsWith('image/')) return ImageIcon
  if (mime === 'application/pdf') return FileText
  return FileIcon
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { name: string }

export default function NotesView({ name }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const setChatContext = useStore((s) => s.setChatContext)

  // Editor state for the selected note
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editBodyMd, setEditBodyMd] = useState('')
  const [editMode, setEditMode] = useState<'preview' | 'edit'>('preview')
  const [savingEdit, setSavingEdit] = useState(false)
  const [dirty, setDirty] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  // Vault encryption dialog state — set when user clicks "Move to Vault"
  // on a sensitive note. The dialog encrypts the note's body into vault_entries
  // and deletes the source note on success.
  const [vaultMigrate, setVaultMigrate] = useState<{
    noteId: string
    name: string
    value: string
    kind: 'password' | 'note' | 'card' | 'secret'
  } | null>(null)
  // Version history dialog state
  const [historyNoteId, setHistoryNoteId] = useState<string | null>(null)

  // Refresh all notes (we load the whole tree, then partition in memory)
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notes?limit=1000', { cache: 'no-store' })
      if (!res.ok) throw new Error('load failed')
      const json = await res.json() as { notes: Note[] }
      setNotes(json.notes ?? [])
    } catch {
      toast.error('Could not load notes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // ── Indexes ─────────────────────────────────────────────────────────────
  const byId = useMemo(() => {
    const m = new Map<string, Note>()
    for (const n of notes) m.set(n.id, n)
    return m
  }, [notes])

  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, Note[]>()
    for (const n of notes) {
      const key = n.parent_id
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(n)
    }
    return m
  }, [notes])

  // ── Selected note + sync editor state ───────────────────────────────────
  const selectedNote = selectedNoteId ? byId.get(selectedNoteId) ?? null : null

  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.meta?.title ?? '')
      setEditContent(selectedNote.content)
      setEditBodyMd(selectedNote.body_md ?? '')
      setEditMode(selectedNote.body_md ? 'preview' : 'edit')
      setDirty(false)
    } else {
      setEditTitle(''); setEditContent(''); setEditBodyMd(''); setDirty(false)
    }
  }, [selectedNote?.id, selectedNote])

  // Push the user's current context (folder/note) to the global store so the
  // floating chat button + chat API know what "this folder" / "what I have
  // here" refers to.
  useEffect(() => {
    const folder = currentFolderId ? byId.get(currentFolderId) : null
    setChatContext({
      view: 'notes',
      folderId: folder?.id ?? null,
      folderName: folder ? previewTitle(folder) : null,
      noteId: selectedNote?.id ?? null,
      noteName: selectedNote ? previewTitle(selectedNote) : null,
    })
  }, [currentFolderId, selectedNote, byId, setChatContext])

  // Breadcrumb path to current folder
  const breadcrumb = useMemo(() => {
    const out: Note[] = []
    let cursor: string | null = currentFolderId
    let safety = 50
    while (cursor && safety-- > 0) {
      const n = byId.get(cursor)
      if (!n) break
      out.unshift(n)
      cursor = n.parent_id
    }
    return out
  }, [currentFolderId, byId])

  const visibleHere = useMemo(() => {
    const list = childrenByParent.get(currentFolderId) ?? []
    const needle = search.trim().toLowerCase()
    let filtered = list
    if (needle) {
      // Search globally when search is active; otherwise stay in folder
      filtered = notes.filter((n) =>
        n.content.toLowerCase().includes(needle) ||
        (n.body_md?.toLowerCase().includes(needle) ?? false) ||
        (n.meta?.title?.toLowerCase().includes(needle) ?? false) ||
        (n.tags?.some((t) => t.toLowerCase().includes(needle)) ?? false),
      )
    }
    return [...filtered].sort((a, b) => {
      // Folders first
      if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1
      // Pinned before unpinned
      const ap = a.meta?.pinned ? 1 : 0
      const bp = b.meta?.pinned ? 1 : 0
      if (ap !== bp) return bp - ap
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [currentFolderId, childrenByParent, notes, search])

  // ── Mutations ───────────────────────────────────────────────────────────
  const createNote = async (isFolder: boolean) => {
    const namePrompt = prompt(isFolder ? 'New folder name:' : 'New note title:')
    if (!namePrompt?.trim()) return
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: namePrompt.trim(),
          is_folder: isFolder,
          parent_id: currentFolderId,
          ...(isFolder ? {} : { body_md: '' }),
        }),
      })
      if (!res.ok) throw new Error('Create failed')
      const { note } = await res.json() as { note: Note }
      setNotes((prev) => [note, ...prev])
      if (!isFolder) setSelectedNoteId(note.id)
      toast.success(isFolder ? 'Folder created' : 'Note created')
    } catch {
      toast.error('Could not create')
    }
  }

  const saveEdits = async () => {
    if (!selectedNote || !dirty) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/notes/${selectedNote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim() || null,
          content: editContent.trim() || editTitle.trim() || 'Untitled',
          body_md: editBodyMd,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      const { note } = await res.json() as { note: Note }
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
      setDirty(false)
      toast.success('Saved')
    } catch {
      toast.error('Could not save')
    } finally {
      setSavingEdit(false)
    }
  }

  // Cmd/Ctrl+S to save
  useEffect(() => {
    if (!selectedNote) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty) void saveEdits()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote, dirty, editTitle, editContent, editBodyMd])

  const togglePin = async (note: Note) => {
    const nextPinned = !note.meta?.pinned
    setNotes((prev) => prev.map((n) => (
      n.id === note.id ? { ...n, meta: { ...(n.meta ?? {}), pinned: nextPinned } } : n
    )))
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: nextPinned }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
      toast.error('Could not pin')
    }
  }

  /**
   * Toggle whether this note shows on the home dashboard's Notes widget.
   * Pin = float to top in workspace. Hide from home = stop appearing on home.
   * Two separate concepts.
   */
  const toggleHideFromHome = async (note: Note) => {
    const nextHidden = !note.meta?.hideFromHome
    setNotes((prev) => prev.map((n) => (
      n.id === note.id ? { ...n, meta: { ...(n.meta ?? {}), hideFromHome: nextHidden } } : n
    )))
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hideFromHome: nextHidden }),
      })
      if (!res.ok) throw new Error()
      toast.success(nextHidden ? 'Hidden from home dashboard' : 'Showing on home dashboard')
    } catch {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
      toast.error('Could not update')
    }
  }

  const deleteNote = async (note: Note) => {
    const msg = note.is_folder
      ? `Delete folder "${previewTitle(note)}" and ALL its contents? This cannot be undone.`
      : `Delete "${previewTitle(note)}"? This cannot be undone.`
    if (!confirm(msg)) return
    const prev = notes
    setNotes((p) => p.filter((n) => n.id !== note.id))
    if (selectedNoteId === note.id) setSelectedNoteId(null)
    try {
      const res = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      // Reload to pick up cascade-deleted children
      void refresh()
      toast.success('Deleted')
    } catch {
      setNotes(prev)
      toast.error('Could not delete')
    }
  }

  const moveNote = async (noteId: string, targetParentId: string | null) => {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: targetParentId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Move failed')
      }
      const { note } = await res.json() as { note: Note }
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
      setMoveDialogOpen(false)
      toast.success('Moved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not move')
    }
  }

  // ── Attachments ─────────────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    if (!selectedNote) return
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`File too large (max ${MAX_UPLOAD_MB}MB)`)
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/notes/${selectedNote.id}/upload`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Upload failed')
      }
      const { attachments } = await res.json() as { attachments: Attachment[] }
      setNotes((prev) => prev.map((n) =>
        n.id === selectedNote.id ? { ...n, attachments } : n
      ))
      toast.success(`Uploaded ${file.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const deleteAttachment = async (noteId: string, idx: number) => {
    if (!confirm('Delete this attachment?')) return
    try {
      const res = await fetch(`/api/notes/${noteId}/attachment/${idx}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      const { attachments } = await res.json() as { attachments: Attachment[] }
      setNotes((prev) => prev.map((n) =>
        n.id === noteId ? { ...n, attachments } : n
      ))
      toast.success('Removed')
    } catch {
      toast.error('Could not remove')
    }
  }

  // ── Render: workspace layout ────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Loader2 size={20} className="animate-spin" color="var(--text-3)" />
      </div>
    )
  }

  const allFolders = useMemo_filter_folders(notes)

  return (
    <div className="notes-workspace" style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 'calc(100vh - 90px)',
      maxWidth: 1100, margin: '0 auto',
      padding: '12px max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left))',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, marginBottom: 10, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StickyNote size={18} color="var(--accent)" />
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Workspace
          </h2>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {notes.filter((n) => !n.is_folder).length} notes ·{' '}
            {notes.filter((n) => n.is_folder).length} folders
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => createNote(true)} style={btnSecondary}>
            <FolderPlus size={12} /> New folder
          </button>
          <button type="button" onClick={() => createNote(false)} style={btnPrimary}>
            <Plus size={12} /> New note
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 10,
        marginBottom: 10,
      }}>
        <Search size={13} color="var(--text-3)" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={search ? 'Searching all notes…' : 'Search…'}
          style={{
            flex: 1, fontSize: 13, outline: 'none', border: 'none',
            background: 'transparent', color: 'var(--text)',
          }}
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} style={iconBtn}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body: two-pane layout */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: selectedNote ? 'minmax(220px, 280px) 1fr' : '1fr',
        gap: 12, minHeight: 0,
      }}>
        {/* Left pane (folder + list) */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 10,
          minHeight: 0, overflow: 'auto',
        }}>
          {/* Breadcrumb */}
          {!search && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 6px 8px', fontSize: 11,
              color: 'var(--text-3)', borderBottom: '0.5px solid var(--border)',
              marginBottom: 6, flexWrap: 'wrap',
            }}>
              <button
                type="button"
                onClick={() => setCurrentFolderId(null)}
                style={crumbBtn}
              >
                Workspace
              </button>
              {breadcrumb.map((b) => (
                <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <ChevronRight size={10} />
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(b.id)}
                    style={crumbBtn}
                  >
                    {previewTitle(b)}
                  </button>
                </span>
              ))}
            </div>
          )}

          {visibleHere.length === 0 ? (
            <div style={{
              padding: 20, textAlign: 'center',
              fontSize: 12, color: 'var(--text-3)',
            }}>
              {search ? `No matches for "${search}"` :
                'Empty folder. Use "New note" or "New folder" above.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {visibleHere.map((n) => (
                <NoteListItem
                  key={n.id}
                  note={n}
                  selected={selectedNoteId === n.id}
                  onClick={() => {
                    if (n.is_folder) {
                      setCurrentFolderId(n.id)
                      setSelectedNoteId(null)
                      setSearch('')
                    } else {
                      setSelectedNoteId(n.id)
                    }
                  }}
                  onPin={() => togglePin(n)}
                  onDelete={() => deleteNote(n)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right pane (editor) */}
        {selectedNote && (
          <NoteEditor
            note={selectedNote}
            editTitle={editTitle}
            editContent={editContent}
            editBodyMd={editBodyMd}
            editMode={editMode}
            dirty={dirty}
            saving={savingEdit}
            uploading={uploading}
            allFolders={allFolders}
            moveDialogOpen={moveDialogOpen}
            onTitleChange={(v) => { setEditTitle(v); setDirty(true) }}
            onContentChange={(v) => { setEditContent(v); setDirty(true) }}
            onBodyChange={(v) => { setEditBodyMd(v); setDirty(true) }}
            onModeChange={setEditMode}
            onSave={saveEdits}
            onClose={() => setSelectedNoteId(null)}
            onPin={() => togglePin(selectedNote)}
            onDelete={() => deleteNote(selectedNote)}
            onMove={(targetId) => moveNote(selectedNote.id, targetId)}
            onOpenMove={() => setMoveDialogOpen(true)}
            onCloseMove={() => setMoveDialogOpen(false)}
            onUploadClick={() => fileInputRef.current?.click()}
            onDeleteAttachment={(idx) => deleteAttachment(selectedNote.id, idx)}
            onToggleHideFromHome={() => toggleHideFromHome(selectedNote)}
            onShowHistory={() => setHistoryNoteId(selectedNote.id)}
            onMoveToVault={() => {
              // Pre-fill the vault dialog with the note's body (the actual
              // sensitive content). Dialog will encrypt + create vault entry
              // + delete the source note on success.
              const noteName = previewTitle(selectedNote).replace(/^🔒\s*/, '')
              const value = (selectedNote.body_md || selectedNote.content || '').trim()
              const kind: 'password' | 'note' | 'card' | 'secret' =
                /password|pin|code|key/i.test(noteName) ? 'password' : 'note'
              setVaultMigrate({
                noteId: selectedNote.id,
                name: noteName || 'Secret',
                value,
                kind,
              })
            }}
          />
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleUpload(f)
          e.target.value = ''
        }}
      />

      {/* Vault migration dialog — encrypts sensitive note → vault entry → deletes note */}
      <VaultUnlockDialog
        open={vaultMigrate !== null}
        payload={vaultMigrate}
        deleteNoteOnSuccess={vaultMigrate?.noteId ?? null}
        onClose={() => setVaultMigrate(null)}
        onSuccess={() => {
          const migratedId = vaultMigrate?.noteId
          setVaultMigrate(null)
          if (migratedId) {
            setNotes((prev) => prev.filter((n) => n.id !== migratedId))
            if (selectedNoteId === migratedId) setSelectedNoteId(null)
          }
          toast.success('Encrypted into Vault — source note removed')
        }}
      />

      {/* Note version history dialog */}
      <NoteHistoryDialog
        open={historyNoteId !== null}
        noteId={historyNoteId}
        noteName={historyNoteId ? previewTitle(byId.get(historyNoteId) ?? { content: 'Untitled' } as Note) : undefined}
        onClose={() => setHistoryNoteId(null)}
        onRestored={(restoredNote) => {
          // Replace the note in state with the restored version
          const r = restoredNote as Note
          setNotes((prev) => prev.map((n) => (n.id === r.id ? r : n)))
        }}
      />
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function NoteListItem({
  note, selected, onClick, onPin, onDelete,
}: {
  note: Note
  selected: boolean
  onClick: () => void
  onPin: () => void
  onDelete: () => void
}) {
  const isFolder = note.is_folder
  const Icon = isFolder ? Folder : FileText
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 8px',
        borderRadius: 8,
        background: selected ? 'var(--morning)' : (note.meta?.pinned ? 'var(--surface-2, var(--surface))' : 'transparent'),
        cursor: 'pointer',
        border: selected ? '1px solid var(--accent)' : '1px solid transparent',
      }}
      onClick={onClick}
    >
      <Icon size={13} color={isFolder ? 'var(--accent)' : 'var(--text-3)'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, color: 'var(--text)', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {previewTitle(note)}
        </div>
        {!isFolder && note.body_md && (
          <div style={{
            fontSize: 10.5, color: 'var(--text-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginTop: 1,
          }}>
            {note.body_md.replace(/[#*`_~>]/g, '').slice(0, 60)}
          </div>
        )}
        {note.attachments && note.attachments.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 10, color: 'var(--text-3)', marginTop: 1,
          }}>
            <Paperclip size={9} /> {note.attachments.length}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPin() }}
        style={{ ...iconBtn, color: note.meta?.pinned ? 'var(--accent)' : 'var(--text-3)' }}
        title={note.meta?.pinned ? 'Unpin' : 'Pin'}
      >
        {note.meta?.pinned ? <PinOff size={11} /> : <Pin size={11} />}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        style={iconBtn}
        title="Delete"
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

interface NoteEditorProps {
  note: Note
  editTitle: string
  editContent: string
  editBodyMd: string
  editMode: 'preview' | 'edit'
  dirty: boolean
  saving: boolean
  uploading: boolean
  allFolders: Note[]
  moveDialogOpen: boolean
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
  onBodyChange: (v: string) => void
  onModeChange: (m: 'preview' | 'edit') => void
  onSave: () => void
  onClose: () => void
  onPin: () => void
  onDelete: () => void
  onMove: (targetId: string | null) => void
  onOpenMove: () => void
  onCloseMove: () => void
  onUploadClick: () => void
  onDeleteAttachment: (idx: number) => void
  onMoveToVault: () => void
  onToggleHideFromHome: () => void
  onShowHistory: () => void
}

function NoteEditor(props: NoteEditorProps) {
  const { note, editTitle, editContent, editBodyMd, editMode, dirty, saving, uploading } = props
  const showBody = !!editBodyMd || editMode === 'edit'

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 16,
      minHeight: 0, overflow: 'auto',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 6, paddingBottom: 8, borderBottom: '0.5px solid var(--border)',
      }}>
        <button type="button" onClick={props.onClose} style={iconBtnLarge} title="Close">
          <ArrowLeft size={14} />
        </button>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => props.onModeChange(editMode === 'preview' ? 'edit' : 'preview')}
            style={editMode === 'edit' ? btnPrimary : btnSecondary}
            title={editMode === 'preview' ? 'Edit (E)' : 'Preview'}
          >
            {editMode === 'preview' ? <Pencil size={11} /> : <Eye size={11} />}
            {editMode === 'preview' ? 'Edit' : 'Preview'}
          </button>
          <button type="button" onClick={props.onUploadClick} disabled={uploading} style={btnSecondary}>
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}
            Attach
          </button>
          {/* Move to Vault — only shown if note is tagged 'sensitive' */}
          {note.tags?.includes('sensitive') && (
            <button
              type="button"
              onClick={props.onMoveToVault}
              style={{ ...btnSecondary, color: 'var(--accent)', borderColor: 'var(--accent)' }}
              title="Encrypt this note's content into your Vault and delete the note"
            >
              <Lock size={11} /> Move to Vault
            </button>
          )}
          <button type="button" onClick={props.onOpenMove} style={btnSecondary} title="Move">
            <Move size={11} /> Move
          </button>
          <button
            type="button"
            onClick={props.onPin}
            style={btnSecondary}
            title="Pin floats this note to the top of the workspace list (still shows on home — use Hide-from-home for that)"
          >
            {note.meta?.pinned ? <PinOff size={11} /> : <Pin size={11} />}
            {note.meta?.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            onClick={props.onToggleHideFromHome}
            style={btnSecondary}
            title={note.meta?.hideFromHome
              ? 'Currently hidden from home — click to show again'
              : 'Hide this note from the home dashboard Notes widget'}
          >
            {note.meta?.hideFromHome ? <Eye size={11} /> : <EyeOff size={11} />}
            {note.meta?.hideFromHome ? 'Show on home' : 'Hide from home'}
          </button>
          <button
            type="button"
            onClick={props.onShowHistory}
            style={btnSecondary}
            title="View previous versions and restore any of them"
          >
            <History size={11} /> History
          </button>
          <button type="button" onClick={props.onDelete} style={btnSecondary} title="Delete"
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-2)' }}
          >
            <Trash2 size={11} />
          </button>
          <button
            type="button"
            onClick={props.onSave}
            disabled={!dirty || saving}
            style={{
              ...btnPrimary,
              opacity: dirty ? 1 : 0.4,
              cursor: dirty && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Save
          </button>
        </div>
      </div>

      {/* Title */}
      <input
        type="text"
        value={editTitle}
        onChange={(e) => props.onTitleChange(e.target.value)}
        placeholder="Title (optional)"
        maxLength={200}
        style={{
          fontSize: 18, fontWeight: 600,
          border: 'none', outline: 'none',
          background: 'transparent', color: 'var(--text)',
          padding: '4px 0',
        }}
      />

      {/* One-line summary (for list display) */}
      <input
        type="text"
        value={editContent}
        onChange={(e) => props.onContentChange(e.target.value)}
        placeholder="Quick summary (shows in list)"
        maxLength={500}
        style={{
          fontSize: 12, color: 'var(--text-2)',
          border: 'none', outline: 'none',
          background: 'transparent',
          padding: '2px 0',
        }}
      />

      {/* Body: edit or preview */}
      {showBody && (
        editMode === 'edit' ? (
          <textarea
            value={editBodyMd}
            onChange={(e) => props.onBodyChange(e.target.value)}
            placeholder="Write your note in markdown… &#10;# Heading&#10;**bold** *italic*&#10;- bullet&#10;[link](url)"
            style={{
              flex: 1, minHeight: 240,
              fontSize: 13.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              border: '1px solid var(--border)', borderRadius: 8,
              padding: 12, outline: 'none', resize: 'vertical',
              background: 'var(--surface-2, var(--surface))', color: 'var(--text)',
              lineHeight: 1.6,
            }}
          />
        ) : (
          <div className="md-body" style={{
            flex: 1, minHeight: 100,
            fontSize: 14, lineHeight: 1.65,
            color: 'var(--text)',
          }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {editBodyMd || '*No content yet. Switch to Edit to start writing.*'}
            </ReactMarkdown>
          </div>
        )
      )}

      {/* Attachments */}
      {note.attachments && note.attachments.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '0.5px solid var(--border)', paddingTop: 12 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
          }}>
            Attachments ({note.attachments.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {note.attachments.map((a, i) => (
              <AttachmentRow
                key={a.path}
                noteId={note.id}
                idx={i}
                attachment={a}
                onDelete={() => props.onDeleteAttachment(i)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Move dialog */}
      {props.moveDialogOpen && (
        <MoveDialog
          note={note}
          folders={props.allFolders}
          onCancel={props.onCloseMove}
          onMove={props.onMove}
        />
      )}

      {/* Metadata footer */}
      <div style={{
        marginTop: 'auto', paddingTop: 8,
        fontSize: 10, color: 'var(--text-3)',
        borderTop: '0.5px solid var(--border)',
      }}>
        Created {formatDateTime(note.created_at)}
        {note.updated_at !== note.created_at && ` · edited ${relativeTime(note.updated_at)}`}
        {dirty && ' · unsaved changes'}
      </div>
    </div>
  )
}

function AttachmentRow({
  noteId, idx, attachment, onDelete,
}: {
  noteId: string
  idx: number
  attachment: Attachment
  onDelete: () => void
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const Icon = mimeIcon(attachment.mime)
  const isImage = attachment.mime.startsWith('image/')
  const isPdf = attachment.mime === 'application/pdf'
  const canPreview = isImage || isPdf

  const loadUrl = useCallback(async () => {
    if (signedUrl) return signedUrl
    setLoading(true)
    try {
      const res = await fetch(`/api/notes/${noteId}/attachment/${idx}`)
      if (!res.ok) throw new Error()
      const { url } = await res.json() as { url: string }
      setSignedUrl(url)
      return url
    } catch {
      toast.error('Could not get file URL')
      return null
    } finally {
      setLoading(false)
    }
  }, [signedUrl, noteId, idx])

  const handleOpen = async () => {
    const u = await loadUrl()
    if (u) window.open(u, '_blank')
  }
  const handlePreview = async () => {
    const u = await loadUrl()
    if (u) setPreviewOpen(true)
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        border: '1px solid var(--border)', borderRadius: 8,
        background: 'var(--surface)',
      }}>
        <Icon size={14} color="var(--text-2)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, color: 'var(--text)', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {attachment.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {formatBytes(attachment.size)} · {relativeTime(attachment.uploaded_at)}
          </div>
        </div>
        {canPreview && (
          <button type="button" onClick={handlePreview} style={iconBtn} title="Preview" disabled={loading}>
            <Maximize2 size={11} />
          </button>
        )}
        <button type="button" onClick={handleOpen} style={iconBtn} title="Open" disabled={loading}>
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
        </button>
        <button type="button" onClick={onDelete} style={iconBtn} title="Remove"
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Preview modal */}
      {previewOpen && signedUrl && (
        <div
          onClick={() => setPreviewOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 12,
              maxWidth: '95vw', maxHeight: '95vh',
              width: isPdf ? '900px' : 'auto',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                {attachment.name}
              </div>
              <button type="button" onClick={() => setPreviewOpen(false)} style={iconBtnLarge}>
                <X size={14} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: '#1a1a1a' }}>
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signedUrl} alt={attachment.name} style={{
                  display: 'block', maxWidth: '100%', maxHeight: '85vh', margin: '0 auto',
                }} />
              ) : isPdf ? (
                <iframe
                  src={signedUrl}
                  title={attachment.name}
                  style={{ border: 'none', width: '100%', height: '85vh' }}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MoveDialog({
  note, folders, onCancel, onMove,
}: {
  note: Note
  folders: Note[]
  onCancel: () => void
  onMove: (targetId: string | null) => void
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 12,
          padding: 16, width: 360, maxWidth: '95vw',
          maxHeight: '70vh', overflow: 'auto',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          Move &ldquo;{previewTitle(note)}&rdquo;
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
          Pick a folder to move this {note.is_folder ? 'folder' : 'note'} into.
        </div>
        <button
          type="button"
          onClick={() => onMove(null)}
          style={{
            ...btnSecondary, width: '100%',
            justifyContent: 'flex-start', padding: '8px 10px',
          }}
        >
          <FolderSymlink size={12} /> Workspace (root)
        </button>
        {folders.filter((f) => f.id !== note.id).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onMove(f.id)}
            style={{
              ...btnSecondary, width: '100%', marginTop: 4,
              justifyContent: 'flex-start', padding: '8px 10px',
            }}
          >
            <Folder size={12} /> {previewTitle(f)}
          </button>
        ))}
        <button type="button" onClick={onCancel} style={{
          ...btnSecondary, width: '100%', marginTop: 12,
          justifyContent: 'center', color: 'var(--text-3)',
        }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Helper: collect all folders (flat) ────────────────────────────────────────

// Memoize-with-naming-collision-avoidance — this function name is just to make
// the intent obvious; React's `useMemo` is used inside the main component.
function useMemo_filter_folders(notes: Note[]): Note[] {
  // Stable shallow-equality memoization via JSON key. Cheap for <1000 notes.
  // (Caller calls every render; the body is O(n).)
  return notes.filter((n) => n.is_folder).sort((a, b) =>
    previewTitle(a).localeCompare(previewTitle(b)),
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 11px', fontSize: 11, fontWeight: 500,
  background: 'var(--accent)', color: '#fff',
  border: 'none', borderRadius: 7,
  cursor: 'pointer', fontFamily: 'inherit',
}

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 10px', fontSize: 11, fontWeight: 500,
  background: 'var(--surface)', color: 'var(--text-2)',
  border: '1px solid var(--border)', borderRadius: 7,
  cursor: 'pointer', fontFamily: 'inherit',
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22,
  background: 'transparent', color: 'var(--text-3)',
  border: 'none', borderRadius: 5,
  cursor: 'pointer', padding: 0,
}

const iconBtnLarge: React.CSSProperties = {
  ...iconBtn,
  width: 28, height: 28,
}

const crumbBtn: React.CSSProperties = {
  background: 'transparent', border: 'none',
  fontSize: 11, color: 'var(--text-2)',
  cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
  fontFamily: 'inherit',
}
