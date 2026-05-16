'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Profile, Task, Mood } from '@/lib/types'
import { useStore } from '@/store/useStore'
import { getDayNumber } from '@/lib/utils'
import GalaxyOrb from '@/components/GalaxyOrb'

// ── Trading P&L mini-widget ────────────────────────────────────────────────────
interface TradingSnap {
  cash: number
  netWorth: number
  totalPnl: number
  totalPnlPct: number
  openPositions: number
  totalTrades: number
}

function TradingPnlWidget({ onNavigate }: { onNavigate: () => void }) {
  const [snap, setSnap] = useState<TradingSnap | null>(null)

  useEffect(() => {
    const SEED = 500
    Promise.all([
      fetch('/api/trading/portfolio').then(r => r.ok ? r.json() : null),
    ]).then(([data]) => {
      if (!data) return
      const cash = Number(data.cash ?? SEED)
      const positions: Array<{ shares: number; currentPrice: number; avgBuyPrice: number }> = data.positions ?? []
      const posValue = positions.reduce((s, p) => s + Number(p.shares) * Number(p.currentPrice || p.avgBuyPrice), 0)
      const netWorth = cash + posValue
      const totalPnl = netWorth - SEED
      setSnap({
        cash,
        netWorth,
        totalPnl,
        totalPnlPct: (totalPnl / SEED) * 100,
        openPositions: positions.length,
        totalTrades: data.totalTrades ?? 0,
      })
    }).catch(() => {})
  }, [])

  if (!snap) return null

  const positive = snap.totalPnl >= 0
  const color = positive ? '#22C55E' : '#EF4444'
  const Icon  = positive ? TrendingUp : TrendingDown

  return (
    <button
      onClick={onNavigate}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '13px 16px', marginBottom: 18,
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color={color} />
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, fontWeight: 500 }}>
            TRADING · {snap.openPositions} open · {snap.totalTrades} trades
          </p>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '1px 0 0', lineHeight: 1 }}>
            ${snap.netWorth.toFixed(2)}
          </p>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <p style={{ fontSize: 14, fontWeight: 700, color, margin: 0 }}>
          {positive ? '+' : ''}{snap.totalPnl.toFixed(2)}
        </p>
        <p style={{ fontSize: 11, color, margin: '1px 0 0', opacity: 0.8 }}>
          {positive ? '+' : ''}{snap.totalPnlPct.toFixed(2)}%
        </p>
      </div>
    </button>
  )
}

