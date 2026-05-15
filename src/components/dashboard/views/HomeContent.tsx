'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Profile, Task, Mood } from '@/lib/types'
import { useStore } from '@/store/useStore'
import { getDayNumber } from '@/lib/utils'

function useFocusScore(): number | null {
  const insights = useStore((s) => s.insights)
  const fsInsight = insights.find((i) => i.type === 'focus_score')
  if (!fsInsight) return null
  const score = parseInt(fsInsight.content.split('|||')[0], 10)
  return isNaN(score) ? null : score
}

type Msg = {
  role: 'assistant' | 'user'
  content: string
  streaming?: boolean
}

type OrbState = 'idle' | 'listening' | 'speaking'

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

function LivingOrb({ state }: { state: OrbState }) {
  const orbAnim =
    state === 'speaking'
      ? 'orbSpeaking 0.8s ease-in-out infinite'
      : state === 'listening'
        ? 'orbHeartbeat 1.2s ease-in-out infinite'
        : 'orbBreath 5s ease-in-out infinite'

  const glowIntensity =
    state === 'speaking'
      ? '0 0 60px rgba(99,102,241,0.9), 0 0 120px rgba(99,102,241,0.5), 0 0 200px rgba(99,102,241,0.2)'
      : state === 'listening'
        ? '0 0 40px rgba(99,102,241,0.7), 0 0 80px rgba(99,102,241,0.35), 0 0 140px rgba(99,102,241,0.15)'
        : '0 0 24px rgba(99,102,241,0.4), 0 0 60px rgba(99,102,241,0.2), 0 0 100px rgba(99,102,241,0.08)'

  const ringSpeed =
    state === 'speaking' ? '1s' : state === 'listening' ? '1.6s' : '3s'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 0 24px',
        position: 'relative',
      }}
    >
      {/* Ambient outer glow */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
          animation: `ambientPulse ${state === 'speaking' ? '1.2s' : state === 'listening' ? '2s' : '4s'} ease-in-out infinite`,
          pointerEvents: 'none',
        }}
      />

      {/* Orb container */}
      <div style={{ position: 'relative', width: 96, height: 96 }}>
        {/* Sonar rings */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: -4,
              borderRadius: '50%',
              border: `1px solid rgba(99,102,241,${state === 'idle' ? 0.25 : 0.45})`,
              animation: `sonarRing ${ringSpeed} ease-out ${i * (parseFloat(ringSpeed) / 3)}s infinite`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Core sphere */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 28%, #A5B4FC 0%, #6366F1 35%, #4338CA 70%, #1e1b4b 95%)',
            boxShadow: glowIntensity,
            animation: orbAnim,
            position: 'relative',
            overflow: 'hidden',
            transition: 'box-shadow 0.6s ease',
          }}
        >
          {/* SVG globe lines */}
          <svg
            width="96"
            height="96"
            viewBox="0 0 96 96"
            style={{ position: 'absolute', inset: 0, opacity: 0.18 }}
          >
            {/* Latitude ellipses */}
            <ellipse cx="48" cy="24" rx="40" ry="8" stroke="white" strokeWidth="0.7" fill="none" />
            <ellipse cx="48" cy="38" rx="46" ry="12" stroke="white" strokeWidth="0.7" fill="none" />
            <ellipse cx="48" cy="52" rx="46" ry="12" stroke="white" strokeWidth="0.7" fill="none" />
            <ellipse cx="48" cy="66" rx="40" ry="8" stroke="white" strokeWidth="0.7" fill="none" />
            <ellipse cx="48" cy="78" rx="26" ry="5" stroke="white" strokeWidth="0.7" fill="none" />
            {/* Longitude arcs */}
            <path d="M 48 2 Q 60 48 48 94" stroke="white" strokeWidth="0.7" fill="none" />
            <path d="M 48 2 Q 36 48 48 94" stroke="white" strokeWidth="0.7" fill="none" />
            <path d="M 48 2 Q 80 30 90 48 Q 80 66 48 94" stroke="white" strokeWidth="0.7" fill="none" />
            <path d="M 48 2 Q 16 30 6 48 Q 16 66 48 94" stroke="white" strokeWidth="0.7" fill="none" />
          </svg>

          {/* White highlight shine */}
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 14,
              width: 22,
              height: 14,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.35)',
              filter: 'blur(3px)',
              transform: 'rotate(-20deg)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

