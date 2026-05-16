'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mic, MicOff, ChevronRight,
  TrendingUp, TrendingDown, CheckSquare, Heart,
  BookOpen, Sparkles, Brain, Stethoscope,
  Users, Bell, FlaskConical, BarChart2, Zap,
  CalendarDays, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { Profile, Task, Mood } from '@/lib/types'
import { useStore } from '@/store/useStore'
import { getDayNumber } from '@/lib/utils'
import GalaxyOrb from '@/components/GalaxyOrb'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TradingSnap {
  netWorth: number; totalPnl: number; totalPnlPct: number
  openPositions: number; totalTrades: number
}

interface CalEvent {
  title: string
  start: string | null
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

type Reply    = { content: string; streaming: boolean }
type OrbState = 'idle' | 'listening' | 'speaking'

const MOODS = [
  { score: 1, emoji: '😔', label: 'Rough' },
  { score: 2, emoji: '😕', label: 'Low'   },
  { score: 3, emoji: '😐', label: 'Okay'  },
  { score: 4, emoji: '🙂', label: 'Good'  },
  { score: 5, emoji: '😊', label: 'Great' },
]
const MOOD_EMOJI:  Record<number, string> = { 1: '😔', 2: '😕', 3: '😐', 4: '🙂', 5: '😊' }
const MOOD_LABEL:  Record<number, string> = { 1: 'Rough', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' }
const AMBER = '#C4834A'

const QUOTES: { text: string; author: string }[] = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { text: "Success is not final, failure is not fatal — it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Don't watch the clock; do what it does — keep going.", author: "Sam Levenson" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "The difference between ordinary and extraordinary is that little extra.", author: "Jimmy Johnson" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "The harder I work, the luckier I get.", author: "Samuel Goldwyn" },
  { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
  { text: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { text: "Little by little, one travels far.", author: "J.R.R. Tolkien" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James" },
  { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
  { text: "Don't limit your challenges — challenge your limits.", author: "Jerry Dunn" },
  { text: "All our dreams can come true, if we have the courage to pursue them.", author: "Walt Disney" },
  { text: "The best time to plant a tree was twenty years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
  { text: "You are never too old to set another goal or dream a new dream.", author: "C.S. Lewis" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "The only limit to our realization of tomorrow is our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
  { text: "Spread love everywhere you go. Let no one ever come to you without leaving happier.", author: "Mother Teresa" },
  { text: "When you reach the end of your rope, tie a knot in it and hang on.", author: "Franklin D. Roosevelt" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "Too many of us are not living our dreams because we are living our fears.", author: "Les Brown" },
  { text: "I have learned over the years that when one's mind is made up, this diminishes fear.", author: "Rosa Parks" },
  { text: "It's not whether you get knocked down, it's whether you get up.", author: "Vince Lombardi" },
  { text: "Winning isn't everything, but wanting to win is.", author: "Vince Lombardi" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "The most common way people give up their power is by thinking they don't have any.", author: "Alice Walker" },
  { text: "Even if you're on the right track, you'll get run over if you just sit there.", author: "Will Rogers" },
  { text: "Darkness cannot drive out darkness; only light can do that.", author: "Martin Luther King Jr." },
  { text: "Perfection is not attainable, but if we chase perfection we can catch excellence.", author: "Vince Lombardi" },
  { text: "Life shrinks or expands in proportion to one's courage.", author: "Anaïs Nin" },
  { text: "If you want to lift yourself up, lift up someone else.", author: "Booker T. Washington" },
  { text: "I am not a product of my circumstances. I am a product of my decisions.", author: "Stephen Covey" },
  { text: "Every strike brings me closer to the next home run.", author: "Babe Ruth" },
  { text: "Whatever the mind of man can conceive and believe, it can achieve.", author: "Napoleon Hill" },
  { text: "Eighty percent of success is showing up.", author: "Woody Allen" },
  { text: "I've missed more than 9,000 shots in my career. That's why I succeed.", author: "Michael Jordan" },
  { text: "Don't be afraid to give up the good to go for the great.", author: "John D. Rockefeller" },
  { text: "The question isn't who is going to let me — it's who is going to stop me.", author: "Ayn Rand" },
]

function randomQuote(): { text: string; author: string } {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)]
}

function formatEventTime(start: string | null, todayStr: string): { label: string; isToday: boolean; isTomorrow: boolean } {
  if (!start) return { label: 'All day', isToday: false, isTomorrow: false }
  const d = new Date(start)
  if (Number.isNaN(d.getTime())) return { label: start, isToday: false, isTomorrow: false }
  // all-day events have date-only strings (no T)
  if (!start.includes('T')) {
    const dateStr = start
    const isToday = dateStr === todayStr
    const tomorrow = new Date(Date.now() + 86400000)
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
    const isTomorrow = dateStr === tomorrowStr
    return { label: isToday ? 'Today · all day' : isTomorrow ? 'Tomorrow · all day' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isToday, isTomorrow }
  }
  const isToday = start.startsWith(todayStr)
  const tomorrow = new Date(Date.now() + 86400000)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  const isTomorrow = start.startsWith(tomorrowStr)
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (isToday) return { label: `Today · ${timeStr}`, isToday: true, isTomorrow: false }
  if (isTomorrow) return { label: `Tomorrow · ${timeStr}`, isToday: false, isTomorrow: true }
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + timeStr, isToday: false, isTomorrow: false }
}

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 20 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)',
          display: 'inline-block', animation: `jdot 1.3s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Widget card ───────────────────────────────────────────────────────────────

function W({
  accent, icon: Icon, label, onClick, children, className = '',
}: {
  accent: string; icon: React.ComponentType<{ size?: number; color?: string }>
  label: string; onClick?: () => void; children: React.ReactNode; className?: string
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`hwidget ${className}`}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 18, padding: '14px 16px',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative', overflow: 'hidden',
      } as React.CSSProperties}
    >
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 90, height: 90,
        background: `radial-gradient(circle at 100% 0%, ${accent}1A 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 7,
            background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={12} color={accent} />
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {label}
          </span>
        </div>
        {onClick && <ChevronRight size={12} color="var(--text-3)" />}
      </div>
      {children}
    </Tag>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HomeContent({
  profile, tasks, tasksRecent = [], todayMood, moodsRecent = [],
  onMoodLog, onAddTask, onToggleTask, onAction,
}: {
  journeyView?: string; profile: Profile | null; tasks: Task[]
  tasksRecent?: Task[]; todayMood: Mood | null; notes?: unknown[]
  moodsRecent?: Mood[]; daysSinceSignup?: number
  onMoodLog: (score: number) => void
  onAddTask: (title: string) => Promise<void>
  onToggleTask: (task: Task) => Promise<void>
  onAction?: (actions: Array<{ type: string; data: Record<string, unknown>; message: string }>) => void
}) {
  const setShowChatPanel = useStore((s) => s.setShowChatPanel)
  const setSidebarView   = useStore((s) => s.setSidebarView)

  const [morningNote, setMorningNote] = useState<string | null>(null)
  const [focus,       setFocus]       = useState<string | null>(null)
  const [chapter,     setChapter]     = useState<string | null>(null)
  const [noteLoading, setNoteLoading] = useState(true)
  const [tradingSnap, setTradingSnap] = useState<TradingSnap | null>(null)
  const [calEvents,   setCalEvents]   = useState<CalEvent[]>([])
  const [calConnected, setCalConnected] = useState<boolean | null>(null)
  const [quote] = useState<{ text: string; author: string }>(randomQuote)
  const [voiceListening, setVoiceListening] = useState(false)
  const homeRecRef       = useRef<HomeSpeechRec | null>(null)
  const homeVoiceBaseRef = useRef('')
  const homeFinalRef     = useRef('')
  const [input,       setInput]      = useState('')
  const [submitted,   setSubmitted]  = useState(false)
  const [userAnswer,  setUserAnswer] = useState('')
  const [reply,       setReply]      = useState<Reply | null>(null)
  const [sending,     setSending]    = useState(false)
  const [addingTask,  setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const replyRef   = useRef<HTMLDivElement>(null)

  const dayNumber  = profile ? getDayNumber(profile.created_at) : 1
  const todayStr   = toLocalDateStr(new Date())
  const yesterdayStr = toLocalDateStr(new Date(Date.now() - 86400000))

  const pendingTasks   = tasks.filter((t) => !t.completed)
  const todayTasks     = pendingTasks.filter((t) => !t.due_date || t.due_date <= todayStr)
  const futureTasks    = pendingTasks.filter((t) => t.due_date && t.due_date > todayStr)
  const completedToday = [...tasks, ...tasksRecent].filter(
    (t) => t.completed && t.completed_at && t.completed_at.startsWith(todayStr)
  )
  const yesterdayMood  = moodsRecent.find((m) => m.created_at.startsWith(yesterdayStr))

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

  const pnlPositive = (tradingSnap?.totalPnl ?? 0) >= 0
  const pnlColor    = pnlPositive ? '#22C55E' : '#EF4444'

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const userId   = profile?.id
    const cacheKey = userId ? `jalayu_morning3_${userId}_${todayStr}` : null
    if (cacheKey) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const p = JSON.parse(cached)
          if (p.note)    setMorningNote(p.note)
          if (p.focus)   setFocus(p.focus)
          if (p.chapter) setChapter(p.chapter)
          setNoteLoading(false); return
        }
      } catch { /* proceed */ }
    }
    let cancelled = false
    setNoteLoading(true)
    fetch('/api/ai/morning').then((r) => r.json()).then((data) => {
      if (cancelled) return
      if (data.note)    setMorningNote(data.note)
      if (data.focus)   setFocus(data.focus)
      if (data.chapter) setChapter(data.chapter)
      if (cacheKey && data.note) {
        try { localStorage.setItem(cacheKey, JSON.stringify({ note: data.note, focus: data.focus || '', tip: '', chapter: data.chapter || '' })) } catch { /* ok */ }
      }
    }).catch(() => { if (!cancelled) setMorningNote('A new day to work toward what matters.') })
      .finally(() => { if (!cancelled) setNoteLoading(false) })
    return () => { cancelled = true }
  }, [profile?.id, todayStr])

