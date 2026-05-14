'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Profile, Task, Mood } from '@/lib/types'
import { useStore } from '@/store/useStore'

function cacheKey(userId: string, date: string) {
  return `jalayu_morning_${userId}_${date}`
}

function TaskRow({
  task,
  onToggle,
}: {
  task: Task
  onToggle: (task: Task) => Promise<void>
}) {
  const [toggling, setToggling] = useState(false)

  async function handleToggle() {
    setToggling(true)
    await onToggle(task)
    setToggling(false)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '6px 0',
        opacity: task.completed ? 0.45 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <button
        onClick={handleToggle}
        disabled={toggling}
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `1.5px solid ${task.completed ? 'var(--accent)' : 'var(--border-2)'}`,
          background: task.completed ? 'var(--accent)' : 'transparent',
          flexShrink: 0,
          marginTop: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: toggling ? 'wait' : 'pointer',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {task.completed && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span
        style={{
          fontSize: 14,
          color: 'var(--text)',
          lineHeight: '1.5',
          textDecoration: task.completed ? 'line-through' : 'none',
        }}
      >
        {task.title}
      </span>
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
}) {
  const setShowChatPanel = useStore((s) => s.setShowChatPanel)

  // Morning note
  const [morningNote, setMorningNote] = useState<string | null>(null)
  const [noteLoading, setNoteLoading] = useState(true)

  // Day-starter conversation
  const [dayAnswer, setDayAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [aiReply, setAiReply] = useState('')
  const [replyStreaming, setReplyStreaming] = useState(false)

  // Task add
  const [newTask, setNewTask] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Date info
  const today = new Date()
  const dayLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const dayNumber = profile?.created_at
    ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : null

  // Load morning note
  useEffect(() => {
    async function loadNote() {
      setNoteLoading(true)
      try {
        const dateStr = today.toISOString().split('T')[0]
        // Try cache first
        if (profile?.id) {
          const cached = localStorage.getItem(cacheKey(profile.id, dateStr))
          if (cached) {
            setMorningNote(cached)
            setNoteLoading(false)
            return
          }
        }
        const res = await fetch('/api/ai/morning')
        if (res.ok) {
          const data = await res.json()
          if (data.note) {
            setMorningNote(data.note)
            if (data.userId && data.date) {
              localStorage.setItem(cacheKey(data.userId, data.date), data.note)
            }
          }
        }
      } catch {
        setMorningNote('Morning. A new day to work toward what matters.')
      } finally {
        setNoteLoading(false)
      }
    }
    loadNote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Auto-resize textarea
  function handleAnswerInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDayAnswer(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
  }

  const submitAnswer = useCallback(async () => {
    const trimmed = dayAnswer.trim()
    if (!trimmed || replyStreaming) return
    setSubmitted(true)
    setReplyStreaming(true)
    setAiReply('')

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          context: `The user just answered "What does today need to be about?" with: "${trimmed}". Respond warmly and briefly (1–2 sentences). Acknowledge what they said and leave them with one thought that helps them actually start. No bullet points, no lists, no markdown.`,
        }),
      })

      if (!res.ok || !res.body) {
        setAiReply("That sounds like the right thing to hold onto today.")
        setReplyStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim()
            if (payload === '[DONE]') continue
            try {
              const json = JSON.parse(payload)
              const delta = json.choices?.[0]?.delta?.content ?? json.delta?.text ?? ''
              if (delta) setAiReply((prev) => prev + delta)
            } catch {
              // non-JSON chunk, skip
            }
          }
        }
      }
    } catch {
      setAiReply("That sounds like the right thing to hold onto today.")
    } finally {
      setReplyStreaming(false)
    }
  }, [dayAnswer, replyStreaming])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitAnswer()
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newTask.trim()
    if (!trimmed || addingTask) return
    setAddingTask(true)
    setNewTask('')
    await onAddTask(trimmed)
    setAddingTask(false)
  }

  const pendingTasks = tasks.filter((t) => !t.completed)
  const completedTasks = tasks.filter((t) => t.completed)

  const MOODS = [
    { score: 1, emoji: '😔', label: 'Rough' },
    { score: 2, emoji: '😕', label: 'Low' },
    { score: 3, emoji: '😐', label: 'Okay' },
    { score: 4, emoji: '🙂', label: 'Good' },
    { score: 5, emoji: '😊', label: 'Great' },
  ]

  return (
    <div
      style={{
        maxWidth: 500,
        margin: '0 auto',
        padding: '28px 20px 80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* Date line */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-3)',
          letterSpacing: '0.04em',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>{dayLabel}</span>
        {dayNumber !== null && (
          <>
            <span style={{ color: 'var(--border-2)' }}>·</span>
            <span>Day {dayNumber}</span>
          </>
        )}
      </div>

      {/* Morning note block */}
      <div
        style={{
          background: 'var(--morning)',
          borderRadius: 10,
          padding: '16px 18px',
          marginBottom: 24,
          minHeight: 64,
        }}
      >
        {noteLoading ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 24 }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'var(--text-3)',
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
            <style>{`@keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }`}</style>
          </div>
        ) : (
          <p
            style={{
              fontFamily: 'var(--font-lora), Georgia, serif',
              fontSize: 15,
              lineHeight: 1.7,
              color: 'var(--text)',
              margin: 0,
              fontStyle: 'italic',
            }}
          >
            {morningNote}
          </p>
        )}
      </div>

      {/* Day-starter question + input */}
      {!submitted ? (
        <div style={{ marginBottom: 28 }}>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-2)',
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            What does today need to be about?
          </p>
          <textarea
            ref={inputRef}
            value={dayAnswer}
            onChange={handleAnswerInput}
            onKeyDown={handleKeyDown}
            placeholder="type here…"
            rows={1}
            style={{
              width: '100%',
              resize: 'none',
              border: 'none',
              borderBottom: '1.5px solid var(--border)',
              borderRadius: 0,
              background: 'transparent',
              fontSize: 15,
              color: 'var(--text)',
              padding: '4px 0',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.6,
              overflow: 'hidden',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.target.style.borderBottomColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderBottomColor = 'var(--border)')}
          />
          {dayAnswer.trim() && (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={submitAnswer}
                style={{
                  fontSize: 12,
                  color: 'var(--text-3)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                enter ↵
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 28 }}>
          {/* User answer */}
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-2)',
              marginBottom: 6,
              lineHeight: 1.5,
            }}
          >
            What does today need to be about?
          </p>
          <p
            style={{
              fontSize: 15,
              color: 'var(--text)',
              lineHeight: 1.6,
              marginBottom: 14,
              paddingBottom: 12,
              borderBottom: '1px solid var(--border)',
            }}
          >
            {dayAnswer}
          </p>

          {/* AI reply */}
          {(aiReply || replyStreaming) && (
            <p
              style={{
                fontFamily: 'var(--font-lora), Georgia, serif',
                fontSize: 14,
                lineHeight: 1.75,
                color: 'var(--text-2)',
                margin: '0 0 12px',
                fontStyle: 'italic',
              }}
            >
              {aiReply}
              {replyStreaming && (
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
              <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
            </p>
          )}

          {!replyStreaming && aiReply && (
            <button
              onClick={() => setShowChatPanel(true)}
              style={{
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
              Keep talking →
            </button>
          )}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', marginBottom: 24 }} />

      {/* Today's tasks */}
      <div style={{ marginBottom: 24 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            marginBottom: 8,
          }}
        >
          Today
        </p>

        {pendingTasks.length === 0 && completedTasks.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 8 }}>
            Nothing planned yet.
          </p>
        )}

        {pendingTasks.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={onToggleTask} />
        ))}

        {completedTasks.length > 0 && (
          <>
            {pendingTasks.length > 0 && (
              <div style={{ height: 8 }} />
            )}
            {completedTasks.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={onToggleTask} />
            ))}
          </>
        )}

        {/* Add task inline */}
        <form onSubmit={handleAddTask} style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>+</span>
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="add a task"
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                fontSize: 14,
                color: 'var(--text)',
                outline: 'none',
                fontFamily: 'inherit',
                padding: '4px 0',
              }}
            />
          </div>
        </form>
      </div>

      {/* Mood check — only if not logged today */}
      {!todayMood && (
        <div style={{ marginBottom: 12 }}>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-2)',
              marginBottom: 10,
            }}
          >
            How are you?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
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
                  padding: '2px 4px',
                  borderRadius: 6,
                  transition: 'transform 0.1s',
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.transform = 'scale(1.2)')}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.transform = 'scale(1)')}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