declare global {
  interface Window {
    SpeechRecognition?: new () => HomeSpeechRec
    webkitSpeechRecognition?: new () => HomeSpeechRec
  }
}
interface HomeSpeechResultItem { isFinal: boolean; 0: { transcript: string } }
interface HomeSpeechRec extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string
  start(): void; stop(): void; abort(): void
  onresult: ((ev: { results: HomeSpeechResultItem[] & { length: number } }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Reply = { content: string; streaming: boolean }
type OrbState = 'idle' | 'listening' | 'speaking'

const MOODS = [
  { score: 1, emoji: '😔', label: 'Rough' },
  { score: 2, emoji: '😕', label: 'Low' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😊', label: 'Great' },
]
const MOOD_EMOJI: Record<number, string> = { 1: '😔', 2: '😕', 3: '😐', 4: '🙂', 5: '😊' }
const AMBER = '#C4834A'

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 22 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'var(--text-3)', display: 'inline-block',
          animation: `jdot 1.3s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </div>
  )
}

export default function HomeContent({
  profile,
  tasks,
  tasksRecent = [],
  todayMood,
  moodsRecent = [],
  onMoodLog,
  onAddTask,
  onToggleTask,
  onAction,
}: {
  journeyView?: string
  profile: Profile | null
  tasks: Task[]
  tasksRecent?: Task[]
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
  const setSidebarView   = useStore((s) => s.setSidebarView)

  const [morningNote, setMorningNote] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [tip, setTip] = useState<string | null>(null)
  const [chapter, setChapter] = useState<string | null>(null)
  const [noteLoading, setNoteLoading] = useState(true)
  const [voiceListening, setVoiceListening] = useState(false)
  const homeRecRef = useRef<HomeSpeechRec | null>(null)
  const homeVoiceBaseRef = useRef('')
  const homeFinalRef = useRef('')
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
  const todayStr = toLocalDateStr(new Date())
  const yesterdayStr = toLocalDateStr(new Date(Date.now() - 86400000))

  // Pending tasks for today and overdue
  const pendingTasks = tasks.filter((t) => !t.completed)
  const todayTasks = pendingTasks.filter((t) => !t.due_date || t.due_date <= todayStr)
  const futureTasks = pendingTasks.filter((t) => t.due_date && t.due_date > todayStr)

  // Tasks completed today
  const completedToday = [...tasks, ...tasksRecent].filter(
    (t) => t.completed && t.completed_at && t.completed_at.startsWith(todayStr)
  )

  // Yesterday's stats
  const completedYesterday = tasksRecent.filter(
    (t) => t.completed && t.completed_at && t.completed_at.startsWith(yesterdayStr)
  )
  const yesterdayMood = moodsRecent.find((m) => m.created_at.startsWith(yesterdayStr))

  // Week progress (Mon–Sun)
  const now = new Date()
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1 // Mon=0
  const weekStart = toLocalDateStr(new Date(now.getTime() - dayOfWeek * 86400000))
  const weekCompleted = tasksRecent.filter(
    (t) => t.completed && t.completed_at && t.completed_at.slice(0, 10) >= weekStart
  ).length
  const weekTotal = weekCompleted + pendingTasks.length
  const weekPct = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0

  const orbState: OrbState = noteLoading ? 'speaking' : (voiceListening || input.trim()) ? 'listening' : 'idle'

  // Load morning note + focus + tip
  useEffect(() => {
    const userId = profile?.id
    const cacheKey = userId ? `jalayu_morning3_${userId}_${todayStr}` : null

    if (cacheKey) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed.note) setMorningNote(parsed.note)
          if (parsed.focus) setFocus(parsed.focus)
          if (parsed.tip) setTip(parsed.tip)
          if (parsed.chapter) setChapter(parsed.chapter)
          setNoteLoading(false)
          return
        }
      } catch { /* proceed */ }
    }

    let cancelled = false
    setNoteLoading(true)

    fetch('/api/ai/morning')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.note) setMorningNote(data.note)
        if (data.focus) setFocus(data.focus)
        if (data.tip) setTip(data.tip)
        if (data.chapter) setChapter(data.chapter)
        if (cacheKey && data.note) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ note: data.note, focus: data.focus || '', tip: data.tip || '', chapter: data.chapter || '' }))
          } catch { /* ok */ }
        }
      })
      .catch(() => { if (!cancelled) setMorningNote('A new day to work toward what matters.') })
      .finally(() => { if (!cancelled) setNoteLoading(false) })

    return () => { cancelled = true }
  }, [profile?.id, todayStr])

  useEffect(() => {
    if (reply) replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [reply])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  const stopHomeVoice = useCallback(() => {
    homeRecRef.current?.stop()
    homeRecRef.current = null
    setVoiceListening(false)
  }, [])

  const startHomeVoice = useCallback(async () => {
    if (voiceListening) { stopHomeVoice(); return }
    const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
    if (!SR) { toast.error('Voice not supported. Try Chrome.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
    } catch { toast.error('Microphone access denied.'); return }

    const rec = new SR()
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US'
    homeVoiceBaseRef.current = input.trim()
    homeFinalRef.current = ''

    rec.onresult = (ev) => {
      let finalChunk = ''; let interimChunk = ''
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) finalChunk += r[0].transcript
        else interimChunk += r[0].transcript
      }
      homeFinalRef.current = finalChunk
      setInput([homeVoiceBaseRef.current, finalChunk, interimChunk].filter(Boolean).join(' '))
    }
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed') toast.error('Microphone blocked.')
      else if (ev.error !== 'no-speech') toast.error('Voice capture stopped.')
      setVoiceListening(false)
    }
    rec.onend = () => {
      const clean = [homeVoiceBaseRef.current, homeFinalRef.current].filter(Boolean).join(' ').trim()
      if (clean) setInput(clean)
      setVoiceListening(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    homeRecRef.current = rec
    setVoiceListening(true)
    rec.start()
  }, [voiceListening, stopHomeVoice, input])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setUserAnswer(text); setSubmitted(true); setSending(true)
    setReply({ content: '', streaming: true })
    setInput('')

    const actionsPromise = fetch('/api/ai/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, recentMessages: [{ role: 'user', content: text }] }),
    }).then((r) => r.json()).catch(() => ({ executed: [] }))

    try {
      const focusPrefix = focus ? `[Context: Jalayu recommended today's focus as "${focus}". The user's response to this is:] ` : ''
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: focusPrefix + text }] }),
      })
      if (!res.ok || !res.body) { setReply({ content: "I'm here. Keep going.", streaming: false }); return }

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

      actionsPromise.then((result: { executed: Array<{ type: string; data: Record<string, unknown>; message: string }> }) => {
        if (result.executed?.length) onAction?.(result.executed)
      })

      if (text && content) {
        fetch('/api/chat/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: text }, { role: 'assistant', content }] }),
        }).catch(() => {})
      }
    } catch {
      setReply({ content: "I'm here. Keep going.", streaming: false })
    } finally {
      setSending(false)
    }
  }, [input, sending, onAction, focus])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    const t = newTaskTitle.trim()
    if (!t) return
    onAddTask(t).then(() => { setNewTaskTitle(''); setAddingTask(false) }).catch(() => {})
  }

  const hasYesterdayData = completedYesterday.length > 0 || !!yesterdayMood

  return (
    <>
      <style>{`
        @keyframes jdot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes fadein {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes barGrow { from { width: 0%; } to { width: var(--bar-w); } }
        .fade-up { animation: fadein 0.4s ease forwards; }
        @keyframes homeMicRipple {
          0%   { transform: scale(1);   opacity: 0.5; }
          100% { transform: scale(2.4); opacity: 0;   }
        }
        @keyframes homeMicDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .task-row:hover .task-actions { opacity: 1; }
      `}</style>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 18px 100px' }}>

        {/* ── Galaxy Orb ── */}
        <GalaxyOrb state={orbState} size={140} />

        {/* ── Header: date + streak ── */}
        <div className="fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500, margin: 0 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>Day {dayNumber}</p>
            {!noteLoading && chapter && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '3px 0 0', fontStyle: 'italic', opacity: 0.85 }}>
                {chapter}
              </p>
            )}
          </div>
          {(profile?.streak_count ?? 0) > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--morning)', border: '1px solid var(--border)',
              borderRadius: 99, padding: '5px 10px',
            }}>
              <span style={{ fontSize: 14 }}>🔥</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: AMBER }}>{profile?.streak_count}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>day streak</span>
            </div>
          )}
        </div>

        {/* ── Trading P&L widget ── */}
        <TradingPnlWidget onNavigate={() => setSidebarView('trading')} />

        {/* ── Yesterday snapshot ── */}
        {hasYesterdayData && (
          <div className="fade-up" style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '16px 18px',
            marginBottom: 20,
          }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 14px' }}>
              Yesterday
            </p>
            <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>

              {completedYesterday.length > 0 && (
                <div style={{ flex: 1, textAlign: 'center', paddingRight: 16, borderRight: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', lineHeight: 1, margin: 0 }}>
                    {completedYesterday.length}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>tasks done</p>
                </div>
              )}

              {yesterdayMood && (
                <div style={{ flex: 1, textAlign: 'center', padding: '0 16px', borderRight: completedYesterday.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <p style={{ fontSize: 32, lineHeight: 1, margin: 0 }}>{MOOD_EMOJI[yesterdayMood.score]}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>mood {yesterdayMood.score}/5</p>
                </div>
              )}

              {completedYesterday.length > 0 && (
                <div style={{ flex: 1, textAlign: 'center', paddingLeft: 16 }}>
                  <p style={{ fontSize: 32, fontWeight: 800, color: AMBER, lineHeight: 1, margin: 0 }}>
                    +{completedYesterday.length * 5}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>growth pts</p>
                </div>
              )}

            </div>
            {completedYesterday.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                {completedYesterday.slice(0, 2).map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                      <path d="M1 4.5L4 7.5L10 1" stroke={AMBER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </span>
                  </div>
                ))}
                {completedYesterday.length > 2 && (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>+{completedYesterday.length - 2} more</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Week progress ── */}
        {weekTotal > 0 && (
          <div className="fade-up" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                This week
              </p>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>
                {weekCompleted}/{weekTotal} · {weekPct}%
              </p>
            </div>
            <div style={{ height: 7, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${weekPct}%`,
                background: `linear-gradient(90deg, ${AMBER}, #E8AA6A)`,
                borderRadius: 99,
                transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '5px 0 0' }}>
              {pendingTasks.length} remaining this week
              {completedToday.length > 0 && ` · ${completedToday.length} done today`}
            </p>
          </div>
        )}

        {/* ── Morning note ── */}
        {(noteLoading || morningNote) && (
          <div className="fade-up" style={{ marginBottom: 20 }}>
            {noteLoading ? <Dots /> : (
              <p style={{
                fontFamily: 'var(--font-lora), Georgia, serif',
                fontStyle: 'italic', fontSize: 15, lineHeight: 1.85,
                color: 'var(--text-2)', margin: 0,
              }}>
                {morningNote}
              </p>
            )}
          </div>
        )}

        {/* ── Focus card ── */}
        {!noteLoading && (
          <div className="fade-up" style={{
            background: 'var(--surface)',
            border: `1.5px solid ${AMBER}22`,
            borderLeft: `3px solid ${AMBER}`,
            borderRadius: 14,
            padding: '18px 20px',
            marginBottom: tip ? 14 : 28,
          }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.09em', margin: '0 0 8px' }}>
              Today&apos;s focus
            </p>
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45, margin: 0, letterSpacing: '-0.01em' }}>
              {focus || (pendingTasks.length > 0 ? pendingTasks[0].title : 'Tell me what you want to work on.')}
            </p>
          </div>
        )}

        {/* ── Tip ── */}
        {!noteLoading && tip && (
          <div className="fade-up" style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 14px', background: 'var(--morning)',
            borderRadius: 10, border: '1px solid var(--border)', marginBottom: 28,
          }}>
            <span style={{ fontSize: 12, color: AMBER, flexShrink: 0, marginTop: 2 }}>✦</span>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{tip}</p>
          </div>
        )}

        {/* ── Divider ── */}
        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 24 }} />

        {/* ── Today's tasks ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
              Today
            </p>
            {(todayTasks.length > 0 || completedToday.length > 0) && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                {completedToday.length > 0 && <span style={{ color: AMBER, fontWeight: 600 }}>{completedToday.length} done · </span>}
                {todayTasks.length} pending
              </p>
            )}
          </div>

          {todayTasks.length === 0 && completedToday.length === 0 && !addingTask && (
            <p style={{ fontSize: 14, color: 'var(--text-3)', margin: '0 0 8px' }}>
              Nothing for today yet. Add something below.
            </p>
          )}

          {/* Completed today (faded) */}
          {completedToday.slice(0, 2).map((task) => (
            <div key={task.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, opacity: 0.45,
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--border-2)', border: '1.5px solid var(--border-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'line-through', flex: 1 }}>
                {task.title}
              </span>
            </div>
          ))}

          {/* Pending tasks */}
          {todayTasks.map((task) => (
            <div
              key={task.id}
              className="task-row"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, position: 'relative' }}
            >
              <button
                onClick={() => onToggleTask(task)}
                style={{
                  width: 17, height: 17, borderRadius: '50%',
                  border: `1.5px solid ${task.priority === 'high' ? '#DC2626' : task.priority === 'medium' ? AMBER : 'var(--border-2)'}`,
                  background: 'transparent', cursor: 'pointer', flexShrink: 0, marginTop: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--morning)' }}
                onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{task.title}</span>
                <div style={{ display: 'flex', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
                  {task.priority === 'high' && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: '#DC2626',
                      background: 'rgba(220,38,38,0.07)', padding: '2px 6px',
                      borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>high</span>
                  )}
                  {task.due_date && task.due_date < todayStr && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: '#92400E',
                      background: 'rgba(146,64,14,0.08)', padding: '2px 6px',
                      borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>overdue</span>
                  )}
                  {task.due_date === todayStr && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: AMBER,
                      background: `${AMBER}15`, padding: '2px 6px',
                      borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>due today</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Future tasks (collapsed) */}
          {futureTasks.length > 0 && (
            <div style={{ marginTop: 6, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 8px' }}>
                Coming up ({futureTasks.length})
              </p>
              {futureTasks.slice(0, 3).map((task) => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{task.title}</span>
                  {task.due_date && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto', flexShrink: 0 }}>
                      {new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Inline add */}
          {addingTask ? (
            <form onSubmit={handleAddTask} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <div style={{ width: 17, height: 17, borderRadius: '50%', border: '1.5px solid var(--text-3)', flexShrink: 0 }} />
              <input
                ref={newTaskRef}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="add a task…"
                autoFocus
                onBlur={() => { if (!newTaskTitle.trim()) setAddingTask(false) }}
                onKeyDown={(e) => { if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle('') } }}
                style={{
                  flex: 1, border: 'none', background: 'transparent',
                  fontSize: 14, color: 'var(--text)', outline: 'none',
                  fontFamily: 'inherit', borderBottom: '1px solid var(--border-2)', paddingBottom: 3,
                }}
              />
            </form>
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              style={{
                fontSize: 13, color: 'var(--text-3)', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, marginTop: 8, transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}
            >
              + add task
            </button>
          )}
        </div>

        {/* ── Growth score ── */}
        {(profile?.growth_score ?? 0) > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 10, marginBottom: 24,
          }}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {profile?.growth_score} growth points
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '1px 0 0' }}>
                Keep completing tasks to build momentum
              </p>
            </div>
            <span style={{ fontSize: 11, color: AMBER, fontWeight: 600 }}>+5 per task</span>
          </div>
        )}

        {/* ── Mood check ── */}
        {!todayMood && (
          <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>How are you today?</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {MOODS.map(({ score, emoji, label }) => (
                <button
                  key={score}
                  onClick={() => onMoodLog(score)}
                  title={label}
                  style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', padding: '2px', lineHeight: 1, transition: 'transform 0.15s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.25)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Divider ── */}
        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 24 }} />

        {/* ── Conversation area ── */}
        {!submitted ? (
          <div className="fade-up">
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 10px' }}>
              {focus ? 'Does that land, or is something else pulling at you?' : "What's on your mind?"}
            </p>
            <div style={{
              borderBottom: `1.5px solid ${voiceListening ? 'rgba(220,38,38,0.35)' : 'var(--border-2)'}`,
              paddingBottom: 6, display: 'flex', alignItems: 'flex-end', gap: 8,
              transition: 'border-color 0.2s',
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={voiceListening ? 'Listening…' : 'Tell me anything — I\'ll handle it'}
                rows={1}
                style={{
                  flex: 1, resize: 'none', border: 'none', background: 'transparent',
                  fontSize: 15, color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
                  lineHeight: 1.7, overflow: 'hidden', minHeight: 28, maxHeight: 160, padding: 0,
                }}
              />
              <div style={{ position: 'relative', flexShrink: 0, marginBottom: 2 }}>
                {voiceListening && (
                  <>
                    <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: 'rgba(220,38,38,0.18)', animation: 'homeMicRipple 1.4s ease-out infinite', pointerEvents: 'none' }} />
                    <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: 'rgba(220,38,38,0.12)', animation: 'homeMicRipple 1.4s ease-out 0.55s infinite', pointerEvents: 'none' }} />
                  </>
                )}
                <button
                  type="button" onClick={startHomeVoice}
                  style={{
                    position: 'relative', width: 28, height: 28, borderRadius: '50%',
                    border: voiceListening ? '1.5px solid rgba(220,38,38,0.4)' : '1px solid var(--border)',
                    background: voiceListening ? 'rgba(220,38,38,0.06)' : 'var(--surface-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s', zIndex: 1,
                  }}
                >
                  {voiceListening ? <MicOff size={13} color="#DC2626" /> : <Mic size={13} color="var(--text-3)" />}
                </button>
              </div>
            </div>
            {voiceListening && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11, color: '#DC2626' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#DC2626', flexShrink: 0, animation: 'homeMicDot 1.1s ease-in-out infinite' }} />
                Listening — tap to stop
              </div>
            )}
            {input.trim() && (
              <button onClick={sendMessage} style={{
                marginTop: 10, fontSize: 12, color: 'var(--text-3)', background: 'none',
                border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3,
              }}>
                send → (or press Enter)
              </button>
            )}
          </div>
        ) : (
          <div className="fade-up" ref={replyRef}>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 8px' }}>
              {focus ? 'Does that land, or is something else pulling at you?' : "What's on your mind?"}
            </p>
            <p style={{ fontSize: 15, color: 'var(--text)', margin: '0 0 18px', lineHeight: 1.7 }}>{userAnswer}</p>

            {reply && (
              <div>
                {reply.content ? (
                  <p style={{
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    fontStyle: 'italic', fontSize: 15, lineHeight: 1.85,
                    color: 'var(--text-2)', margin: 0,
                  }}>
                    {reply.content}
                    {reply.streaming && (
                      <span style={{
                        display: 'inline-block', width: 2, height: 14, background: 'var(--text-3)',
                        marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite',
                      }} />
                    )}
                  </p>
                ) : <Dots />}

                {!reply.streaming && (
                  <button
                    onClick={() => setShowChatPanel(true)}
                    style={{
                      marginTop: 14, display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 12, color: 'var(--text-3)', background: 'none',
                      border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    keep talking <ChevronRight size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
