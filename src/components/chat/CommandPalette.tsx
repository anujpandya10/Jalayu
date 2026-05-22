'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Loader2, Mic, Send, X, Search, Sparkles, Zap,
  CheckSquare, StickyNote, Calendar as CalendarIcon, Bell,
  Smile, Shield, TrendingUp, ArrowRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import type { SidebarView, Note, Task } from '@/lib/types'
import VaultUnlockDialog from '@/components/chat/VaultUnlockDialog'

type Mode = 'capture' | 'search' | 'query'

interface SearchHit {
  type: 'note' | 'task' | 'vault'
  id: string
  title: string
  snippet?: string
  meta?: string
}

interface Classification {
  destination: string
  title?: string
  body?: string
  confidence?: number
  reason?: string
  is_sensitive?: boolean
}

const DEST_META: Record<string, { icon: typeof CheckSquare; label: string; color: string }> = {
  task:          { icon: CheckSquare, label: 'Task',         color: '#10B981' },
  note:          { icon: StickyNote,  label: 'Note',         color: '#D97757' },
  calendar:      { icon: CalendarIcon, label: 'Calendar',    color: '#3B82F6' },
  reminder:      { icon: Bell,        label: 'Reminder',     color: '#F59E0B' },
  mood:          { icon: Smile,       label: 'Mood',         color: '#EC4899' },
  vault_hint:    { icon: Shield,      label: 'Notes (sensitive)', color: '#8B5CF6' },
  trading_note:  { icon: TrendingUp,  label: 'Trading',      color: '#0EA5E9' },
}

// SpeechRecognition globals are declared in ChatPanel.tsx — reuse the shape here.
interface SR extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
}

function getSpeechRecognition(): (new () => SR) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
  return w.SpeechRecognition || w.webkitSpeechRecognition
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  /** If set, opens directly in voice mode (skips typing). */
  voiceOnOpen?: boolean
}

