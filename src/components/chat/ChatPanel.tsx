'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Loader2, Sparkles, Mic, MicOff, BookmarkPlus, Lightbulb, Trash2, Zap, Search as SearchIcon, MessageSquare, FileText, CalendarDays, FolderOpen, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import { generateId } from '@/lib/utils'
import ChatMessage from './ChatMessage'
import VaultUnlockDialog from '@/components/chat/VaultUnlockDialog'
import type { Note, Task } from '@/lib/types'

type ChatMode = 'talk' | 'capture' | 'search' | 'ask'

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRec
    webkitSpeechRecognition?: new () => SpeechRec
  }
}

interface SpeechResultItem {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechResultEvent {
  results: SpeechResultItem[] & { length: number }
}

interface SpeechRec extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((ev: SpeechResultEvent) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}

const EXPLAIN_KEY = 'jalayu_chat_explain'

export default function ChatPanel() {
  const {
    showChatPanel,
    setShowChatPanel,
    chatMessages,
    addChatMessage,
    updateLastChatMessage,
    setChatMessages,
    profile,
    addTask,
    addReminder,
    addNote,
    setTodayMood,
  } = useStore()
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [explainWhy, setExplainWhy] = useState(false)
  const [listening, setListening] = useState(false)
  const [mode, setMode] = useState<ChatMode>('talk')
  // Sensitive content captured → opens vault unlock dialog inline in panel
  const [vaultDialog, setVaultDialog] = useState<{ name: string; value: string; kind?: 'password' | 'note' | 'card' | 'secret' } | null>(null)
  const upsertNote = useStore((s) => s.upsertNote)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRec | null>(null)
  // Stores the text that was in the box before voice started, so we can append to it
  const voiceBaseRef = useRef('')
  // Accumulates final (confirmed) transcript segments during a session
  const finalTranscriptRef = useRef('')

  useEffect(() => {
    try {
      setExplainWhy(localStorage.getItem(EXPLAIN_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!showChatPanel) return
    ;(async () => {
      try {
        const res = await fetch('/api/chat/messages?limit=40')
        if (!res.ok) return
        const j = await res.json()
        const mapped = (j.messages || []).map(
          (m: { id: string; role: string; content: string; created_at: string }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.created_at,
          }),
        )
        if (mapped.length) setChatMessages(mapped)
      } catch {
        /* ignore */
      }
    })()
  }, [showChatPanel, setChatMessages])

  useEffect(() => {
    if (showChatPanel) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [showChatPanel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Auto-grow textarea height as the user types (capped at maxHeight)
  useEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    // Reset so scrollHeight reflects actual content height accurately
    ta.style.height = 'auto'
    const next = Math.min(ta.scrollHeight, 160)
    ta.style.height = Math.max(next, 60) + 'px'
  }, [input, mode])

  const toggleExplain = () => {
    setExplainWhy((v) => {
      const n = !v
      try {
        localStorage.setItem(EXPLAIN_KEY, n ? '1' : '0')
      } catch {
        /* ignore */
      }
      return n
    })
  }

  const persistMessages = async (userContent: string, assistantContent: string) => {
    try {
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: userContent },
            { role: 'assistant', content: assistantContent },
          ],
        }),
      })
    } catch {
      /* ignore */
    }
  }

  const saveTakeaway = async () => {
    const last = [...chatMessages].reverse().find((m) => m.role === 'assistant' && m.content.trim())
    if (!last?.content.trim()) {
      toast.error('No assistant message to save yet')
      return
    }
    const line = window.prompt('Save as memory (one line):', last.content.slice(0, 200))
    if (!line?.trim()) return
    const res = await fetch('/api/chat/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fact: line.trim() }),
    })
    if (res.ok) toast.success('Saved to long-term memory')
    else toast.error('Could not save')
  }

  /**
   * Clear chat history. Hold Shift while clicking to also wipe saved memory facts.
   */
  const clearHistory = async (alsoWipeFacts: boolean) => {
    const msg = alsoWipeFacts
      ? 'Wipe EVERYTHING from chat?\n\nThis deletes:\n• All chat messages\n• All facts Jalayu has remembered about you from chat\n\nNotes, tasks, and other data are NOT affected. This cannot be undone.'
      : 'Clear chat history?\n\nMessages will be deleted. Jalayu keeps any facts it has remembered about you (you can wipe those too by holding Shift when you click Clear). This cannot be undone.'
    if (!confirm(msg)) return
    try {
      const url = alsoWipeFacts ? '/api/chat/messages?facts=1' : '/api/chat/messages'
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('clear failed')
      setChatMessages([])
      const json = await res.json() as { facts_deleted?: number }
      toast.success(
        alsoWipeFacts && json.facts_deleted
          ? `Cleared chat + ${json.facts_deleted} facts`
          : 'Chat cleared',
      )
    } catch {
      toast.error('Could not clear')
    }
  }

  const stopVoice = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  const startVoice = async () => {
    // If already listening — stop and let user review
    if (listening) {
      stopVoice()
      return
    }

    // Check for API support (standard first, webkit fallback)
    const SR =
      typeof window !== 'undefined'
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null

    if (!SR) {
      toast.error('Voice input isn\'t supported in this browser. Try Chrome.')
      return
    }

    // Request mic permission explicitly — this triggers the browser's native dialog
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Immediately release — we just needed to prompt for permission
      stream.getTracks().forEach((t) => t.stop())
    } catch {
      toast.error('Microphone access denied. Enable it in your browser settings and try again.')
      return
    }

    const rec = new SR()
    rec.continuous = true       // keep going until user taps stop
    rec.interimResults = true   // show live transcript as they speak
    rec.lang = profile?.preferred_language || 'en-US'

    // Save what was already in the box
    voiceBaseRef.current = input.trim()
    finalTranscriptRef.current = ''

    rec.onresult = (ev) => {
      let finalChunk = ''
      let interimChunk = ''

      for (let i = 0; i < ev.results.length; i++) {
        const result = ev.results[i]
        if (result.isFinal) {
          finalChunk += result[0].transcript
        } else {
          interimChunk += result[0].transcript
        }
      }

      finalTranscriptRef.current = finalChunk

      // Show base text + confirmed words + live interim in the box
      const base = voiceBaseRef.current
      const combined = [base, finalChunk, interimChunk].filter(Boolean).join(' ')
      setInput(combined)
    }

    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed') {
        toast.error('Microphone blocked. Check your browser permissions.')
      } else if (ev.error !== 'no-speech') {
        toast.error('Voice capture stopped unexpectedly.')
      }
      setListening(false)
    }

    rec.onend = () => {
      // On auto-end (silence): keep the final text, drop any trailing interim
      const base = voiceBaseRef.current
      const final = finalTranscriptRef.current
      const clean = [base, final].filter(Boolean).join(' ').trim()
      if (clean) setInput(clean)
      setListening(false)
      // Focus the textarea so user can review / edit / send
      setTimeout(() => inputRef.current?.focus(), 50)
    }

    recognitionRef.current = rec
    setListening(true)
    rec.start()
  }

  // ── Capture / Search / Ask via /api/ai/route ────────────────────────────
  // Non-talk modes don't stream — they go through the route endpoint and
  // their result gets injected into the chat thread as an assistant message
  // so the user can see what happened and follow up on it.
  const sendViaRoute = async (text: string, requestMode: 'capture' | 'search' | 'ask') => {
    const userMsg = { id: generateId(), role: 'user' as const, content: text, timestamp: new Date().toISOString() }
    addChatMessage(userMsg)
    setInput('')
    setStreaming(true)
    const assistantId = generateId()
    addChatMessage({ id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() })

    try {
      const ctx = useStore.getState().chatContext
      const res = await fetch('/api/ai/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          mode: requestMode === 'ask' ? 'query' : requestMode,
          context: ctx,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Request failed')
      }
      const json = await res.json()

      let summary = ''
      if (json.mode === 'capture') {
        if (json.needsVaultEncryption && json.vaultPayload) {
          summary = `🔒 That looks sensitive. Opening the vault to encrypt it — your PIN never leaves this browser.`
          setVaultDialog(json.vaultPayload)
        } else if (json.executed) {
          const where = json.destLabel || json.destination
          summary = `✓ Saved to **${where}**.`
          // Optimistic store update
          if (json.record) {
            if (json.destination === 'task' || json.destination === 'calendar') {
              addTask(json.record as Task)
            } else {
              addNote(json.record as Note)
            }
          }
        } else if (json.error) {
          summary = `Couldn't save — ${json.error}`
        }
      } else if (json.mode === 'search') {
        const hits = (json.results as Array<{ type: string; title: string; meta?: string; snippet?: string }>) ?? []
        if (hits.length === 0) {
          summary = `No matches for "${text}".`
        } else {
          summary = `Found ${hits.length} ${hits.length === 1 ? 'match' : 'matches'}:\n\n` +
            hits.map((h) => `- **${h.title}** _(${h.meta ?? h.type})_${h.snippet ? `\n  ${h.snippet}` : ''}`).join('\n')
        }
      } else if (json.mode === 'query') {
        summary = json.answer || '(no answer)'
        // Handle inline tool actions (e.g., AI updated a note)
        if (json.action?.ok) {
          summary += `\n\n_✓ ${json.action.message}_`
          if (json.action.note) upsertNote(json.action.note as Note)
        } else if (json.action?.ok === false) {
          summary += `\n\n_⚠ ${json.action.message}_`
        }
      }

      updateLastChatMessage(summary)
      // Persist to chat history so it shows next time the panel opens
      if (summary.trim()) await persistMessages(text, summary.trim())
    } catch (err) {
      updateLastChatMessage(err instanceof Error ? `Error: ${err.message}` : 'Sorry, something went wrong.')
    } finally {
      setStreaming(false)
    }
    void assistantId  // keep for potential future use
  }

  // ── Today's Story — the WOW feature ─────────────────────────────────────
  // Generates a personal narrative of the user's day using ALL their data
  // (notes, tasks, mood, trades, chat, reflection) and saves it as a permanent
  // note in the "📖 Daily Story" folder. Over time → a real lifeline.
  const requestDailyStory = async (regen = false) => {
    if (streaming) return
    setStreaming(true)
    const today = new Date()
    const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const userMsg = {
      id: generateId(),
      role: 'user' as const,
      content: regen ? `Re-generate today's story` : `Tell me today's story`,
      timestamp: new Date().toISOString(),
    }
    addChatMessage(userMsg)
    const assistantId = generateId()
    addChatMessage({ id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() })
    try {
      const date = today.toISOString().split('T')[0]
      const url = `/api/ai/daily-story?date=${date}${regen ? '&regen=1' : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Story generation failed')
      const json = await res.json() as {
        story: string
        cached?: boolean
        empty?: boolean
        note?: Record<string, unknown>
      }
      let display = ''
      if (json.empty) {
        display = json.story
      } else {
        const header = json.cached
          ? `**${dateLabel}** _(saved earlier today — ask me to regenerate if you want a fresh version)_\n\n`
          : `**${dateLabel}**\n\n`
        display = header + json.story
        display += `\n\n_📖 Saved to your **Daily Story** folder._`
      }
      updateLastChatMessage(display)
      if (json.note) upsertNote(json.note as unknown as Note)
      if (display.trim()) await persistMessages(userMsg.content, display.trim())
    } catch {
      updateLastChatMessage('Sorry, could not generate today\'s story. Try again in a moment.')
    } finally {
      setStreaming(false)
    }
    void assistantId
  }

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return

    // Branch on mode: Talk uses the streaming chat endpoint; everything else
    // routes through /api/ai/route and renders its result inline in the thread.
    if (mode !== 'talk') {
      await sendViaRoute(text, mode)
      return
    }

    const userMsg = { id: generateId(), role: 'user' as const, content: text, timestamp: new Date().toISOString() }
    addChatMessage(userMsg)
    setInput('')
    setStreaming(true)

    const assistantId = generateId()
    addChatMessage({ id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() })

    let accumulated = ''
    try {
      // Fire action detection in parallel — handle results to keep store in sync
      const recentCtx = [...chatMessages, userMsg]
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 600) }))
      fetch('/api/ai/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, recentMessages: recentCtx }),
      })
        .then((r) => r.json())
        .then((result: { executed?: Array<{ type: string; data: Record<string, unknown>; message: string }> }) => {
          if (result.executed?.length) {
            import('@/lib/apply-ai-actions').then(({ applyAiActions }) => applyAiActions(result.executed!))
          }
        })
        .catch(() => {})

      // Include current screen context so Jalayu knows what "this folder",
      // "the note I'm looking at", "what I have here" refer to.
      const ctx = useStore.getState().chatContext

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          explainWhy,
          context: ctx,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Stream error')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        updateLastChatMessage(accumulated)
      }

      if (accumulated.trim()) {
        await persistMessages(text, accumulated.trim())
      }
    } catch {
      updateLastChatMessage('Sorry, something went wrong. Please try again.')
    } finally {
      setStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const name = profile?.nickname || profile?.full_name || 'you'

  return (
    <>
    <style>{`
      @keyframes micRipple {
        0%   { transform: scale(1);   opacity: 0.5; }
        100% { transform: scale(2.2); opacity: 0;   }
      }
      @keyframes micDotBlink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.3; }
      }
    `}</style>
    <AnimatePresence>
      {showChatPanel && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowChatPanel(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(28,25,23,0.25)',
              zIndex: 50,
            }}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 'min(420px, 100vw)',
              background: 'var(--bg)',
              borderLeft: '1px solid var(--border)',
              zIndex: 51,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(28,25,23,0.15)',
                  }}
                >
                  <Sparkles size={13} color="#fff" />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0 }}>Ask Jalayu</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>Your personal AI companion</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={toggleExplain}
                  title="Explain recommendations with one Because line"
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: explainWhy ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: explainWhy ? 'var(--morning)' : 'var(--surface-2)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    color: 'var(--accent)',
                  }}
                >
                  <Lightbulb size={12} />
                  Why
                </button>
                <button
                  type="button"
                  onClick={saveTakeaway}
                  title="Save takeaway"
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    cursor: 'pointer',
                  }}
                >
                  <BookmarkPlus size={14} color="var(--accent)" />
                </button>
                <button
                  type="button"
                  onClick={(e) => clearHistory(e.shiftKey)}
                  title="Clear chat history (hold Shift to also wipe saved facts)"
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={14} color="var(--text-2)" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowChatPanel(false)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} color="var(--text-2)" />
                </button>
              </div>
            </div>

            {/* Mode tabs — single surface for Talk / Capture / Search / Ask */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 2,
              padding: '4px 8px 0',
              background: 'var(--surface)',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              {([
                { id: 'talk',    icon: MessageSquare, label: 'Talk',    color: 'var(--accent)' },
                { id: 'capture', icon: Zap,           label: 'Capture', color: '#0A7B6A' },
                { id: 'search',  icon: SearchIcon,    label: 'Search',  color: '#3B82F6' },
                { id: 'ask',     icon: Sparkles,      label: 'Ask',     color: '#8B5CF6' },
              ] as const).map((tab) => {
                const Icon = tab.icon
                const active = mode === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMode(tab.id)}
                    style={{
                      padding: '6px 10px', fontSize: 11, fontWeight: 500,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: active ? tab.color : 'var(--text-3)',
                      borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
                      marginBottom: -1, display: 'flex', alignItems: 'center', gap: 4,
                      fontFamily: 'inherit',
                    }}
                  >
                    <Icon size={11} /> {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Today's Story — the marquee feature. Always visible at top when
                thread is empty, in any mode. Click → generates a personal
                narrative of the user's day from ALL their data. */}
            {chatMessages.length === 0 && (
              <div style={{
                padding: '10px 12px',
                background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(217,119,87,0.05))',
                borderBottom: '1px solid var(--border)',
              }}>
                <button
                  type="button"
                  onClick={() => void requestDailyStory(false)}
                  disabled={streaming}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 10,
                    cursor: streaming ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s, transform 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#8B5CF6'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-2)'
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 9,
                    background: 'linear-gradient(135deg, #8B5CF6, #D97757)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <BookOpen size={14} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      Today&apos;s Story
                      <span style={{
                        fontSize: 9, fontWeight: 500,
                        padding: '1px 6px', borderRadius: 4,
                        background: 'linear-gradient(90deg, #8B5CF6, #D97757)',
                        color: '#fff',
                      }}>NEW</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>
                      A narrative of your day — written from your actual notes, tasks, trades, mood
                    </div>
                  </div>
                  {streaming
                    ? <Loader2 size={13} className="animate-spin" color="var(--text-3)" />
                    : <Sparkles size={13} color="#8B5CF6" />
                  }
                </button>
              </div>
            )}

            {/* Quick prompt chips — "Brief Me" feature */}
            {mode === 'ask' && chatMessages.length === 0 && (
              <div style={{
                padding: '10px 12px',
                background: 'var(--surface)',
                borderBottom: '1px solid var(--border)',
                display: 'flex', flexWrap: 'wrap', gap: 6,
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', width: '100%', marginBottom: 2 }}>
                  Quick briefs:
                </div>
                {[
                  { label: 'Today', icon: CalendarDays, prompt: 'Brief me on today — where do I stand right now? Mood + tasks + calendar + the ONE thing I should focus on next. Keep it under 200 words.' },
                  { label: 'This week', icon: CalendarDays, prompt: 'Give me a brief on this week — what have I been working on, mood patterns, what got done, what stalled. Use my recent notes and trades. Under 300 words.' },
                  { label: 'Current folder', icon: FolderOpen, prompt: 'Brief me on the folder I currently have open: TLDR of what\'s in it, latest activity, open questions I wrote about, suggested next step.' },
                  { label: 'What\'s stale', icon: FileText, prompt: 'What have I been ignoring? Look through my notes/folders and tell me what\'s been quiet — projects I haven\'t touched in a while, things I wrote follow-up notes about but never followed up on, decisions I tracked but never resolved.' },
                ].map((chip) => {
                  const Icon = chip.icon
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => {
                        setInput(chip.prompt)
                        // Auto-send after a tick so the user sees the input update
                        setTimeout(() => {
                          void sendViaRoute(chip.prompt, 'ask')
                        }, 50)
                      }}
                      disabled={streaming}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', fontSize: 11, fontWeight: 500,
                        background: 'var(--surface-2, var(--surface))', color: 'var(--text-2)',
                        border: '1px solid var(--border)', borderRadius: 999,
                        cursor: streaming ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Icon size={10} /> Brief: {chip.label}
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', paddingTop: 40 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: 'var(--morning)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 14px',
                      boxShadow: 'none',
                    }}
                  >
                    <Sparkles size={20} color="var(--accent)" />
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Hey, {name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 260, margin: '0 auto 20px' }}>
                    I know your goals, struggles, and daily patterns. Ask me anything — I&apos;m built for you specifically.
                  </p>
                  {['How am I doing this week?', 'What should I focus on right now?', 'Help me with my energy levels'].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setInput(suggestion)
                        inputRef.current?.focus()
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        margin: '0 auto 8px',
                        maxWidth: 280,
                        padding: '9px 14px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        fontSize: 12,
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {chatMessages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {streaming && chatMessages[chatMessages.length - 1]?.role === 'assistant' && !chatMessages[chatMessages.length - 1]?.content && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <div
                    style={{
                      padding: '9px 12px',
                      borderRadius: '12px 12px 12px 2px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      gap: 4,
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          display: 'inline-block',
                          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-end',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              {/* ── Mic button ── */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {/* Ripple rings when recording */}
                {listening && (
                  <>
                    <span style={{
                      position: 'absolute', inset: 0, borderRadius: 10,
                      background: 'rgba(220,38,38,0.15)',
                      animation: 'micRipple 1.4s ease-out infinite',
                      pointerEvents: 'none',
                    }} />
                    <span style={{
                      position: 'absolute', inset: 0, borderRadius: 10,
                      background: 'rgba(220,38,38,0.1)',
                      animation: 'micRipple 1.4s ease-out 0.5s infinite',
                      pointerEvents: 'none',
                    }} />
                  </>
                )}
                <button
                  type="button"
                  onClick={startVoice}
                  disabled={streaming}
                  title={listening ? 'Tap to stop recording' : 'Tap to speak'}
                  style={{
                    position: 'relative',
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: listening ? '1.5px solid rgba(220,38,38,0.4)' : '1px solid var(--border)',
                    background: listening ? 'rgba(220,38,38,0.06)' : 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: streaming ? 'not-allowed' : 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                    zIndex: 1,
                  }}
                >
                  {listening ? (
                    <MicOff size={15} color="#DC2626" />
                  ) : (
                    <Mic size={15} color="var(--text-2)" />
                  )}
                </button>
              </div>
              {/* Recording indicator pill */}
              {listening && (
                <div style={{
                  position: 'absolute',
                  bottom: 58,
                  left: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--surface)',
                  border: '1px solid rgba(220,38,38,0.25)',
                  borderRadius: 99,
                  padding: '5px 10px',
                  fontSize: 11,
                  color: '#DC2626',
                  fontWeight: 500,
                  pointerEvents: 'none',
                  boxShadow: '0 2px 8px rgba(28,25,23,0.08)',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#DC2626',
                    animation: 'micDotBlink 1.1s ease-in-out infinite',
                  }} />
                  Listening… tap mic to stop
                </div>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  listening ? 'Listening — speak now…' :
                  mode === 'capture' ? 'Type a thought — Jalayu routes it' :
                  mode === 'search'  ? 'Search notes, tasks, vault…' :
                  mode === 'ask'     ? 'Ask anything — uses your data' :
                  `Talk to Jalayu, ${name}…`
                }
                rows={2}
                style={{
                  flex: 1,
                  resize: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: 13,
                  color: 'var(--text)',
                  background: 'var(--surface-2)',
                  outline: 'none',
                  lineHeight: 1.5,
                  minHeight: 60,
                  maxHeight: 160,
                  overflowY: 'auto',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
              <button
                type="button"
                onClick={send}
                disabled={!input.trim() || streaming}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: input.trim() && !streaming ? 'var(--accent)' : 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: input.trim() && !streaming ? 'pointer' : 'not-allowed',
                  flexShrink: 0,
                  transition: 'background 0.15s',
                  boxShadow: 'none',
                }}
              >
                {streaming ? (
                  <Loader2 size={14} color={input.trim() ? '#fff' : 'var(--text-3)'} className="animate-spin" />
                ) : (
                  <Send size={14} color={input.trim() ? '#fff' : 'var(--text-3)'} />
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    {/* Vault unlock for sensitive captures (mode === 'capture' with vault_hint) */}
    <VaultUnlockDialog
      open={vaultDialog !== null}
      payload={vaultDialog}
      onClose={() => setVaultDialog(null)}
      onSuccess={() => {
        setVaultDialog(null)
        toast.success('Encrypted to vault')
      }}
    />
    </>
  )
}