function StatusChips({
  profile,
  tasks,
  todayMood,
}: {
  profile: Profile | null
  tasks: Task[]
  todayMood: Mood | null
}) {
  const dayN = profile ? getDayNumber(profile.created_at) : null
  const pending = tasks.filter((t) => !t.completed).length
  const focusScore = useFocusScore()

  const MOOD_EMOJI: Record<number, string> = {
    1: '😔', 2: '😕', 3: '😐', 4: '🙂', 5: '😊',
  }

  const chipStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 11,
    color: 'var(--text-2)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    whiteSpace: 'nowrap' as const,
  }

  const focusColor = focusScore === null ? 'var(--text-3)'
    : focusScore >= 75 ? 'var(--success-text)'
    : focusScore >= 50 ? 'var(--accent)'
    : 'var(--warning-text)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 36,
        flexWrap: 'wrap',
        animation: 'fadeSlideUp 0.5s ease forwards',
      }}
    >
      {dayN !== null && (
        <span style={chipStyle}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Day {dayN}</span>
        </span>
      )}
      <span style={chipStyle}>
        <span>{pending} {pending === 1 ? 'task' : 'tasks'}</span>
      </span>
      <span style={chipStyle}>
        {todayMood
          ? <span title={`Mood: ${todayMood.score}/5`}>{MOOD_EMOJI[todayMood.score] ?? '✦'}</span>
          : <span style={{ color: 'var(--text-3)' }}>—</span>
        }
      </span>
      {focusScore !== null && (
        <span style={chipStyle} title="Weekly focus score">
          <span style={{ color: focusColor, fontWeight: 600 }}>{focusScore}</span>
          <span style={{ color: 'var(--text-3)' }}>focus</span>
        </span>
      )}
    </div>
  )
}

function AgentMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div style={{ marginBottom: 28, animation: 'fadeSlideUp 0.3s ease forwards' }}>
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
            boxShadow: '0 0 8px rgba(99,102,241,0.5)',
          }}
        >
          J
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-3)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          JALAYU
        </span>
      </div>

      {!content && streaming ? (
        <div style={{ paddingLeft: 29 }}>
          <TypingDots />
        </div>
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
                background: 'var(--accent)',
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
        animation: 'fadeSlideUp 0.25s ease forwards',
      }}
    >
      <div
        style={{
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.2)',
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

  const [messages, setMessages] = useState<Msg[]>([])
  const [loadingEntry, setLoadingEntry] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [orbState, setOrbState] = useState<OrbState>('speaking')

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
      setOrbState('speaking')

      // Brief pause — like someone looking up before speaking
      await new Promise((r) => setTimeout(r, 500))
      if (cancelled) return

      setLoadingEntry(false)
      setMessages([{ role: 'assistant', content: '', streaming: true }])

      try {
        const res = await fetch('/api/ai/entry')
        if (!res.ok || !res.body) {
          if (!cancelled) {
            setMessages([
              {
                role: 'assistant',
                content: "You're back. Let's see what today needs.",
                streaming: false,
              },
            ])
            setOrbState('idle')
          }
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
          setOrbState('idle')
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
        if (!cancelled) {
          setMessages([
            {
              role: 'assistant',
              content: "You're back. Let's see what today needs.",
              streaming: false,
            },
          ])
          setOrbState('idle')
        }
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
    setOrbState('speaking')

    const userMsg: Msg = { role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)

    // Add empty assistant message (will stream into it)
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', streaming: true },
    ])

    // Fire action detection in parallel (don't await — let it race with the chat stream)
    const actionsPromise = fetch('/api/ai/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    }).then((r) => r.json()).catch(() => ({ executed: [] }))

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
        setOrbState('idle')
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
      setOrbState('idle')

      // Handle any executed actions
      actionsPromise.then((result: { executed: Array<{ type: string; data: Record<string, unknown>; message: string }> }) => {
        if (result.executed?.length) {
          onAction?.(result.executed)
        }
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
      setOrbState('idle')
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
    // Listening when typing, idle when empty
    if (e.target.value.trim() && !sending) {
      setOrbState('listening')
    } else if (!sending && !loadingEntry) {
      setOrbState('idle')
    }
  }

  const pendingTasks = tasks.filter((t) => !t.completed)

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
        .jmsg { animation: fadeSlideUp 0.3s ease forwards; }
      `}</style>

      <div
        style={{
          maxWidth: 600,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 'calc(100vh - 60px)',
          padding: '0 0 20px',
        }}
      >
        {/* Living Orb */}
        <LivingOrb state={orbState} />

        {/* Status chips */}
        <StatusChips profile={profile} tasks={tasks} todayMood={todayMood} />

        {/* Conversation area */}
        <div
          style={{
            flex: 1,
            padding: '0 24px 8px',
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
                    boxShadow: '0 0 8px rgba(99,102,241,0.5)',
                  }}
                >
                  J
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  JALAYU
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
            background: 'rgba(6,10,18,0.92)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            position: 'sticky',
            bottom: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 10,
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              padding: '10px 14px',
              transition: 'border-color 0.2s',
            }}
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
                  boxShadow: '0 0 12px rgba(99,102,241,0.5)',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', marginRight: 2 }}>
                {todayMood ? `mood: ${['😔','😕','😐','🙂','😊'][todayMood.score - 1]} ·` : 'how are you?'}
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
                    transition: 'transform 0.15s, opacity 0.15s',
                    opacity: todayMood && todayMood.score !== score ? 0.4 : 1,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.25)'; (e.currentTarget as HTMLElement).style.opacity = '1' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.opacity = todayMood && todayMood.score !== score ? '0.4' : '1' }}
                >
                  {emoji}
                </button>
              ))}
            </div>

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
      </div>
    </>
  )
}
