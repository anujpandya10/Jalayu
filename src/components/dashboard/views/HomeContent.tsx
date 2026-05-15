'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Profile, Task, Mood } from '@/lib/types'
import { useStore } from '@/store/useStore'

type Msg = {
  role: 'assistant' | 'user'
  content: string
  streaming?: boolean
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '2px 0 6px' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
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

function AgentMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: 'var(--accent-fg)',
            flexShrink: 0,
            fontWeight: 600,
          }}
        >
          J
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-3)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Jalayu
        </span>
      </div>

      {!content && streaming ? (
        <TypingDots />
      ) : (
        <p
          style={{
            fontFamily: 'var(--font-lora), Georgia, serif',
            fontSize: 17,
            lineHeight: 1.8,
            color: 'var(--text)',
            margin: 0,
            fontStyle: 'italic',
            paddingLeft: 29,
          }}
        >
          {content}
          {streaming && content && (
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: 17,
                background: 'var(--text-2)',
                marginLeft: 2,
                verticalAlign: 'middle',
                animation: 'jblink 1s step-end infinite',
              }}
            />
          )}
        </p>
      )}
    </div>
  )
}

function UserMessage({ content }: { content: string }) {
  return (
    <div
      style={{
        marginBottom: 28,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          background: 'var(--morning)',
          borderRadius: '18px 18px 4px 18px',
          padding: '11px 16px',
          maxWidth: '78%',
        }}
      >
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--text)',
            margin: 0,
          }}
        >
          {content}
        </p>
      </div>
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

  const [messages, setMessages] = useState<Msg[]>([])
  const [loadingEntry, setLoadingEntry] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [showTasks, setShowTasks] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loadingEntry])

  // Stream the entry message on mount
  useEffect(() => {
    let cancelled = false

    async function streamEntry() {
      setLoadingEntry(true)

      // Brief pause — like someone looking up before speaking
      await new Promise((r) => setTimeout(r, 500))
      if (cancelled) return

      setLoadingEntry(false)
      setMessages([{ role: 'assistant', content: '', streaming: true }])

      try {
        const res = await fetch('/api/ai/entry')
        if (!res.ok || !res.body) {
          if (!cancelled)
            setMessages([
              {
                role: 'assistant',
                content: "You're back. Let's see what today needs.",
                streaming: false,
              },
            ])
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let text = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done || cancelled) break
          text += decoder.decode(value, { stream: true })
          setMessages([{ role: 'assistant', content: text, streaming: true }])
        }

        if (!cancelled) {
          setMessages([{ role: 'assistant', content: text, streaming: false }])
          // Persist entry message to thread (fire and forget)
          if (text.trim()) {
            fetch('/api/chat/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{ role: 'assistant', content: text }],
              }),
            }).catch(() => {})
          }
        }
      } catch {
        if (!cancelled)
          setMessages([
            {
              role: 'assistant',
              content: "You're back. Let's see what today needs.",
              streaming: false,
            },
          ])
      }
    }

    streamEntry()
    return () => {
      cancelled = true
    }
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending || loadingEntry) return

    setInput('')
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
    setSending(true)

    const userMsg: Msg = { role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)

    // Add empty assistant message (will stream into it)
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', streaming: true },
    ])

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!res.ok || !res.body) {
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = {
            role: 'assistant',
            content: "I'm here. Keep going.",
            streaming: false,
          }
          return copy
        })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let reply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply += decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = {
            role: 'assistant',
            content: reply,
            streaming: true,
          }
          return copy
        })
      }

      setMessages((prev) => {
        const copy = [...prev]
        copy[copy.length - 1] = {
          role: 'assistant',
          content: reply,
          streaming: false,
        }
        return copy
      })

      // Persist the exchange (fire and forget)
      if (text && reply) {
        fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'user', content: text },
              { role: 'assistant', content: reply },
            ],
          }),
        }).catch(() => {})
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev]
        copy[copy.length - 1] = {
          role: 'assistant',
          content: "I'm here. Keep going.",
          streaming: false,
        }
        return copy
      })
    } finally {
      setSending(false)
    }
  }, [input, messages, sending, loadingEntry])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    const t = newTask.trim()
    if (!t || addingTask) return
    setAddingTask(true)
    setNewTask('')
    await onAddTask(t)
    setAddingTask(false)
  }

  const pendingTasks = tasks.filter((t) => !t.completed)
  const doneTasks = tasks.filter((t) => t.completed)

  const MOODS = [
    { score: 1, emoji: '😔', label: 'Rough' },
    { score: 2, emoji: '😕', label: 'Low' },
    { score: 3, emoji: '😐', label: 'Okay' },
    { score: 4, emoji: '🙂', label: 'Good' },
    { score: 5, emoji: '😊', label: 'Great' },
  ]

  return (
    <>
      <style>{`
        @keyframes jdot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes jblink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes jfadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .jmsg { animation: jfadein 0.25s ease forwards; }
      `}</style>

      <div
        style={{
          maxWidth: 580,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 'calc(100vh - 60px)',
          padding: '0 0 20px',
        }}
      >
        {/* Conversation area */}
        <div
          style={{
            flex: 1,
            padding: '36px 24px 8px',
          }}
        >
          {/* Loading state */}
          {loadingEntry && (
            <div className="jmsg" style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: 'var(--accent-fg)',
                    fontWeight: 600,
                  }}
                >
                  J
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  Jalayu
                </span>
              </div>
              <div style={{ paddingLeft: 29 }}>
                <TypingDots />
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div key={i} className="jmsg">
              {msg.role === 'assistant' ? (
                <AgentMessage
                  content={msg.content}
                  streaming={msg.streaming}
                />
              ) : (
                <UserMessage content={msg.content} />
              )}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)',
            position: 'sticky',
            bottom: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 10,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '10px 14px',
              transition: 'border-color 0.15s',
            }}
            onFocus={() => {}}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                loadingEntry ? '' : sending ? '…' : 'say something…'
              }
              rows={1}
              disabled={loadingEntry || sending}
              style={{
                flex: 1,
                resize: 'none',
                border: 'none',
                background: 'transparent',
                fontSize: 15,
                color: 'var(--text)',
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.6,
                overflow: 'hidden',
                minHeight: 24,
                maxHeight: 130,
              }}
            />
            {input.trim() && !sending && (
              <button
                onClick={sendMessage}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginBottom: 1,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                >
                  <path
                    d="M7 12V3M3 6.5L7 3L11 6.5"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Subrow: mood + open full chat */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
              paddingLeft: 2,
              paddingRight: 2,
            }}
          >
            {!todayMood ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{ fontSize: 11, color: 'var(--text-3)', marginRight: 2 }}
                >
                  how are you?
                </span>
                {MOODS.map(({ score, emoji, label }) => (
                  <button
                    key={score}
                    onClick={() => onMoodLog(score)}
                    title={label}
                    style={{
                      fontSize: 18,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '1px 2px',
                      lineHeight: 1,
                      transition: 'transform 0.1s',
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.transform =
                        'scale(1.25)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.transform =
                        'scale(1)')
                    }
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              <div />
            )}

            <button
              onClick={() => setShowChatPanel(true)}
              style={{
                fontSize: 11,
                color: 'var(--text-3)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              full history →
            </button>
          </div>
        </div>

        {/* Today's tasks — collapsible bar */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <button
            onClick={() => setShowTasks((v) => !v)}
            style={{
              width: '100%',
              padding: '11px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-2)',
                fontWeight: 500,
              }}
            >
              {pendingTasks.length > 0
                ? `${pendingTasks.length} left today`
                : doneTasks.length > 0
                  ? 'All done today ✓'
                  : 'Today'}
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-3)',
                display: 'inline-block',
                transform: showTasks ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            >
              ▾
            </span>
          </button>

          {showTasks && (
            <div style={{ padding: '0 24px 14px' }}>
              {pendingTasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '5px 0',
                  }}
                >
                  <button
                    onClick={() => onToggleTask(task)}
                    style={{
                      width: 17,
                      height: 17,
                      borderRadius: 4,
                      border: '1.5px solid var(--border-2)',
                      background: 'transparent',
                      flexShrink: 0,
                      marginTop: 2,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--text)',
                      lineHeight: 1.5,
                    }}
                  >
                    {task.title}
                  </span>
                </div>
              ))}

              {doneTasks.length > 0 && pendingTasks.length > 0 && (
                <div
                  style={{
                    height: 1,
                    background: 'var(--border)',
                    margin: '8px 0',
                  }}
                />
              )}

              {doneTasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '5px 0',
                    opacity: 0.4,
                  }}
                >
                  <div
                    style={{
                      width: 17,
                      height: 17,
                      borderRadius: 4,
                      border: '1.5px solid var(--accent)',
                      background: 'var(--accent)',
                      flexShrink: 0,
                      marginTop: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path
                        d="M1 3.5L3.2 5.5L8 1"
                        stroke="white"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--text)',
                      lineHeight: 1.5,
                      textDecoration: 'line-through',
                    }}
                  >
                    {task.title}
                  </span>
                </div>
              ))}

              {/* Inline add */}
              <form
                onSubmit={handleAddTask}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                  paddingTop: 6,
                  borderTop: '1px dashed var(--border)',
                }}
              >
                <span style={{ fontSize: 14, color: 'var(--text-3)' }}>+</span>
                <input
                  type="text"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="add a task"
                  disabled={addingTask}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontSize: 13,
                    color: 'var(--text)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    padding: '3px 0',
                  }}
                />
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