  useEffect(() => {
    fetch('/api/trading/portfolio').then((r) => r.ok ? r.json() : null).then((data) => {
      if (!data) return
      const SEED = 500
      const cash = Number(data.cash ?? SEED)
      const positions: Array<{ shares: number; currentPrice: number; avgBuyPrice: number }> = data.positions ?? []
      const posValue = positions.reduce((s, p) => s + Number(p.shares) * Number(p.currentPrice || p.avgBuyPrice), 0)
      const netWorth = cash + posValue
      const totalPnl = netWorth - SEED
      setTradingSnap({ netWorth, totalPnl, totalPnlPct: (totalPnl / SEED) * 100, openPositions: positions.length, totalTrades: data.totalTrades ?? 0 })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/calendar/events')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        setCalConnected(data.connected ?? false)
        setCalEvents((data.events ?? []).slice(0, 5))
      })
      .catch(() => { setCalConnected(false) })
  }, [])

  useEffect(() => {
    if (reply) replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [reply])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])

  // ── Voice ──────────────────────────────────────────────────────────────────
  const stopHomeVoice = useCallback(() => {
    homeRecRef.current?.stop(); homeRecRef.current = null; setVoiceListening(false)
  }, [])

  const startHomeVoice = useCallback(async () => {
    if (voiceListening) { stopHomeVoice(); return }
    const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
    if (!SR) { toast.error('Voice not supported.'); return }
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()) }
    catch { toast.error('Microphone access denied.'); return }
    const rec = new SR()
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US'
    homeVoiceBaseRef.current = input.trim(); homeFinalRef.current = ''
    rec.onresult = (ev) => {
      let f = ''; let im = ''
      for (let i = 0; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) f += r[0].transcript; else im += r[0].transcript }
      homeFinalRef.current = f
      setInput([homeVoiceBaseRef.current, f, im].filter(Boolean).join(' '))
    }
    rec.onerror = (ev) => { if (ev.error !== 'no-speech') toast.error('Voice stopped.'); setVoiceListening(false) }
    rec.onend = () => {
      const clean = [homeVoiceBaseRef.current, homeFinalRef.current].filter(Boolean).join(' ').trim()
      if (clean) setInput(clean); setVoiceListening(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    homeRecRef.current = rec; setVoiceListening(true); rec.start()
  }, [voiceListening, stopHomeVoice, input])

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setUserAnswer(text); setSubmitted(true); setSending(true)
    setReply({ content: '', streaming: true }); setInput('')
    const actionsPromise = fetch('/api/ai/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, recentMessages: [{ role: 'user', content: text }] }),
    }).then((r) => r.json()).catch(() => ({ executed: [] }))
    try {
      const focusPrefix = focus ? `[Context: Jalayu recommended today's focus as "${focus}". The user's response is:] ` : ''
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: focusPrefix + text }] }),
      })
      if (!res.ok || !res.body) { setReply({ content: "I'm here. Keep going.", streaming: false }); return }
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let content = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        content += decoder.decode(value, { stream: true }); setReply({ content, streaming: true })
      }
      setReply({ content, streaming: false })
      actionsPromise.then((r: { executed: Array<{ type: string; data: Record<string, unknown>; message: string }> }) => { if (r.executed?.length) onAction?.(r.executed) })
      if (text && content) {
        fetch('/api/chat/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: text }, { role: 'assistant', content }] }) }).catch(() => {})
      }
    } catch { setReply({ content: "I'm here. Keep going.", streaming: false }) }
    finally { setSending(false) }
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes jdot { 0%,60%,100%{transform:translateY(0);opacity:.35} 30%{transform:translateY(-5px);opacity:1} }
        @keyframes fadein { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pulse { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes micripple { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(2.4);opacity:0} }
        @keyframes micdot { 0%,100%{opacity:1} 50%{opacity:.25} }
        .fade-up { animation: fadein .35s ease forwards; }
        .hwidget { transition: transform .12s, box-shadow .12s; }
        .hwidget:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.07); }

        /* ── Layout ────────────────────────────────────────── */
        .home-outer {
          width: 100%; max-width: 1440px;
          margin: 0 auto;
          padding: 20px 20px 100px;
          box-sizing: border-box;
        }
        .home-3col {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }

        /* 2-col: tablet */
        @media (min-width: 768px) {
          .home-3col {
            grid-template-columns: 280px 1fr;
            align-items: start;
          }
          .home-right { display: none; }
        }

        /* 3-col: desktop */
        @media (min-width: 1100px) {
          .home-outer { padding: 24px 32px 40px; }
          .home-3col {
            grid-template-columns: 260px 1fr 260px;
            gap: 16px;
            align-items: start;
          }
          .home-right { display: flex !important; flex-direction: column; gap: 12px; }
        }

        /* widget inner grid */
        .w2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .w-full { grid-column: 1 / -1; }

        /* scrollable tasks on desktop */
        @media (min-width: 1100px) {
          .tasks-scroll { max-height: 340px; overflow-y: auto; }
          .tasks-scroll::-webkit-scrollbar { width: 3px; }
          .tasks-scroll::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }
        }
      `}</style>

      <div className="home-outer">
        <div className="home-3col">

          {/* ═══════════════════════════════════════
              LEFT COLUMN — orb, identity, chat
          ══════════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Identity card */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 20, padding: '20px 18px 16px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
            }}>
              <GalaxyOrb state={orbState} size={100} />
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '10px 0 3px', letterSpacing: '-0.02em' }}>
                {greeting}{firstName ? `, ${firstName}` : ''}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {' · '}Day {dayNumber}
              </p>
              {chapter && (
                <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '3px 0 0', fontStyle: 'italic', opacity: 0.8 }}>
                  {chapter}
                </p>
              )}
              {(profile?.streak_count ?? 0) > 0 && (
                <div style={{
                  marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: `${AMBER}18`, border: `1px solid ${AMBER}30`,
                  borderRadius: 99, padding: '3px 10px',
                }}>
                  <span style={{ fontSize: 12 }}>🔥</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: AMBER }}>{profile?.streak_count} day streak</span>
                </div>
              )}
            </div>

            {/* Morning note */}
            <div style={{
              background: 'var(--morning)', border: '1px solid var(--border)',
              borderRadius: 18, padding: '14px 16px',
            }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px' }}>
                ✦ From Jalayu
              </p>
              {noteLoading ? <Dots /> : (
                <p style={{
                  fontFamily: 'var(--font-lora), Georgia, serif',
                  fontStyle: 'italic', fontSize: 13, lineHeight: 1.8,
                  color: 'var(--text-2)', margin: 0,
                }}>
                  {morningNote || 'A new day to work toward what matters.'}
                </p>
              )}
              {!noteLoading && (
                <button onClick={() => setShowChatPanel(true)} style={{
                  marginTop: 8, fontSize: 11, color: 'var(--text-3)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  keep talking <ChevronRight size={10} />
                </button>
              )}
            </div>

            {/* Ask Jalayu */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 18, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: `${AMBER}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={11} color={AMBER} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ask Jalayu</span>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', marginLeft: 'auto',
                  background: orbState === 'idle' ? 'var(--border-2)' : orbState === 'listening' ? '#EF4444' : AMBER,
                  animation: orbState !== 'idle' ? 'pulse 1.2s ease-in-out infinite' : 'none',
                }} />
              </div>

              {!submitted ? (
                <>
                  {focus && (
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 6px', fontStyle: 'italic', lineHeight: 1.5 }}>
                      &ldquo;{focus}&rdquo;
                    </p>
                  )}
                  <div style={{
                    display: 'flex', alignItems: 'flex-end', gap: 8,
                    borderBottom: `1.5px solid ${voiceListening ? 'rgba(220,38,38,0.35)' : 'var(--border-2)'}`,
                    paddingBottom: 6, transition: 'border-color .2s',
                  }}>
                    <textarea
                      ref={inputRef} value={input}
                      onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder={voiceListening ? 'Listening…' : "Tell me anything…"}
                      rows={1}
                      style={{
                        flex: 1, resize: 'none', border: 'none', background: 'transparent',
                        fontSize: 13, color: 'var(--text)', outline: 'none',
                        fontFamily: 'inherit', lineHeight: 1.7, overflow: 'hidden',
                        minHeight: 26, maxHeight: 100, padding: 0,
                      }}
                    />
                    <div style={{ position: 'relative', flexShrink: 0, marginBottom: 2 }}>
                      {voiceListening && (
                        <>
                          <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: 'rgba(220,38,38,.18)', animation: 'micripple 1.4s ease-out infinite', pointerEvents: 'none' }} />
                          <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: 'rgba(220,38,38,.12)', animation: 'micripple 1.4s ease-out .55s infinite', pointerEvents: 'none' }} />
                        </>
                      )}
                      <button type="button" onClick={startHomeVoice} style={{
                        position: 'relative', width: 26, height: 26, borderRadius: '50%',
                        border: voiceListening ? '1.5px solid rgba(220,38,38,.4)' : '1px solid var(--border)',
                        background: voiceListening ? 'rgba(220,38,38,.06)' : 'var(--surface-2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all .2s', zIndex: 1,
                      }}>
                        {voiceListening ? <MicOff size={12} color="#DC2626" /> : <Mic size={12} color="var(--text-3)" />}
                      </button>
                    </div>
                  </div>
                  {input.trim() && (
                    <button onClick={sendMessage} style={{
                      marginTop: 8, fontSize: 11, color: 'var(--text-3)', background: 'none',
                      border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2,
                    }}>send → (or Enter)</button>
                  )}
                </>
              ) : (
                <div className="fade-up" ref={replyRef}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.5 }}>{userAnswer}</p>
                  {reply && (
                    reply.content
                      ? <p style={{ fontFamily: 'var(--font-lora), Georgia, serif', fontStyle: 'italic', fontSize: 13, lineHeight: 1.8, color: 'var(--text-2)', margin: 0 }}>
                          {reply.content}
                          {reply.streaming && <span style={{ display: 'inline-block', width: 2, height: 12, background: 'var(--text-3)', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />}
                        </p>
                      : <Dots />
                  )}
                  {reply && !reply.streaming && (
                    <button onClick={() => setShowChatPanel(true)} style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      keep talking <ChevronRight size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════
              CENTER COLUMN — main widget grid
          ══════════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ── Daily quote ── */}
            <div style={{
              background: `linear-gradient(135deg, ${AMBER}12 0%, transparent 60%)`,
              border: `1px solid ${AMBER}28`,
              borderRadius: 18, padding: '14px 18px',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: -10, right: -10, fontSize: 60,
                color: AMBER, opacity: 0.07, lineHeight: 1, pointerEvents: 'none',
                fontFamily: 'Georgia, serif', fontStyle: 'italic',
              }}>&ldquo;</div>
              <p style={{ fontSize: 9, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px', textAlign: 'center' }}>
                ✦ Daily Inspiration
              </p>
              <p style={{
                fontFamily: 'var(--font-lora), Georgia, serif',
                fontStyle: 'italic', fontSize: 14, lineHeight: 1.75,
                color: 'var(--text)', margin: '0 0 8px', fontWeight: 500,
                textAlign: 'center',
              }}>
                &ldquo;{quote.text}&rdquo;
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, fontWeight: 600, textAlign: 'center' }}>
                — {quote.author}
              </p>
            </div>

            {/* Row: Today + Mood */}
            <div className="w2">
              <W accent="#6366F1" icon={CheckSquare} label="Today" onClick={() => setSidebarView('calendar')}>
                <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', lineHeight: 1, margin: '0 0 3px' }}>
                  {todayTasks.length}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>
                  {todayTasks.length === 1 ? 'task left' : 'tasks left'}
                </p>
                {completedToday.length > 0 && (
                  <p style={{ fontSize: 10, color: '#6366F1', margin: '5px 0 0', fontWeight: 600 }}>
                    ✓ {completedToday.length} done
                  </p>
                )}
              </W>

              <W accent="#F43F5E" icon={Heart} label="Mood" onClick={() => setSidebarView('wellness')}>
                {todayMood ? (
                  <>
                    <p style={{ fontSize: 32, lineHeight: 1, margin: '0 0 3px' }}>{MOOD_EMOJI[todayMood.score]}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>{MOOD_LABEL[todayMood.score]}</p>
                    {yesterdayMood && <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '5px 0 0' }}>Yesterday {MOOD_EMOJI[yesterdayMood.score]}</p>}
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 7px' }}>Log today</p>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {MOODS.map(({ score, emoji, label }) => (
                        <button key={score} onClick={(e) => { e.stopPropagation(); onMoodLog(score) }} title={label}
                          style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 1, transition: 'transform .12s' }}
                          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(1.3)'}
                          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                        >{emoji}</button>
                      ))}
                    </div>
                  </>
                )}
              </W>
            </div>

            {/* Trading — full width */}
            <W accent={pnlColor} icon={tradingSnap && pnlPositive ? TrendingUp : TrendingDown}
              label="Trading Portfolio" onClick={() => setSidebarView('trading')}
            >
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1, margin: '0 0 3px' }}>
                    {tradingSnap ? `$${tradingSnap.netWorth.toFixed(2)}` : '—'}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0 }}>
                    Net worth · {tradingSnap?.openPositions ?? 0} open · {tradingSnap?.totalTrades ?? 0} trades
                  </p>
                </div>
                {tradingSnap && (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: pnlColor, margin: '0 0 1px', lineHeight: 1 }}>
                      {pnlPositive ? '+' : ''}{tradingSnap.totalPnl.toFixed(2)}
                    </p>
                    <p style={{ fontSize: 11, color: pnlColor, margin: 0, opacity: 0.8 }}>
                      {pnlPositive ? '+' : ''}{tradingSnap.totalPnlPct.toFixed(2)}%
                    </p>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', background: `${pnlColor}12`, color: pnlColor, borderRadius: 99 }}>
                  24/7 auto trading
                </span>
                <button onClick={(e) => { e.stopPropagation(); setSidebarView('strategylab') }}
                  style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', background: 'var(--morning)', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 99, cursor: 'pointer' }}>
                  ⚗ Strategy Lab
                </button>
              </div>
            </W>

            {/* Row: Memory + Reflect */}
            <div className="w2">
              <W accent="#F59E0B" icon={BookOpen} label="Memory" onClick={() => setSidebarView('memory')}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>Second brain</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Notes & insights</p>
              </W>
              <W accent="#8B5CF6" icon={Sparkles} label="Reflect" onClick={() => setSidebarView('reflect')}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>Daily reflection</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>What today taught you</p>
              </W>
            </div>

            {/* Row: Intelligence + People */}
            <div className="w2">
              <W accent="#6366F1" icon={Brain} label="Intelligence" onClick={() => setSidebarView('insights')}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>AI insights</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Patterns from your data</p>
              </W>
              <W accent="#EC4899" icon={Users} label="People" onClick={() => setSidebarView('people')}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>Your circle</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Contacts & relationships</p>
              </W>
            </div>

            {/* Row: Health + Reminders (mobile only — on desktop these go in right col) */}
            <div className="w2" style={{ display: 'none' }} id="mobile-extra-row" />
          </div>

          {/* ═══════════════════════════════════════
              RIGHT COLUMN — tasks, stats, quick nav
              Hidden on mobile/tablet, shown on desktop
          ══════════════════════════════════════════ */}
          <div className="home-right" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>

            {/* Tasks */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 18, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: '#6366F115', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckSquare size={11} color="#6366F1" />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Today</span>
                </div>
                <button onClick={() => setSidebarView('calendar')} style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  see all →
                </button>
              </div>

              <div className="tasks-scroll">
                {completedToday.slice(0, 2).map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, opacity: 0.4 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'line-through', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  </div>
                ))}

                {todayTasks.length === 0 && completedToday.length === 0 && !addingTask && (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px' }}>Nothing for today yet.</p>
                )}

                {todayTasks.map((task) => (
                  <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <button onClick={() => onToggleTask(task)} style={{
                      width: 15, height: 15, borderRadius: '50%', marginTop: 2, flexShrink: 0,
                      border: `1.5px solid ${task.priority === 'high' ? '#DC2626' : task.priority === 'medium' ? AMBER : 'var(--border-2)'}`,
                      background: 'transparent', cursor: 'pointer',
                    }} />
                    <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, flex: 1 }}>
                      {task.title}
                      {task.priority === 'high' && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,.07)', padding: '1px 4px', borderRadius: 3, marginLeft: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>!</span>
                      )}
                    </span>
                  </div>
                ))}

                {futureTasks.length > 0 && (
                  <div style={{ paddingTop: 8, borderTop: '1px dashed var(--border)', marginTop: 4 }}>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '0 0 6px' }}>Coming up ({futureTasks.length})</p>
                    {futureTasks.slice(0, 3).map((t) => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--text-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        {t.due_date && (
                          <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
                            {new Date(t.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {addingTask ? (
                  <form onSubmit={handleAddTask} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <div style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid var(--text-3)', flexShrink: 0 }} />
                    <input
                      value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="add a task…" autoFocus
                      onBlur={() => { if (!newTaskTitle.trim()) setAddingTask(false) }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle('') } }}
                      style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', borderBottom: '1px solid var(--border-2)', paddingBottom: 2 }}
                    />
                  </form>
                ) : (
                  <button onClick={() => setAddingTask(true)} style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 6 }}>
                    + add task
                  </button>
                )}
              </div>
            </div>

            {/* Progress */}
            <W accent={AMBER} icon={BarChart2} label="Progress" onClick={() => setSidebarView('progress')}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1, margin: '0 0 2px' }}>{profile?.growth_score ?? 0}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-2)', margin: 0 }}>growth points</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: AMBER, margin: '0 0 1px' }}>{weekPct}%</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>this week</p>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${weekPct}%`, background: `linear-gradient(90deg, ${AMBER}, #E8AA6A)`, borderRadius: 99, transition: 'width 1s cubic-bezier(.34,1.56,.64,1)' }} />
              </div>
            </W>

            {/* Health */}
            <W accent="#14B8A6" icon={Stethoscope} label="Health" onClick={() => setSidebarView('health')}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>Insurance & meds</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Coverage, appointments & records</p>
            </W>

            {/* Strategy Lab */}
            <W accent="#22C55E" icon={FlaskConical} label="Strategy Lab" onClick={() => setSidebarView('strategylab')}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>Win rates by setup</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Enable / disable strategies</p>
            </W>

            {/* Calendar & Reminders */}
            <W accent="#6366F1" icon={CalendarDays} label="Upcoming" onClick={() => setSidebarView('calendar')}>
              {calConnected === false ? (
                <>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>No calendar linked</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 8px', lineHeight: 1.5 }}>Connect Google Calendar to see events here</p>
                  <button onClick={(e) => { e.stopPropagation(); setSidebarView('calendar') }}
                    style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', background: '#6366F115', color: '#6366F1', border: '1px solid #6366F130', borderRadius: 99, cursor: 'pointer' }}>
                    Connect →
                  </button>
                </>
              ) : calConnected === null ? (
                <Dots />
              ) : calEvents.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>Nothing scheduled — clear ahead ✓</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {calEvents.map((ev, i) => {
                    const { label, isToday, isTomorrow } = formatEventTime(ev.start, todayStr)
                    const dotColor = isToday ? '#6366F1' : isTomorrow ? AMBER : 'var(--border-2)'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 4 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                          <p style={{ fontSize: 10, color: isToday ? '#6366F1' : 'var(--text-3)', margin: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={8} />
                            {label}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </W>

            {/* Reminders */}
            <W accent="#F97316" icon={Bell} label="Reminders" onClick={() => setSidebarView('reminders')}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>Never miss it</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Smart alerts & nudges</p>
            </W>
          </div>

        </div>

        {/* ── Mobile-only: tasks + extra widgets (below center grid) ───────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }} className="mobile-only-extras">
          <style>{`
            @media (min-width: 1100px) { .mobile-only-extras { display: none !important; } }
          `}</style>

          {/* Tasks (mobile) */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: '#6366F115', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckSquare size={11} color="#6366F1" />
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Today&apos;s tasks</span>
              </div>
              <button onClick={() => setSidebarView('calendar')} style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>see all →</button>
            </div>
            {todayTasks.slice(0, 5).map((task) => (
              <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <button onClick={() => onToggleTask(task)} style={{
                  width: 15, height: 15, borderRadius: '50%', marginTop: 2, flexShrink: 0,
                  border: `1.5px solid ${task.priority === 'high' ? '#DC2626' : 'var(--border-2)'}`,
                  background: 'transparent', cursor: 'pointer',
                }} />
                <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{task.title}</span>
              </div>
            ))}
            {addingTask ? (
              <form onSubmit={handleAddTask} style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid var(--text-3)', flexShrink: 0, marginTop: 2 }} />
                <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="add a task…" autoFocus
                  onBlur={() => { if (!newTaskTitle.trim()) setAddingTask(false) }}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle('') } }}
                  style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', borderBottom: '1px solid var(--border-2)', paddingBottom: 2 }}
                />
              </form>
            ) : (
              <button onClick={() => setAddingTask(true)} style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ add task</button>
            )}
          </div>

          {/* Progress + Health */}
          <div className="w2">
            <W accent={AMBER} icon={BarChart2} label="Progress" onClick={() => setSidebarView('progress')}>
              <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>{profile?.growth_score ?? 0}</p>
              <p style={{ fontSize: 10, color: 'var(--text-2)', margin: '0 0 6px' }}>growth pts</p>
              <div style={{ height: 3, background: 'var(--border)', borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${weekPct}%`, background: AMBER, borderRadius: 99 }} />
              </div>
            </W>
            <W accent="#14B8A6" icon={Stethoscope} label="Health" onClick={() => setSidebarView('health')}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>Insurance & meds</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>Coverage & records</p>
            </W>
          </div>

          {/* Strategy Lab + Reminders */}
          <div className="w2">
            <W accent="#22C55E" icon={FlaskConical} label="Strategy Lab" onClick={() => setSidebarView('strategylab')}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>Win rates</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Enable / disable</p>
            </W>
            <W accent="#F97316" icon={Bell} label="Reminders" onClick={() => setSidebarView('reminders')}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>Alerts</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Smart nudges</p>
            </W>
          </div>

          {/* Calendar (mobile) */}
          <W accent="#6366F1" icon={CalendarDays} label="Upcoming" onClick={() => setSidebarView('calendar')}>
            {calConnected === false ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>No calendar linked — tap to connect</p>
            ) : calConnected === null ? (
              <Dots />
            ) : calEvents.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Nothing scheduled — clear ahead ✓</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {calEvents.slice(0, 3).map((ev, i) => {
                  const { label, isToday } = formatEventTime(ev.start, todayStr)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: isToday ? '#6366F1' : 'var(--border-2)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>{label}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </W>
        </div>

      </div>
    </>
  )
}