export default function CommandPalette({ open, onClose, voiceOnOpen }: CommandPaletteProps) {
  const { chatContext, setSidebarView, addNote, upsertNote, addTask } = useStore()

  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('capture')
  const [autoMode, setAutoMode] = useState(true)  // mode auto-detects unless user toggles
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchHit[]>([])
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null)
  const [classification, setClassification] = useState<Classification | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)
  // Vault encryption dialog state — appears when AI classifies as sensitive
  const [vaultDialog, setVaultDialog] = useState<{ name: string; value: string; kind?: 'password' | 'note' | 'card' | 'secret' } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SR | null>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setText('')
      setMode('capture')
      setAutoMode(true)
      setSearchResults([])
      setQueryAnswer(null)
      setClassification(null)
      setNeedsConfirm(false)
      setTimeout(() => inputRef.current?.focus(), 50)
      if (voiceOnOpen) {
        setTimeout(() => startVoice(), 100)
      }
    } else {
      stopVoice()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, voiceOnOpen])

  // Auto-grow textarea height based on content (capped at 200px)
  useEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [text])

  // Auto-detect mode while typing
  useEffect(() => {
    if (!autoMode) return
    const t = text.trim().toLowerCase()
    if (!t) return setMode('capture')
    if (
      /^(what|why|how|when|where|who)\b/.test(t) ||
      /\bwhat now\b|\bwhat should i\b|\bwhat'?s next\b/.test(t) ||
      t.endsWith('?')
    ) {
      setMode('query')
    } else if (/^(find|search|look up|show me|where is)\b/.test(t)) {
      setMode('search')
    } else {
      setMode('capture')
    }
  }, [text, autoMode])

  // Esc to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // ── Voice ────────────────────────────────────────────────────────────────
  const startVoice = () => {
    if (listening) { stopVoice(); return }
    const SRClass = getSpeechRecognition()
    if (!SRClass) {
      toast.error('Voice not supported on this browser')
      return
    }
    const rec = new SRClass()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      let final = ''
      // ArrayLike — has length but no for-of by default in our shim type
      const len = (e.results as { length: number }).length
      for (let i = 0; i < len; i++) {
        final += e.results[i][0].transcript
      }
      setText(final)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  const stopVoice = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  const submit = useCallback(async (overrideMode?: Mode) => {
    const value = text.trim()
    if (!value || busy) return
    stopVoice()
    setBusy(true)
    setSearchResults([])
    setQueryAnswer(null)
    setClassification(null)
    setNeedsConfirm(false)
    try {
      const res = await fetch('/api/ai/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: value,
          mode: overrideMode ?? mode,
          context: chatContext,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Request failed')
      }
      const json = await res.json()

      if (json.mode === 'search') {
        setSearchResults(json.results ?? [])
        if ((json.results ?? []).length === 0) toast('No matches', { icon: '🔍' })
      } else if (json.mode === 'query') {
        setQueryAnswer(json.answer ?? '')
        // If the AI took an action (e.g., updated a note), show a toast
        // and update the store so the workspace reflects the change immediately
        if (json.action) {
          if (json.action.ok) {
            toast.success(json.action.message || 'Note updated', { duration: 5000 })
            if (json.action.note) upsertNote(json.action.note as Note)
          } else {
            toast.error(json.action.message || 'Action failed')
          }
        }
      } else if (json.mode === 'capture') {
        setClassification(json.classification)
        // Sensitive content path: AI flagged this as needing encryption.
        // Don't save anything yet — open the vault dialog with the value
        // pre-loaded. User unlocks PIN → value gets encrypted client-side
        // → saves to vault_entries → never persisted in plaintext.
        if (json.needsVaultEncryption && json.vaultPayload) {
          setVaultDialog(json.vaultPayload)
          return
        }
        if (json.executed) {
          const dest = json.destLabel || DEST_META[json.destination]?.label || json.destination
          toast.success(`Saved to ${dest}`, { duration: 4000 })
          // Optimistic store update so home/sidebars refresh
          if (json.record) {
            if (json.destination === 'task' || json.destination === 'calendar') {
              addTask(json.record as Task)
            } else if (json.destination === 'note' || json.destination === 'vault_hint' || json.destination === 'trading_note') {
              addNote(json.record as Note)
            }
            // mood/reminder don't have dedicated store actions; the next refresh picks them up
          }
          // Close after a short pause so user sees the toast
          setTimeout(() => onClose(), 600)
        } else if (json.error) {
          toast.error(json.error)
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }, [text, mode, busy, chatContext, addNote, addTask, onClose])

  if (!open) return null

  // ── Render ────────────────────────────────────────────────────────────────
  const modeMeta: Record<Mode, { icon: typeof Zap; label: string; hint: string; color: string }> = {
    capture: { icon: Zap,       label: 'Capture', hint: 'Type any thought — Jalayu picks where it goes',    color: '#0A7B6A' },
    search:  { icon: Search,    label: 'Search',  hint: 'Search across notes, tasks, vault names, calendar', color: '#3B82F6' },
    query:   { icon: Sparkles,  label: 'Ask',     hint: 'Ask a question — get an answer based on your data', color: '#8B5CF6' },
  }
  const M = modeMeta[mode]
  const MIcon = M.icon

  const ctxLabel = chatContext.folderName
    ? `in "${chatContext.folderName}"`
    : chatContext.noteName
    ? `with "${chatContext.noteName}"`
    : null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        zIndex: 10000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 16,
          width: 600, maxWidth: 'calc(100vw - 24px)',
          maxHeight: '76vh',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25), 0 6px 18px rgba(0,0,0,0.08)',
          border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header: mode tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '8px 10px 0', borderBottom: '1px solid var(--border)',
        }}>
          {(['capture', 'search', 'query'] as const).map((m) => {
            const Meta = modeMeta[m]
            const I = Meta.icon
            const active = mode === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setAutoMode(false) }}
                style={{
                  padding: '7px 12px', fontSize: 11.5, fontWeight: 500,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: active ? Meta.color : 'var(--text-3)',
                  borderBottom: active ? `2px solid ${Meta.color}` : '2px solid transparent',
                  marginBottom: -1, display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: 'inherit',
                }}
              >
                <I size={12} /> {Meta.label}
              </button>
            )
          })}
          {ctxLabel && (
            <div style={{
              marginLeft: 'auto', marginBottom: 6,
              fontSize: 10, color: 'var(--text-3)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Sparkles size={10} /> {ctxLabel}
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          padding: '12px 14px', borderBottom: '1px solid var(--border)',
        }}>
          <MIcon size={16} color={M.color} style={{ flexShrink: 0, marginBottom: 7 }} />
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder={M.hint}
            rows={1}
            maxLength={5000}
            style={{
              flex: 1, fontSize: 15,
              border: 'none', outline: 'none',
              background: 'transparent', color: 'var(--text)',
              resize: 'none', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 24, maxHeight: 200,
            }}
          />
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            title={listening ? 'Stop voice' : 'Voice input'}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: listening ? '#EF4444' : 'var(--surface-2)',
              color: listening ? '#fff' : 'var(--text-2)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Mic size={14} />
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={!text.trim() || busy}
            title="Send (Enter)"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: text.trim() && !busy ? M.color : 'var(--surface-2)',
              color: text.trim() && !busy ? '#fff' : 'var(--text-3)',
              border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: text.trim() && !busy ? 'pointer' : 'not-allowed',
              flexShrink: 0,
            }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>

        {/* Result area */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: 14,
          minHeight: text.trim() || busy ? 80 : 60,
        }}>
          {/* Empty hint when nothing typed */}
          {!text.trim() && !busy && !queryAnswer && searchResults.length === 0 && !classification && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7 }}>
              <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-2)' }}>Try:</div>
              <div>• <em>&ldquo;Pay rent on the 1st&rdquo;</em> → task with due date</div>
              <div>• <em>&ldquo;Bob&apos;s daughter just started med school&rdquo;</em> → note</div>
              <div>• <em>&ldquo;Remind me at 8am tomorrow to email Sarah&rdquo;</em> → reminder</div>
              <div>• <em>&ldquo;Feeling foggy today&rdquo;</em> → mood log</div>
              <div>• <em>&ldquo;What should I do right now?&rdquo;</em> → answer based on your data</div>
              <div>• <em>&ldquo;Find notes about FreshDabba&rdquo;</em> → search</div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '0.5px solid var(--border)', fontSize: 10.5, color: 'var(--text-3)' }}>
                <kbd style={kbdStyle}>⌘K</kbd> open · <kbd style={kbdStyle}>Enter</kbd> send · <kbd style={kbdStyle}>Tab</kbd> switch mode · <kbd style={kbdStyle}>Esc</kbd> close
              </div>
            </div>
          )}

          {/* Search results */}
          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {searchResults.map((hit) => (
                <SearchResultRow
                  key={`${hit.type}-${hit.id}`}
                  hit={hit}
                  onJump={() => {
                    if (hit.type === 'note') setSidebarView('notes' as SidebarView)
                    else if (hit.type === 'task') setSidebarView('calendar' as SidebarView)
                    else if (hit.type === 'vault') setSidebarView('vault' as SidebarView)
                    onClose()
                  }}
                />
              ))}
            </div>
          )}

          {/* Query answer */}
          {queryAnswer && (
            <div style={{
              fontSize: 14, lineHeight: 1.65, color: 'var(--text)',
              padding: '6px 2px', whiteSpace: 'pre-wrap',
            }}>
              {queryAnswer}
            </div>
          )}

          {/* Capture classification needing confirm */}
          {classification && needsConfirm && (
            <ConfirmCapture
              classification={classification}
              text={text}
              onPick={(dest) => void submit('capture')}
              onCancel={() => { setClassification(null); setNeedsConfirm(false) }}
            />
          )}
        </div>
      </div>

      {/* Vault unlock dialog — appears when sensitive content is captured */}
      <VaultUnlockDialog
        open={vaultDialog !== null}
        payload={vaultDialog}
        onClose={() => {
          setVaultDialog(null)
          // Don't auto-close palette on cancel — user might want to retype
        }}
        onSuccess={() => {
          setVaultDialog(null)
          // Close palette after successful encryption
          setTimeout(() => onClose(), 300)
        }}
      />
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  padding: '1px 5px', background: 'var(--morning)',
  border: '1px solid var(--border)', borderRadius: 4,
  fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  color: 'var(--text-2)',
}

