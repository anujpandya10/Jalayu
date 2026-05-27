'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import type { Profile, Task, Mood, Reminder } from '@/lib/types'
import { useStore } from '@/store/useStore'
import CustomizableHomeGrid from '@/components/dashboard/home/CustomizableHomeGrid'
import { renderHomeWidget, type HomeWidgetContext } from '@/components/dashboard/home/home-widgets'
import type { HomeWidgetId, WidgetSize } from '@/lib/dashboard-layout'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TradingPosition {
  symbol: string; name: string; direction: 'LONG' | 'SHORT'
  pnl: number; pnlPct: number; currentPrice: number; avgBuyPrice: number
}

interface TradingSnap {
  netWorth: number; totalPnl: number; totalPnlPct: number
  openPositions: number; totalTrades: number
  positions: TradingPosition[]
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
const AMBER = '#00C9A7'  // ocean rebrand

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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HomeContent({
  profile, tasks, reminders = [], tasksRecent = [], todayMood, moodsRecent = [],
  onMoodLog, onAddTask, onToggleTask, onAction,
}: {
  journeyView?: string; profile: Profile | null; tasks: Task[]
  reminders?: Reminder[]
  tasksRecent?: Task[]; todayMood: Mood | null; notes?: unknown[]
  moodsRecent?: Mood[]; daysSinceSignup?: number
  onMoodLog: (score: number) => void
  onAddTask: (title: string, date?: string, eventType?: string) => Promise<void>
  onToggleTask: (task: Task) => Promise<void>
  onAction?: (actions: Array<{ type: string; data: Record<string, unknown>; message: string }>) => void
}) {
  const setShowChatPanel = useStore((s) => s.setShowChatPanel)
  const setSidebarView   = useStore((s) => s.setSidebarView)
  const healthProfiles   = useStore((s) => s.healthProfiles)
  const medications      = useStore((s) => s.medications)
  const healthAppointments = useStore((s) => s.healthAppointments)
  const todayReflection    = useStore((s) => s.todayReflection)

  const [morningNote, setMorningNote] = useState<string | null>(null)
  const [focus,       setFocus]       = useState<string | null>(null)
  const [chapter,     setChapter]     = useState<string | null>(null)
  const [noteLoading, setNoteLoading] = useState(true)
  const [tradingSnap, setTradingSnap] = useState<TradingSnap | null>(null)
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
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const replyRef   = useRef<HTMLDivElement>(null)

  const todayStr     = toLocalDateStr(new Date())
  const yesterdayStr = toLocalDateStr(new Date(Date.now() - 86400000))

  const pendingTasks = tasks.filter((t) => !t.completed)
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
  const [clockSize, setClockSize] = useState(132)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 420px)')
    const apply = () => setClockSize(mq.matches ? 108 : 132)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

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
      const rawPositions: Array<{ symbol: string; name: string; shares: number; currentPrice: number; avgBuyPrice: number; pnl: number; pnlPct: number; direction?: string }> = data.positions ?? []
      const posValue = rawPositions.reduce((s, p) => s + Number(p.shares) * Number(p.currentPrice || p.avgBuyPrice), 0)
      const netWorth = cash + posValue
      const totalPnl = netWorth - SEED
      const positions: TradingPosition[] = rawPositions.map((p) => ({
        symbol: p.symbol, name: p.name ?? p.symbol,
        direction: (p.direction === 'SHORT' ? 'SHORT' : 'LONG') as 'LONG' | 'SHORT',
        pnl: Number(p.pnl ?? 0), pnlPct: Number(p.pnlPct ?? 0),
        currentPrice: Number(p.currentPrice ?? p.avgBuyPrice),
        avgBuyPrice: Number(p.avgBuyPrice),
      }))
      setTradingSnap({ netWorth, totalPnl, totalPnlPct: (totalPnl / SEED) * 100, openPositions: positions.length, totalTrades: data.totalTrades ?? 0, positions })
    }).catch(() => {})
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

  const widgetCtx = useMemo<HomeWidgetContext>(
    () => ({
      profile,
      tasks,
      reminders,
      todayMood,
      yesterdayMood,
      moodsRecent,
      healthProfiles,
      medications,
      healthAppointments,
      todayReflection,
      quote,
      tradingSnap,
      weekPct,
      greeting,
      firstName,
      chapter,
      morningNote,
      noteLoading,
      focus,
      orbState,
      clockSize,
      voiceListening,
      input,
      submitted,
      userAnswer,
      reply,
      inputRef,
      replyRef,
      onMoodLog,
      onAddTask,
      onToggleTask,
      setSidebarView,
      setShowChatPanel,
      setInput,
      sendMessage,
      handleKeyDown,
      startHomeVoice,
    }),
    [
      profile,
      tasks,
      reminders,
      todayMood,
      yesterdayMood,
      moodsRecent,
      healthProfiles,
      medications,
      healthAppointments,
      todayReflection,
      quote,
      tradingSnap,
      weekPct,
      greeting,
      firstName,
      chapter,
      morningNote,
      noteLoading,
      focus,
      orbState,
      clockSize,
      voiceListening,
      input,
      submitted,
      userAnswer,
      reply,
      onMoodLog,
      onAddTask,
      onToggleTask,
      setSidebarView,
      setShowChatPanel,
      sendMessage,
      startHomeVoice,
    ],
  )

  const renderWidget = useCallback(
    (id: HomeWidgetId, column: 'left' | 'center' | 'right' | 'mobile', size: WidgetSize) =>
      renderHomeWidget(id, column, size, widgetCtx),
    [widgetCtx],
  )

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
          padding: 20px max(16px, env(safe-area-inset-right)) 24px max(16px, env(safe-area-inset-left));
          box-sizing: border-box;
        }
        @media (max-width: 767px) {
          .home-outer { padding-top: 16px; padding-bottom: 16px; padding-left: 12px; padding-right: 12px; }
        }
        .home-3col {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }

        /* Phone / tablet: one schedule block (center), hide desktop task column */
        @media (max-width: 1099px) {
          .home-right { display: none !important; }
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
          .home-right { display: grid !important; }
        }

        /* iOS-style widget grid (center / right / mobile) */
        .widget-grid-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          align-items: stretch; /* stretch so side-by-side cards always match height */
        }
        .widget-span-full { grid-column: 1 / -1; }
        .widget-span-half { grid-column: span 1; min-width: 0; display: flex; flex-direction: column; }
        @media (max-width: 420px) {
          .widget-grid-col { grid-template-columns: 1fr; }
          .widget-span-half { grid-column: 1 / -1; }
        }

        /* Unified size tiers — every widget of the same size is at least this tall */
        .wsize-small  { min-height: 108px; }
        .wsize-medium { min-height: 158px; }
        .wsize-large  { min-height: 220px; }

        /* Cards fill their grid cell so the background/border covers the full height */
        .wsize-small  > *,
        .wsize-medium > *,
        .wsize-large  > * { height: 100%; }

        /* widget inner grid */
        .w2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: stretch; }
        .w2 > * { min-width: 0; }
        .w-full { grid-column: 1 / -1; }
        @media (max-width: 520px) {
          .w2 { grid-template-columns: 1fr; }
        }
        .reflection-desktop-only { display: none; }
        .reflection-mobile-only { display: block; }
        @media (min-width: 1100px) {
          .reflection-desktop-only { display: block; }
          .reflection-mobile-only { display: none !important; }
          .home-right { align-self: stretch; }
        }

        /* scrollable tasks on desktop */
        @media (min-width: 1100px) {
          .tasks-scroll { max-height: 340px; overflow-y: auto; }
          .tasks-scroll::-webkit-scrollbar { width: 3px; }
          .tasks-scroll::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }
        }
      `}</style>

      <div className="home-outer">
        <CustomizableHomeGrid profile={profile} renderWidget={renderWidget} />
      </div>
    </>
  )
}