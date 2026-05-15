'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Profile, Task, Mood } from '@/lib/types'
import { useStore } from '@/store/useStore'
import { getDayNumber } from '@/lib/utils'
import GalaxyOrb from '@/components/GalaxyOrb'

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

type Reply = { content: string; streaming: boolean }

const MOODS = [
  { score: 1, emoji: '😔', label: 'Rough' },
  { score: 2, emoji: '😕', label: 'Low' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😊', label: 'Great' },
]

type OrbState = 'idle' | 'listening' | 'speaking'

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 22 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--text-3)',
            display: 'inline-block',
            animation: `jdot 1.3s ease-in-out ${i * 0.18}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

export default function HomeContent({
  profile,
  tasks,
  todayMood,
  onMoodLog,
  onAddTask,
  onToggleTask,
  onAction,
}: {
  journeyView?: string
  profile: Profile | null
  tasks: Task[]
  todayMood: Mood | null
  notes?: unknown[]
  moodsRecent?: Mood[]
  daysSinceSignup?: number
  onMoodLog: (score: number) => void
  onAddTask: (title: string) => Promise<void>
  onToggleTask: (task: Task) => Promise<void>
  onAction?: (actions: Array<{ type: string; data: Record<string, unknown>; message: string }>) => void
}) {
  const setShowChatPanel = useStore((s) => s.setShowChatPanel)

  const [morningNote, setMorningNote] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [noteLoading, setNoteLoading] = useState(true)
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [userAnswer, setUserAnswer] = useState('')
  const [reply, setReply] = useState<Reply | null>(null)
  const [sending, setSending] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const newTaskRef = useRef<HTMLInputElement>(null)
  const replyRef = useRef<HTMLDivElement>(null)

  const dayNumber = profile ? getDayNumber(profile.created_at) : 1
  const pendingTasks = tasks.filter((t) => !t.completed)
  const todayStr = new Date().toISOString().split('T')[0]

  // Orb state: speaking while morning note loads, listening while user types, idle otherwise
  const orbState: OrbState = noteLoading ? 'speaking' : input.trim() ? 'listening' : 'idle'

  // Load morning note + focus recommendation from cache or API
  useEffect(() => {
    const userId = profile?.id
    // v2 cache key — includes focus, so busts the old plain-string cache
    const cacheKey = userId ? `jalayu_morning2_${userId}_${todayStr}` : null

    if (cacheKey) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed.note) setMorningNote(parsed.note)
          if (parsed.focus) setFocus(parsed.focus)
          setNoteLoading(false)
          return
        }
      } catch {
        // localStorage unavailable or old format — proceed to fetch
      }
    }

    let cancelled = false
    setNoteLoading(true)

    fetch('/api/ai/morning')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.note) setMorningNote(data.note)
        if (data.focus) setFocus(data.focus)
        if (cacheKey && data.note) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ note: data.note, focus: data.focus || '' }))
          } catch { /* ok */ }
        }
      })
      .catch(() => {
        if (!cancelled) setMorningNote('A new day to work toward what matters.')
      })
      .finally(() => {
        if (!cancelled) setNoteLoading(false)
      })

    return () => { cancelled = true }
  }, [profile?.id, todayStr])

  // Scroll reply into view when it appears
  useEffect(() => {
    if (reply) replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [reply])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setUserAnswer(text)
    setSubmitted(true)
    setSending(true)
    setReply({ content: '', streaming: true })

    // Fire action detection in parallel
    const actionsPromise = fetch('/api/ai/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, recentMessages: [{ role: 'user', content: text }] }),
    })
      .then((r) => r.json())
      .catch(() => ({ executed: [] }))

    try {
      // Prefix the user's response with the focus context so Jalayu knows what it recommended
      const focusPrefix = focus
        ? `[Context: Jalayu recommended today's focus as "${focus}". The user's response to this is:] `
        : ''

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: focusPrefix + text }],
        }),
      })

      if (!res.ok || !res.body) {
        setReply({ content: "I'm here. Keep going.", streaming: false })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let content = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        content += decoder.decode(value, { stream: true })
        setReply({ content, streaming: true })
      }

      setReply({ content, streaming: false })

      actionsPromise.then(
        (result: { executed: Array<{ type: string; data: Record<string, unknown>; message: string }> }) => {
          if (result.executed?.length) onAction?.(result.executed)
        },
      )

      if (text && content) {
        fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'user', content: text },
              { role: 'assistant', content },
            ],
          }),
        }).catch(() => {})
      }
    } catch {
      setReply({ content: "I'm here. Keep going.", streaming: false })
    } finally {
      setSending(false)
    }
  }, [input, sending, onAction])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    const t = newTaskTitle.trim()
    if (!t) return
    onAddTask(t)
      .then(() => {
        setNewTaskTitle('')
        setAddingTask(false)
      })
      .catch(() => {})
  }

  return (
    <>
      <style>{`
        @keyframes jdot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes fadein {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .letter-fadein { animation: fadein 0.45s ease forwards; }
        @keyframes galaxySonar {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.55); opacity: 0; }
        }
      `}</style>

      <div
        style={{
          maxWidth: 520,
          margin: '0 auto',
          padding: '32px 20px 96px',
        }}
      >
        {/* Galaxy Orb */}
        <GalaxyOrb state={orbState} size={180} />

        {/* Date + Day */}
        <div
          className="letter-fadein"
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 32,
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 400 }}>
            {formatDate(new Date())}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>·</span>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Day {dayNumber}</span>
        </div>

        {/* Morning note — context, not the main event */}
        {(noteLoading || morningNote) && (
          <div className="letter-fadein" style={{ marginBottom: 24 }}>
            {noteLoading ? (
              <Dots />
            ) : (
              <p
                style={{
                  fontFamily: 'var(--font-lora), Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 15,
                  lineHeight: 1.85,
                  color: 'var(--text-2)',
                  margin: 0,
                }}
              >
                {morningNote}
              </p>
            )}
          </div>
        )}

        {/* Focus card — THE HERO: Jalayu's recommendation */}
        {!noteLoading && (
          <div
            className="letter-fadein"
            style={{
              background: 'var(--surface)',
              border: '1.5px solid var(--border)',
              borderRadius: 14,
              padding: '20px 22px',
              marginBottom: 28,
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.09em',
                margin: '0 0 10px',
              }}
            >
              Today&apos;s focus
            </p>
            <p
              style={{
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--text)',
                lineHeight: 1.45,
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              {focus || (pendingTasks.length > 0 ? pendingTasks[0].title : 'Tell me what you want to work on.')}
            </p>
          </div>
        )}

        {/* Input: reaction to focus, not a blank prompt */}
        {!submitted ? (
          <div className="letter-fadein" style={{ marginBottom: 36 }}>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-3)',
                margin: '0 0 12px',
                letterSpacing: '0.01em',
              }}
            >
              {focus ? 'Does that land, or is something else pulling at you?' : 'What\'s pulling at you most right now?'}
            </p>

            <div
              style={{
                borderBottom: '1.5px solid var(--border-2)',
                paddingBottom: 6,
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
                }}
                onKeyDown={handleKeyDown}
                placeholder={focus ? 'That lands. / Actually, I need to…' : 'type here…'}
                rows={1}
                autoFocus
                style={{
                  width: '100%',
                  resize: 'none',
                  border: 'none',
                  background: 'transparent',
                  fontSize: 16,
                  color: 'var(--text)',
                  outline: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.7,
                  overflow: 'hidden',
                  minHeight: 28,
                  maxHeight: 160,
                  padding: 0,
                }}
              />
            </div>

            {input.trim() && (
              <button
                onClick={sendMessage}
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: 'var(--text-3)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                send → (or press Enter)
              </button>
            )}
          </div>
        ) : (
          <div className="letter-fadein" style={{ marginBottom: 36 }} ref={replyRef}>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-3)',
                margin: '0 0 8px',
                letterSpacing: '0.01em',
              }}
            >
              {focus ? 'Does that land, or is something else pulling at you?' : 'What\'s pulling at you most right now?'}
            </p>
            <p
              style={{
                fontSize: 16,
                color: 'var(--text)',
                margin: '0 0 22px',
                lineHeight: 1.7,
              }}
            >
              {userAnswer}
            </p>

            {reply && (
              <div>
                {reply.content ? (
                  <p
                    style={{
                      fontFamily: 'var(--font-lora), Georgia, serif',
                      fontStyle: 'italic',
                      fontSize: 16,
                      lineHeight: 1.85,
                      color: 'var(--text-2)',
                      margin: 0,
                    }}
                  >
                    {reply.content}
                    {reply.streaming && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 2,
                          height: 14,
                          background: 'var(--text-3)',
                          marginLeft: 2,
                          verticalAlign: 'middle',
                          animation: 'blink 1s step-end infinite',
                        }}
                      />
                    )}
                  </p>
                ) : (
                  <Dots />
                )}

                {!reply.streaming && (
                  <button
                    onClick={() => setShowChatPanel(true)}
                    style={{
                      marginTop: 16,
                      fontSize: 12,
                      color: 'var(--text-3)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                    }}
                  >
                    keep talking →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 28 }} />

        {/* Today */}
        <div style={{ marginBottom: 32 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              margin: '0 0 16px',
            }}
          >
            Today
          </p>

          {pendingTasks.length === 0 && !addingTask && (
            <p style={{ fontSize: 14, color: 'var(--text-3)', margin: '0 0 8px' }}>
              Nothing on the list yet.
            </p>
          )}

          {pendingTasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 11,
                marginBottom: 12,
              }}
            >
              <button
                onClick={() => onToggleTask(task)}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '1.5px solid var(--border-2)',
                  background: 'transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                  marginTop: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = 'var(--accent)'
                  el.style.background = 'var(--morning)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement
                  el.style.borderColor = 'var(--border-2)'
                  el.style.background = 'transparent'
                }}
                aria-label={`Complete: ${task.title}`}
              />
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--text)',
                  lineHeight: 1.55,
                }}
              >
                {task.title}
              </span>
            </div>
          ))}

          {addingTask ? (
            <form
              onSubmit={handleAddTask}
              style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 4 }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '1.5px solid var(--text-3)',
                  flexShrink: 0,
                }}
              />
              <input
                ref={newTaskRef}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="add a task…"
                autoFocus
                onBlur={() => {
                  if (!newTaskTitle.trim()) setAddingTask(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle('') }
                }}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  fontSize: 14,
                  color: 'var(--text)',
                  outline: 'none',
                  fontFamily: 'inherit',
                  borderBottom: '1px solid var(--border-2)',
                  paddingBottom: 3,
                }}
              />
            </form>
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              style={{
                fontSize: 13,
                color: 'var(--text-3)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                marginTop: pendingTasks.length > 0 ? 4 : 0,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}
            >
              + add
            </button>
          )}
        </div>

        {/* Mood check — only if not logged today */}
        {!todayMood && (
          <div
            className="letter-fadein"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>How are you?</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {MOODS.map(({ score, emoji, label }) => (
                <button
                  key={score}
                  onClick={() => onMoodLog(score)}
                  title={label}
                  style={{
                    fontSize: 22,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    lineHeight: 1,
                    transition: 'transform 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.25)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