function SearchResultRow({ hit, onJump }: { hit: SearchHit; onJump: () => void }) {
  const Icon = hit.type === 'note' ? StickyNote
    : hit.type === 'task' ? CheckSquare
    : Shield
  const color = hit.type === 'note' ? '#D97757'
    : hit.type === 'task' ? '#10B981'
    : '#8B5CF6'
  return (
    <button
      type="button"
      onClick={onJump}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '9px 10px', borderRadius: 8,
        background: 'transparent', border: '1px solid transparent',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--morning)'
        e.currentTarget.style.border = '1px solid var(--border)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.border = '1px solid transparent'
      }}
    >
      <Icon size={14} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {hit.title}
        </div>
        {hit.snippet && (
          <div style={{
            fontSize: 11, color: 'var(--text-3)', marginTop: 2,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {hit.snippet}
          </div>
        )}
        {hit.meta && (
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
            {hit.meta}
          </div>
        )}
      </div>
      <ArrowRight size={12} color="var(--text-3)" style={{ marginTop: 2, flexShrink: 0 }} />
    </button>
  )
}

function ConfirmCapture({
  classification, text, onPick, onCancel,
}: {
  classification: Classification
  text: string
  onPick: (dest: string) => void
  onCancel: () => void
}) {
  const D = DEST_META[classification.destination] ?? DEST_META.note
  const Icon = D.icon
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: 'var(--morning)', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
        Not 100% sure — best guess:
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 8,
        background: 'var(--surface)', border: `1px solid ${D.color}`,
      }}>
        <Icon size={16} color={D.color} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{D.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{classification.reason ?? text.slice(0, 80)}</div>
        </div>
        <button type="button" onClick={() => onPick(classification.destination)}
          style={{
            padding: '5px 12px', background: D.color, color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Save here
        </button>
      </div>
      <button type="button" onClick={onCancel}
        style={{
          marginTop: 8, padding: '4px 10px',
          background: 'transparent', border: 'none',
          fontSize: 11, color: 'var(--text-3)', cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  )
}
