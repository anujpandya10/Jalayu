'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mic, MicOff, ChevronRight,
  TrendingUp, TrendingDown, CheckSquare, Heart,
  BookOpen, Sparkles, Brain, Stethoscope,
  Users, Bell, FlaskConical, BarChart2, Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { Profile, Task, Mood } from '@/lib/types'
import { useStore } from '@/store/useStore'
import { getDayNumber } from '@/lib/utils'
import GalaxyOrb from '@/components/GalaxyOrb'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TradingSnap {
  netWorth: number
  totalPnl: number
  totalPnlPct: number
  openPositions: number
  totalTrades: number
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

type Reply     = { content: string; streaming: boolean }
type OrbState  = 'idle' | 'listening' | 'speaking'

const MOODS: { score: number; emoji: string; label: string }[] = [
  { score: 1, emoji: '😔', label: 'Rough' },
  { score: 2, emoji: '😕', label: 'Low'   },
  { score: 3, emoji: '😐', label: 'Okay'  },
  { score: 4, emoji: '🙂', label: 'Good'  },
  { score: 5, emoji: '😊', label: 'Great' },
]
const MOOD_EMOJI: Record<number, string> = { 1: '😔', 2: '😕', 3: '😐', 4: '🙂', 5: '😊' }
const MOOD_LABEL: Record<number, string> = { 1: 'Rough', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' }
const AMBER = '#C4834A'

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 20 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: '50%',
          background: 'var(--text-3)', display: 'inline-block',
          animation: `jdot 1.3s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Widget card base ──────────────────────────────────────────────────────────

function Widget({
  accent, icon: Icon, label, onClick, children, fullWidth = false, minHeight,
}: {
  accent: string
  icon: React.ComponentType<{ size?: number; color?: string }>
  label: string
  onClick?: () => void
  children: React.ReactNode
  fullWidth?: boolean
  minHeight?: number
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 20, padding: '16px 18px',
        cursor: onClick ? 'pointer' : 'default',
        minHeight: minHeight ?? 0,
        position: 'relative', overflow: 'hidden',
        transition: 'transform 0.12s, box-shadow 0.12s',
        gridColumn: fullWidth ? '1 / -1' : undefined,
      } as React.CSSProperties}
      onMouseEnter={onClick ? (e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.07)'
      } : undefined}
      onMouseLeave={onClick ? (e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
      } : undefined}
    >
      {/* Accent tint in corner */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 80, height: 80,
        background: `radial-gradient(circle at 100% 0%, ${accent}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 8,
            background: `${accent}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={13} color={accent} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
            {label}
          </span>
        </div>
        {onClick && <ChevronRight size={13} color="var(--text-3)" />}
      </div>

      {children}
    </Tag>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

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
  const [focus,       setFocus]       = useState<string | null>(null)
  const [tip,         setTip]         = useState<string | null>(null)
  const [chapter,     setChapter]     = useState<string | null>(null)
  const [noteLoading, setNoteLoading] = useState(true)
  const [tradingSnap, setTradingSnap] = useState<TradingSnap | null>(null)

  const [voiceListening, setVoiceListening] = useState(false)
  const homeRecRef      = useRef<HomeSpeechRec | null>(null)
  const homeVoiceBaseRef = useRef('')
  const homeFinalRef    = useRef('')
  const [input,       setInput]       = useState('')
  const [submitted,   setSubmitted]   = useState(false)
  const [userAnswer,  setUserAnswer]  = useState('')
  const [reply,       setReply]       = useState<Reply | null>(null)
  const [sending,     setSending]     = useState(false)
  const [addingTask,  setAddingTask]  = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const newTaskRef = useRef<HTMLInputElement>(null)
  const replyRef   = useRef<HTMLDivElement>(null)

  const dayNumber   = profile ? getDayNumber(profile.created_at) : 1
  const todayStr    = toLocalDateStr(new Date())
  const yesterdayStr = toLocalDateStr(new Date(Date.now() - 86400000))

  const pendingTasks  = tasks.filter((t) => !t.completed)
  const todayTasks    = pendingTasks.filter((t) => !t.due_date || t.due_date <= todayStr)
  const futureTasks   = pendingTasks.filter((t) => t.due_date && t.due_date > todayStr)
  const completedToday = [...tasks, ...tasksRecent].filter(
    (t) => t.completed && t.completed_at && t.completed_at.startsWith(todayStr)
  )

  const completedYesterday = tasksRecent.filter(
    (t) => t.completed && t.completed_at && t.completed_at.startsWith(yesterdayStr)
  )
  const yesterdayMood = moodsRecent.find((m) => m.created_at.startsWith(yesterdayStr))

  const now2       = new Date()
  const dayOfWeek  = now2.getDay() === 0 ? 6 : now2.getDay() - 1
  const weekStart  = toLocalDateStr(new Date(now2.getTime() - dayOfWeek * 86400000))
  const weekCompleted = tasksRecent.filter(
    (t) => t.completed && t.completed_at && t.completed_at.slice(0, 10) >= weekStart
  ).length
  const weekTotal  = weekCompleted + pendingTasks.length
  const weekPct    = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0

  const orbState: OrbState = noteLoading ? 'speaking' : (voiceListening || input.trim()) ? 'listening' : 'idle'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.nickname || profile?.full_name?.split(' ')[0] || ''

  // ── Fetch morning note ────────────────────────────────────────────────────
  useEffect(() => {
    const userId  = profile?.id
    const cacheKey = userId ? `jalayu_morning3_${userId}_${todayStr}` : null
    if (cacheKey) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const p = JSON.parse(cached)
          if (p.note)    setMorningNote(p.note)
          if (p.focus)   setFocus(p.focus)
          if (p.tip)     setTip(p.tip)
          if (p.chapter) setChapter(p.chapter)
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
        if (data.note)    setMorningNote(data.note)
        if (data.focus)   setFocus(data.focus)
        if (data.tip)     setTip(data.tip)
        if (data.chapter) setChapter(data.chapter)
        if (cacheKey && data.note) {
          try { localStorage.setItem(cacheKey, JSON.stringify({ note: data.note, focus: data.focus || '', tip: data.tip || '', chapter: data.chapter || '' })) } catch { /* ok */ }
        }
      })
      .catch(() => { if (!cancelled) setMorningNote('A new day to work toward what matters.') })
      .finally(() => { if (!cancelled) setNoteLoading(false) })
    return () => { cancelled = true }
  }, [profile?.id, todayStr])

  // ── Fetch trading snap ────────────────────────────────────────────────────
  useEffect(() => {
    const SEED = 500
    fetch('/api/trading/portfolio')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        const cash = Number(data.cash ?? SEED)
        const positions: Array<{ shares: number; currentPrice: number; avgBuyPrice: number }> = data.positions ?? []
        const posValue = positions.reduce((s, p) => s + Number(p.shares) * Number(p.currentPrice || p.avgBuyPrice), 0)
        const netWorth = cash + posValue
        const totalPnl = netWorth - SEED
        setTradingSnap({
          netWorth, totalPnl,
          totalPnlPct: (totalPnl / SEED) * 100,
          openPositions: positions.length,
          totalTrades: data.totalTrades ?? 0,
        })
      }).catch(() => {})
  }, [])

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

  const pnlPositive = (tradingSnap?.totalPnl ?? 0) >= 0
  const pnlColor    = pnlPositive ? '#22C55E' : '#EF4444'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes jdot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes fadein {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.15); }
        }
        @keyframes homeMicRipple {
          0%   { transform: scale(1);   opacity: 0.5; }
          100% { transform: scale(2.4); opacity: 0;   }
        }
        @keyframes homeMicDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .fade-up { animation: fadein 0.4s ease forwards; }
        .widget-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      `}</style>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 14px 110px' }}>

        {/* ── HERO: Orb + greeting ─────────────────────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 20, paddingBottom: 8, marginBottom: 4,
        }}>
          <GalaxyOrb state={orbState} size={110} />
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '8px 0 2px', letterSpacing: '-0.02em' }}>
            {greeting}{firstName ? `, ${firstName}` : ''}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}Day {dayNumber}
            {chapter ? ` · ${chapter}` : ''}
          </p>
          {(profile?.streak_count ?? 0) > 0 && (
            <div style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 4,
              background: `${AMBER}18`, border: `1px solid ${AMBER}30`,
              borderRadius: 99, padding: '3px 10px',
            }}>
              <span style={{ fontSize: 12 }}>🔥</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: AMBER }}>
                {profile?.streak_count} day streak
              </span>
            </div>
          )}
        </div>

        {/* ── MORNING NOTE ─────────────────────────────────────────────── */}
        <div className="fade-up" style={{
          background: 'var(--morning)', border: '1px solid var(--border)',
          borderRadius: 18, padding: '16px 18px', marginBottom: 14,
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>
            ✦ From Jalayu
          </p>
          {noteLoading ? <Dots /> : (
            <p style={{
              fontFamily: 'var(--font-lora), Georgia, serif',
              fontStyle: 'italic', fontSize: 14, lineHeight: 1.85,
              color: 'var(--text-2)', margin: 0,
            }}>
              {morningNote || 'A new day to work toward what matters.'}
            </p>
          )}
          {!noteLoading && (
            <button
              onClick={() => setShowChatPanel(true)}
              style={{
                marginTop: 10, fontSize: 11, color: 'var(--text-3)',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              keep talking <ChevronRight size={11} />
            </button>
          )}
        </div>

        {/* ── ROW 1: Today + Mood ───────────────────────────────────────── */}
        <div className="widget-grid" style={{ marginBottom: 12 }}>

          {/* TODAY */}
          <Widget accent="#6366F1" icon={CheckSquare} label="Today" onClick={() => setSidebarView('calendar')} minHeight={120}>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1, margin: '0 0 4px' }}>
              {todayTasks.length}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>
              {todayTasks.length === 1 ? 'task left' : 'tasks left'}
            </p>
            {completedToday.length > 0 && (
              <p style={{ fontSize: 11, color: '#6366F1', margin: '6px 0 0', fontWeight: 600 }}>
                ✓ {completedToday.length} done today
              </p>
            )}
            {todayTasks[0] && (
              <p style={{
                fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Next: {todayTasks[0].title}
              </p>
            )}
          </Widget>

          {/* MOOD */}
          <Widget accent="#F43F5E" icon={Heart} label="Mood" onClick={() => setSidebarView('wellness')} minHeight={120}>
            {todayMood ? (
              <>
                <p style={{ fontSize: 36, lineHeight: 1, margin: '0 0 4px' }}>
                  {MOOD_EMOJI[todayMood.score]}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>
                  {MOOD_LABEL[todayMood.score]} today
                </p>
                {yesterdayMood && (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '6px 0 0' }}>
                    Yesterday: {MOOD_EMOJI[yesterdayMood.score]}
                  </p>
                )}
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>
                  Not logged yet
                </p>
                <div style={{ display: 'flex', gap: 4 }}>
                  {MOODS.map(({ score, emoji, label }) => (
                    <button
                      key={score}
                      onClick={(e) => { e.stopPropagation(); onMoodLog(score) }}
                      title={label}
                      style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', padding: 2, transition: 'transform 0.12s' }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(1.3)'}
                      onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                    >{emoji}</button>
                  ))}
                </div>
              </>
            )}
          </Widget>
        </div>

        {/* ── TRADING — full width ──────────────────────────────────────── */}
        <Widget accent={pnlColor} icon={tradingSnap && pnlPositive ? TrendingUp : TrendingDown}
          label="Trading Portfolio" onClick={() => setSidebarView('trading')}
          fullWidth minHeight={0}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1, margin: '0 0 4px' }}>
                {tradingSnap ? `$${tradingSnap.netWorth.toFixed(2)}` : '—'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>
                Net worth · {tradingSnap?.openPositions ?? 0} open positions
              </p>
            </div>
            {tradingSnap && (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: pnlColor, margin: '0 0 2px', lineHeight: 1 }}>
                  {pnlPositive ? '+' : ''}{tradingSnap.totalPnl.toFixed(2)}
                </p>
                <p style={{ fontSize: 11, color: pnlColor, margin: 0, opacity: 0.8 }}>
                  {pnlPositive ? '+' : ''}{tradingSnap.totalPnlPct.toFixed(2)}%
                </p>
              </div>
            )}
          </div>
          {tradingSnap && (
            <div style={{
              marginTop: 12, display: 'flex', gap: 8,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '3px 8px',
                background: `${pnlColor}15`, color: pnlColor,
                borderRadius: 99, letterSpacing: '0.04em',
              }}>
                {tradingSnap.totalTrades} trades
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setSidebarView('strategylab') }}
                style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px',
                  background: 'var(--morning)', color: 'var(--text-3)',
                  border: '1px solid var(--border)', borderRadius: 99,
                  cursor: 'pointer', letterSpacing: '0.04em',
                }}
              >
                ⚗ Strategy Lab
              </button>
            </div>
          )}
        </Widget>

        <div style={{ height: 12 }} />

        {/* ── ROW 2: Memory + Reflect ───────────────────────────────────── */}
        <div className="widget-grid" style={{ marginBottom: 12 }}>

          <Widget accent="#F59E0B" icon={BookOpen} label="Memory" onClick={() => setSidebarView('memory')} minHeight={110}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>
              Your second brain
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
              Notes, insights & things worth keeping
            </p>
          </Widget>

          <Widget accent="#8B5CF6" icon={Sparkles} label="Reflect" onClick={() => setSidebarView('reflect')} minHeight={110}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>
              Daily reflection
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
              Capture what the day taught you
            </p>
          </Widget>
        </div>

        {/* ── ROW 3: Progress + Health ──────────────────────────────────── */}
        <div className="widget-grid" style={{ marginBottom: 12 }}>

          <Widget accent={AMBER} icon={BarChart2} label="Progress" onClick={() => setSidebarView('progress')} minHeight={110}>
            <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1, margin: '0 0 4px' }}>
              {profile?.growth_score ?? 0}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>
              growth points
            </p>
            <div style={{ marginTop: 8, height: 4, background: 'var(--border)', borderRadius: 99 }}>
              <div style={{
                height: '100%', borderRadius: 99,
                width: `${Math.min(weekPct, 100)}%`,
                background: `linear-gradient(90deg, ${AMBER}, #E8AA6A)`,
                transition: 'width 1s cubic-bezier(0.34,1.56,0.64,1)',
              }} />
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '4px 0 0' }}>
              {weekPct}% this week
            </p>
          </Widget>

          <Widget accent="#14B8A6" icon={Stethoscope} label="Health" onClick={() => setSidebarView('health')} minHeight={110}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>
              Insurance & meds
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
              Coverage, appointments & records
            </p>
          </Widget>
        </div>

        {/* ── ROW 4: Intelligence + People ─────────────────────────────── */}
        <div className="widget-grid" style={{ marginBottom: 12 }}>

          <Widget accent="#6366F1" icon={Brain} label="Intelligence" onClick={() => setSidebarView('insights')} minHeight={110}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>
              AI-powered insights
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
              Patterns from your data
            </p>
          </Widget>

          <Widget accent="#EC4899" icon={Users} label="People" onClick={() => setSidebarView('people')} minHeight={110}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>
              Your circle
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
              Contacts & relationships
            </p>
          </Widget>
        </div>

        {/* ── ROW 5: Strategy Lab + Reminders ──────────────────────────── */}
        <div className="widget-grid" style={{ marginBottom: 14 }}>

          <Widget accent="#22C55E" icon={FlaskConical} label="Strategy Lab" onClick={() => setSidebarView('strategylab')} minHeight={100}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>
              Win rates by setup
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
              Enable / disable strategies
            </p>
          </Widget>

          <Widget accent="#F97316" icon={Bell} label="Reminders" onClick={() => setSidebarView('reminders')} minHeight={100}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>
              Never miss it
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
              Smart reminders & alerts
            </p>
          </Widget>
        </div>

        {/* ── QUICK TASKS (today, compact) ──────────────────────────────── */}
        {(todayTasks.length > 0 || addingTask) && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '16px 18px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: '#6366F115', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckSquare size={13} color="#6366F1" />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  Today&apos;s tasks
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {completedToday.length > 0 && (
                  <span style={{ fontSize: 11, color: '#6366F1', fontWeight: 600 }}>
                    {completedToday.length} done
                  </span>
                )}
                <button
                  onClick={() => setSidebarView('calendar')}
                  style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  see all →
                </button>
              </div>
            </div>

            {todayTasks.slice(0, 4).map((task) => (
              <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 9 }}>
                <button
                  onClick={() => onToggleTask(task)}
                  style={{
                    width: 17, height: 17, borderRadius: '50%', marginTop: 2,
                    border: `1.5px solid ${task.priority === 'high' ? '#DC2626' : task.priority === 'medium' ? AMBER : 'var(--border-2)'}`,
                    background: 'transparent', cursor: 'pointer', flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, flex: 1 }}>
                  {task.title}
                  {task.priority === 'high' && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.07)', padding: '1px 5px', borderRadius: 4, marginLeft: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>high</span>
                  )}
                </span>
              </div>
            ))}

            {addingTask ? (
              <form onSubmit={handleAddTask} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
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
                    fontSize: 13, color: 'var(--text)', outline: 'none',
                    fontFamily: 'inherit', borderBottom: '1px solid var(--border-2)', paddingBottom: 2,
                  }}
                />
              </form>
            ) : (
              <button
                onClick={() => setAddingTask(true)}
                style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}
              >
                + add task
              </button>
            )}
          </div>
        )}

        {/* ── ASK JALAYU — chat widget ──────────────────────────────────── */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '16px 18px', marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: `${AMBER}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={13} color={AMBER} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
              Ask Jalayu
            </span>
            {/* Orb state pulse dot */}
            <div style={{
              width: 6, height: 6, borderRadius: '50%', marginLeft: 2,
              background: orbState === 'idle' ? 'var(--text-3)' : orbState === 'listening' ? '#EF4444' : AMBER,
              animation: orbState !== 'idle' ? 'pulse 1.2s ease-in-out infinite' : 'none',
            }} />
          </div>

          {!submitted ? (
            <>
              {focus && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px', fontStyle: 'italic' }}>
                  Focus today: &ldquo;{focus}&rdquo;
                </p>
              )}
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 8,
                borderBottom: `1.5px solid ${voiceListening ? 'rgba(220,38,38,0.35)' : 'var(--border-2)'}`,
                paddingBottom: 6, transition: 'border-color 0.2s',
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={voiceListening ? 'Listening…' : "Tell me anything — I'll handle it"}
                  rows={1}
                  style={{
                    flex: 1, resize: 'none', border: 'none', background: 'transparent',
                    fontSize: 14, color: 'var(--text)', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.7, overflow: 'hidden',
                    minHeight: 28, maxHeight: 140, padding: 0,
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
                      cursor: 'pointer', transition: 'all 0.2s', zIndex: 1,
                    }}
                  >
                    {voiceListening ? <MicOff size={13} color="#DC2626" /> : <Mic size={13} color="var(--text-3)" />}
                  </button>
                </div>
              </div>
              {voiceListening && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 11, color: '#DC2626' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#DC2626', flexShrink: 0, animation: 'homeMicDot 1.1s ease-in-out infinite' }} />
                  Listening — tap mic to stop
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
            </>
          ) : (
            <div className="fade-up" ref={replyRef}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px', lineHeight: 1.5 }}>
                {userAnswer}
              </p>
              {reply && (
                reply.content ? (
                  <p style={{
                    fontFamily: 'var(--font-lora), Georgia, serif',
                    fontStyle: 'italic', fontSize: 14, lineHeight: 1.85,
                    color: 'var(--text-2)', margin: 0,
                  }}>
                    {reply.content}
                    {reply.streaming && (
                      <span style={{
                        display: 'inline-block', width: 2, height: 13, background: 'var(--text-3)',
                        marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite',
                      }} />
                    )}
                  </p>
                ) : <Dots />
              )}
              {reply && !reply.streaming && (
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

      </div>
    </>
  )
}
