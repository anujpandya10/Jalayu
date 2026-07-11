'use client'

/**
 * ShadowHome — Jalayu's new front door.
 *
 * One input: "what should I work on?"
 * One ledger below: what's running, what's done, what needs you.
 *
 * No widgets. No buffet. The product carries your intents while you
 * live your life.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Loader2, CheckCircle2, AlertCircle, ChevronRight, Archive, X, Compass, Pen, RotateCcw, Copy, Check, Terminal } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import toast from 'react-hot-toast'
import type { Profile } from '@/lib/types'
import { humanizeAIError } from '@/lib/ai-errors'

interface Intent {
  id: string
  text: string
  kind: string
  status: 'queued' | 'running' | 'done' | 'needs_review' | 'failed'
  error: string | null
  result_md: string | null
  result_summary: string | null
  citations: { title: string; url: string }[] | null
  used_memory_ids: string[] | null
  model: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  reviewed_at: string | null
}

interface DailyLetter {
  id: string
  letter_date: string
  text_md: string
  generated_at: string
  dismissed_at: string | null
}

function KindIcon({ kind, size = 14, color = 'var(--text-3)' }: { kind: string; size?: number; color?: string }) {
  if (kind === 'draft') return <Pen size={size} color={color} />
  if (kind === 'code') return <Terminal size={size} color={color} />
  return <Compass size={size} color={color} />
}

function kindLabel(kind: string): string {
  if (kind === 'draft') return 'Draft'
  if (kind === 'code') return 'Code'
  return 'Research'
}

function runningLabel(kind: string): string {
  if (kind === 'draft') return 'drafting…'
  if (kind === 'code') return 'planning changes…'
  return 'researching…'
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

export default function ShadowHome({ profile }: { profile: Profile | null }) {
  const [intents, setIntents] = useState<Intent[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [openIntent, setOpenIntent] = useState<Intent | null>(null)
  const [copied, setCopied] = useState(false)
  const [letter, setLetter] = useState<DailyLetter | null>(null)
  const [letterDismissedLocal, setLetterDismissedLocal] = useState(false)
  const [letterReply, setLetterReply] = useState('')
  const [letterReplying, setLetterReplying] = useState(false)
  const [letterReplied, setLetterReplied] = useState(false)
  const [chipsDismissed, setChipsDismissed] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const firstName = profile?.nickname || profile?.full_name?.split(' ')[0] || ''
  const today = new Date()
  const dateLabel = `${DAY_NAMES[today.getDay()]}, ${MONTH_NAMES[today.getMonth()]} ${today.getDate()}`
  const hr = today.getHours()
  const greetWord = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/intents?limit=50')
      if (!res.ok) return
      const data = await res.json()
      setIntents(data.intents ?? [])
    } catch {
      /* ignore — keep last view */
    }
  }, [])

  // Initial load
  useEffect(() => { void refresh() }, [refresh])

  // Daily letter: fetch on mount; if missing AND it's after 7pm local, ask the
  // server to generate it. We don't loop or retry — letter shows up when it shows up.
  const letterFetchedRef = useRef(false)
  useEffect(() => {
    if (letterFetchedRef.current) return
    letterFetchedRef.current = true
    void (async () => {
      try {
        const res = await fetch('/api/letter/today')
        if (!res.ok) return
        const data = await res.json()
        if (data.letter) {
          setLetter(data.letter as DailyLetter)
          return
        }
        // No letter yet today. Generate if it's past 7pm local time.
        const localHour = new Date().getHours()
        if (localHour < 19) return
        const gen = await fetch('/api/letter/today', { method: 'POST' })
        if (!gen.ok) return
        const genData = await gen.json()
        if (genData.letter) setLetter(genData.letter as DailyLetter)
      } catch {
        /* ignore — letter is optional */
      }
    })()
  }, [])

  const dismissLetter = useCallback(async () => {
    setLetterDismissedLocal(true)
    try {
      await fetch('/api/letter/today', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true }),
      })
    } catch { /* local dismiss already happened */ }
  }, [])

  // Deep-link from push notification: /dashboard?intent=<id> auto-opens its detail.
  // Runs once after the first refresh resolves so the intent row is available.
  const deepLinkHandledRef = useRef(false)
  useEffect(() => {
    if (deepLinkHandledRef.current || intents.length === 0) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const wanted = params.get('intent')
    if (!wanted) { deepLinkHandledRef.current = true; return }
    const match = intents.find((i) => i.id === wanted)
    if (match) {
      setOpenIntent(match)
      deepLinkHandledRef.current = true
      // Strip the query param so a refresh doesn't reopen the modal forever
      const url = new URL(window.location.href)
      url.searchParams.delete('intent')
      window.history.replaceState({}, '', url.toString())
    }
  }, [intents])

  // Poll while any intent is running or queued
  const hasActive = intents.some((i) => i.status === 'queued' || i.status === 'running')
  useEffect(() => {
    if (!hasActive) return
    const id = window.setInterval(() => { void refresh() }, 4000)
    return () => window.clearInterval(id)
  }, [hasActive, refresh])

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  const send = useCallback(async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, kind: 'research' }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Could not send')
        return
      }
      setText('')
      // Optimistically prepend the new row so the ledger updates instantly
      setIntents((prev) => [data.intent as Intent, ...prev])
    } catch {
      toast.error('Network error')
    } finally {
      setSending(false)
    }
  }, [text, sending])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void send()
    }
  }

  async function archive(id: string) {
    try {
      await fetch(`/api/intents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      })
      setIntents((prev) => prev.filter((i) => i.id !== id))
    } catch {
      toast.error('Could not archive')
    }
  }

  const sendLetterReply = useCallback(async () => {
    const answer = letterReply.trim()
    if (!answer || letterReplying) return
    setLetterReplying(true)
    try {
      const res = await fetch('/api/letter/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Could not send reply')
        return
      }
      setLetterReply('')
      setLetterReplied(true)
    } catch {
      toast.error('Network error')
    } finally {
      setLetterReplying(false)
    }
  }, [letterReply, letterReplying])

  const active = intents.filter((i) => i.status === 'queued' || i.status === 'running')
  const done = intents.filter((i) => i.status === 'done')
  const failed = intents.filter((i) => i.status === 'failed')

  // Heuristic: if the letter ends with a paragraph containing a "?", we
  // treat it as a deepening question and surface the reply UI.
  const letterHasQuestion = (() => {
    if (!letter) return false
    const paragraphs = letter.text_md.trim().split(/\n\s*\n/)
    for (let i = paragraphs.length - 1; i >= 0; i--) {
      if (paragraphs[i].includes('?')) return true
    }
    return false
  })()

  const onboardingComplete = profile?.onboarding_complete !== false

  // Onboarding gate — short-circuit render if profile isn't onboarded yet
  if (profile && !onboardingComplete) {
    return (
      <div className="shadow-home">
        <style>{`
          .sh-gate {
            max-width: 460px; margin: 80px auto 0;
            text-align: center; padding: 0 20px;
          }
          .sh-gate h1 {
            font-family: var(--font-lora), Georgia, serif;
            font-size: 28px; line-height: 1.3;
            color: var(--text); margin: 0 0 12px;
            font-weight: 500;
          }
          .sh-gate p {
            font-size: 15px; line-height: 1.6;
            color: var(--text-2); margin: 0 0 28px;
            font-family: var(--font-lora), Georgia, serif;
          }
          .sh-gate-cta {
            display: inline-block;
            background: var(--accent); color: var(--accent-fg);
            padding: 14px 28px; border-radius: 14px;
            font-size: 14px; font-weight: 600;
            text-decoration: none;
          }
        `}</style>
        <div className="sh-gate">
          <h1>Let&apos;s meet first.</h1>
          <p>I&apos;ll work better once I actually know you. Takes a few minutes — a real conversation, not a form.</p>
          <a href="/onboarding" className="sh-gate-cta">Begin →</a>
        </div>
      </div>
    )
  }

  return (
    <div className="shadow-home">
      <style>{`
        .shadow-home {
          width: 100%; max-width: 720px; margin: 0 auto;
          padding: 28px max(16px, env(safe-area-inset-right)) 56px max(16px, env(safe-area-inset-left));
          box-sizing: border-box;
        }
        @media (max-width: 520px) {
          .shadow-home { padding: 20px 14px 56px; }
        }
        .sh-date {
          font-size: 11px; font-weight: 600; color: var(--text-3);
          text-transform: uppercase; letter-spacing: 0.14em;
          margin: 0 0 12px;
        }

        /* Daily letter — Lora serif, warm tinted card at the top of the page */
        .sh-letter {
          background: var(--morning);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 16px 18px 18px;
          margin: 0 0 28px;
          box-shadow: 0 1px 0 var(--border);
        }
        .sh-letter-head {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 10px;
        }
        .sh-letter-label {
          font-size: 10px; font-weight: 700; color: var(--accent);
          text-transform: uppercase; letter-spacing: 0.14em;
        }
        .sh-letter-close {
          background: transparent; border: none; padding: 4px;
          color: var(--text-3); cursor: pointer; border-radius: 6px;
        }
        .sh-letter-close:hover { background: var(--surface); color: var(--text-2); }
        .sh-letter-body {
          font-family: var(--font-lora), Georgia, serif;
          font-size: 15.5px; line-height: 1.7; color: var(--text);
        }
        .sh-letter-body p { margin: 0 0 0.85em; }
        .sh-letter-body p:last-child { margin-bottom: 0; }

        /* Letter reply (deepening question response) */
        .sh-letter-reply {
          margin-top: 14px; padding-top: 14px;
          border-top: 1px dashed var(--border-2);
          display: flex; flex-direction: column; gap: 8px;
        }
        .sh-letter-reply-input {
          width: 100%; resize: none; border: 1px solid var(--border);
          background: var(--surface); border-radius: 10px;
          padding: 8px 10px; font-size: 14px; line-height: 1.55;
          color: var(--text); outline: none; font-family: inherit;
        }
        .sh-letter-reply-input:focus { border-color: var(--accent); }
        .sh-letter-reply-send {
          align-self: flex-end;
          display: inline-flex; align-items: center; gap: 5px;
          background: var(--accent); color: var(--accent-fg);
          padding: 6px 12px; border-radius: 8px; border: none;
          font-size: 12px; font-weight: 600; cursor: pointer;
        }
        .sh-letter-reply-send:disabled { opacity: 0.4; cursor: not-allowed; }
        .sh-letter-noted {
          margin: 14px 0 0; padding-top: 14px;
          border-top: 1px dashed var(--border-2);
          font-size: 12px; color: var(--accent);
          font-style: italic; text-align: center;
        }

        /* Example chips — shown only when intents.length === 0 */
        .sh-chips-wrap {
          margin-top: 16px;
        }
        .sh-chips-head {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 8px;
        }
        .sh-chips-label {
          font-size: 10px; font-weight: 700; color: var(--text-3);
          text-transform: uppercase; letter-spacing: 0.14em;
        }
        .sh-chips-dismiss {
          background: transparent; border: none; padding: 4px;
          color: var(--text-3); cursor: pointer; border-radius: 6px;
        }
        .sh-chips-dismiss:hover { color: var(--text-2); }
        .sh-chips {
          display: flex; flex-wrap: wrap; gap: 10px;
        }
        .sh-chip {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 14px; border-radius: 99px;
          background: var(--surface); border: 1px solid var(--border);
          color: var(--text-2); font-size: 12.5px; cursor: pointer;
          text-align: left; font-family: inherit; white-space: nowrap;
          transition: background 0.12s, border-color 0.12s, color 0.12s;
        }
        .sh-chip:hover {
          background: var(--surface-2); border-color: var(--accent);
          color: var(--text);
        }
        .sh-chip > svg { flex-shrink: 0; color: var(--text-3); }
        .sh-chip:hover > svg { color: var(--accent); }
        .sh-greeting {
          font-family: var(--font-lora), Georgia, serif;
          font-size: 40px; line-height: 1.08; color: var(--text);
          margin: 0 0 24px; font-weight: 600; letter-spacing: -0.015em;
          max-width: 15ch;
        }
        .sh-greeting-soft { color: var(--text-2); }
        @media (max-width: 520px) { .sh-greeting { font-size: 28px; } }

        .sh-input-wrap {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; padding: 14px 14px 10px;
          display: flex; flex-direction: column; gap: 10px;
          transition: border-color 0.15s;
        }
        .sh-input-wrap:focus-within { border-color: var(--accent); }
        .sh-textarea {
          width: 100%; resize: none; border: none; background: transparent;
          font-family: inherit; font-size: 15px; line-height: 1.55;
          color: var(--text); outline: none; min-height: 28px;
          padding: 0;
        }
        .sh-input-row {
          display: flex; justify-content: space-between; align-items: center;
          gap: 8px;
        }
        .sh-hint {
          font-size: 11px; color: var(--text-3);
        }
        .sh-send {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--accent); color: var(--accent-fg);
          padding: 8px 14px; border-radius: 10px; border: none;
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: opacity 0.15s;
        }
        .sh-send:disabled { opacity: 0.4; cursor: not-allowed; }

        .sh-section-label {
          font-size: 10px; font-weight: 700; color: var(--text-3);
          text-transform: uppercase; letter-spacing: 0.14em;
          margin: 32px 0 10px;
        }
        .sh-row {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; padding: 12px 14px;
          margin-bottom: 8px;
          display: flex; gap: 12px; align-items: flex-start;
          cursor: pointer; transition: background 0.12s, border-color 0.12s;
          text-align: left; width: 100%; font-family: inherit;
        }
        .sh-row:hover { background: var(--surface-2); border-color: var(--border-2); }
        .sh-row[data-status="running"] { border-color: var(--accent); }
        .sh-row[data-status="failed"] { border-color: var(--error-border); background: var(--error-bg); }

        .sh-icon { flex-shrink: 0; margin-top: 1px; }
        .sh-row-body { flex: 1; min-width: 0; }
        .sh-row-headline {
          display: flex; align-items: flex-start; gap: 6px;
          margin: 0 0 4px;
        }
        .sh-row-headline > svg { flex-shrink: 0; margin-top: 3px; }
        .sh-row-text {
          font-size: 14px; color: var(--text); margin: 0;
          font-weight: 500; line-height: 1.4; flex: 1; min-width: 0;
          overflow: hidden; text-overflow: ellipsis;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
        .sh-memory-chip {
          display: inline-flex; align-items: center; gap: 3px;
          color: var(--accent); font-size: 11px; font-weight: 500;
        }
        .sh-modal-kind {
          display: inline-flex; align-items: center; gap: 4px;
          color: var(--text-3); font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.12em;
          margin-bottom: 4px;
        }
        .sh-modal-copy {
          display: inline-flex; align-items: center; gap: 4px;
          background: var(--accent); color: var(--accent-fg);
          padding: 6px 10px; border-radius: 8px; border: none;
          font-size: 12px; font-weight: 600; cursor: pointer;
          font-family: inherit;
        }
        .sh-modal-copy:hover { opacity: 0.92; }
        .sh-row-meta {
          font-size: 11px; color: var(--text-3);
          display: flex; gap: 8px; align-items: center;
        }
        .sh-row-summary {
          font-size: 13px; color: var(--text-2); margin: 4px 0 0;
          line-height: 1.5;
          overflow: hidden; text-overflow: ellipsis;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }

        .sh-row-archive {
          background: transparent; border: none; padding: 4px;
          color: var(--text-3); cursor: pointer; opacity: 0;
          transition: opacity 0.15s; border-radius: 6px;
        }
        .sh-row:hover .sh-row-archive { opacity: 1; }
        .sh-row-archive:hover { background: var(--border); color: var(--text-2); }

        .sh-empty {
          text-align: center; padding: 32px 16px;
          color: var(--text-3); font-size: 13px;
          background: var(--surface-2); border: 1px dashed var(--border-2);
          border-radius: 12px;
        }

        @keyframes shadow-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        .sh-spinning { animation: shadow-spin 1s linear infinite; }

        /* Detail modal */
        .sh-modal-backdrop {
          position: fixed; inset: 0; background: rgba(28,25,23,0.45);
          backdrop-filter: blur(4px); z-index: 60;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .sh-modal {
          background: var(--surface); border-radius: 18px;
          width: 100%; max-width: 720px;
          max-height: calc(100dvh - 32px);
          display: flex; flex-direction: column;
          box-shadow: 0 24px 64px rgba(28,25,23,0.2);
          overflow: hidden;
        }
        .sh-modal-head {
          padding: 16px 20px; border-bottom: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 12px; flex-shrink: 0;
        }
        .sh-modal-title {
          font-size: 14px; font-weight: 600; color: var(--text);
          margin: 0; line-height: 1.4;
        }
        .sh-modal-close {
          background: transparent; border: none; padding: 4px;
          color: var(--text-2); cursor: pointer; border-radius: 6px;
          flex-shrink: 0;
        }
        .sh-modal-close:hover { background: var(--border); }
        .sh-modal-body {
          padding: 20px; overflow-y: auto; flex: 1;
        }
        .sh-citations {
          margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border);
        }
        .sh-citations h4 {
          font-size: 10px; font-weight: 700; color: var(--text-3);
          text-transform: uppercase; letter-spacing: 0.12em;
          margin: 0 0 8px;
        }
        .sh-citation {
          display: block; padding: 6px 10px; margin-bottom: 4px;
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: 8px; font-size: 12px; color: var(--text-2);
          text-decoration: none; line-height: 1.4;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sh-citation:hover { background: var(--morning); color: var(--text); }
      `}</style>

      {letter && !letter.dismissed_at && !letterDismissedLocal && (
        <div className="sh-letter">
          <div className="sh-letter-head">
            <span className="sh-letter-label">✦ Tonight</span>
            <button
              type="button"
              className="sh-letter-close"
              onClick={() => void dismissLetter()}
              aria-label="Dismiss letter"
            >
              <X size={14} />
            </button>
          </div>
          <div className="sh-letter-body md-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{letter.text_md}</ReactMarkdown>
          </div>

          {letterHasQuestion && !letterReplied && (
            <div className="sh-letter-reply">
              <textarea
                value={letterReply}
                onChange={(e) => setLetterReply(e.target.value)}
                placeholder="reply when you want — no rush"
                rows={2}
                className="sh-letter-reply-input"
                disabled={letterReplying}
              />
              <button
                type="button"
                onClick={() => void sendLetterReply()}
                disabled={!letterReply.trim() || letterReplying}
                className="sh-letter-reply-send"
              >
                {letterReplying ? <Loader2 size={13} className="sh-spinning" /> : <Send size={13} />}
                Send
              </button>
            </div>
          )}
          {letterReplied && (
            <p className="sh-letter-noted">noted, thank you ✦</p>
          )}
        </div>
      )}

      <p className="sh-date">{dateLabel}</p>
      <h1 className="sh-greeting">
        {greetWord}{firstName ? `, ${firstName}` : ''}. <span className="sh-greeting-soft">What should I work on?</span>
      </h1>

      <div className="sh-input-wrap">
        <textarea
          ref={textareaRef}
          className="sh-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Research a question · Draft a message · Paste a github URL to plan a code change…"
          rows={1}
          disabled={sending}
        />
        <div className="sh-input-row">
          <span className="sh-hint">⌘ + Enter to send · I work in the background</span>
          <button
            type="button"
            className="sh-send"
            onClick={() => void send()}
            disabled={!text.trim() || sending}
          >
            {sending ? <Loader2 size={14} className="sh-spinning" /> : <Send size={14} />}
            Send
          </button>
        </div>
      </div>

      {intents.length === 0 && !chipsDismissed && (
        <div className="sh-chips-wrap">
          <div className="sh-chips-head">
            <span className="sh-chips-label">try one of these</span>
            <button
              type="button"
              className="sh-chips-dismiss"
              onClick={() => setChipsDismissed(true)}
              aria-label="hide examples"
            >
              <X size={12} />
            </button>
          </div>
          <div className="sh-chips">
            {[
              { icon: <Compass size={12} />, label: 'Research what\'s actually new with X' },
              { icon: <Pen size={12} />, label: 'Draft a polite no to that meeting' },
              { icon: <Terminal size={12} />, label: 'Plan a fix for this github bug (paste a URL)' },
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="sh-chip"
                onClick={() => {
                  setText(chip.label)
                  textareaRef.current?.focus()
                }}
              >
                {chip.icon}
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <>
          <p className="sh-section-label">Working on it</p>
          {active.map((i) => (
            <button
              type="button"
              key={i.id}
              className="sh-row"
              data-status={i.status}
              onClick={() => setOpenIntent(i)}
            >
              <Loader2 size={16} className="sh-icon sh-spinning" color="var(--accent)" />
              <div className="sh-row-body">
                <div className="sh-row-headline">
                  <KindIcon kind={i.kind} size={12} />
                  <p className="sh-row-text">{i.text}</p>
                </div>
                <div className="sh-row-meta">
                  <span>{i.status === 'queued' ? 'queued' : runningLabel(i.kind)}</span>
                  <span>·</span>
                  <span>{relTime(i.created_at)}</span>
                </div>
              </div>
            </button>
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <p className="sh-section-label">Ready for you</p>
          {done.map((i) => (
            <button
              type="button"
              key={i.id}
              className="sh-row"
              data-status="done"
              onClick={() => setOpenIntent(i)}
            >
              <CheckCircle2 size={16} className="sh-icon" color="var(--accent)" />
              <div className="sh-row-body">
                <div className="sh-row-headline">
                  <KindIcon kind={i.kind} size={12} />
                  <p className="sh-row-text">{i.text}</p>
                </div>
                {i.result_summary && <p className="sh-row-summary">{i.result_summary}</p>}
                <div className="sh-row-meta">
                  <span>{i.completed_at ? relTime(i.completed_at) : relTime(i.created_at)}</span>
                  {i.citations && i.citations.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{i.citations.length} source{i.citations.length === 1 ? '' : 's'}</span>
                    </>
                  )}
                  {i.used_memory_ids && i.used_memory_ids.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="sh-memory-chip">
                        <RotateCcw size={10} />
                        built on past work
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span
                className="sh-row-archive"
                onClick={(e) => { e.stopPropagation(); void archive(i.id) }}
                role="button"
                tabIndex={0}
                aria-label="Archive"
              >
                <Archive size={14} />
              </span>
              <ChevronRight size={16} className="sh-icon" color="var(--text-3)" />
            </button>
          ))}
        </>
      )}

      {failed.length > 0 && (
        <>
          <p className="sh-section-label">Couldn't finish</p>
          {failed.map((i) => (
            <button
              type="button"
              key={i.id}
              className="sh-row"
              data-status="failed"
              onClick={() => setOpenIntent(i)}
            >
              <AlertCircle size={16} className="sh-icon" color="var(--error-text)" />
              <div className="sh-row-body">
                <div className="sh-row-headline">
                  <KindIcon kind={i.kind} size={12} />
                  <p className="sh-row-text">{i.text}</p>
                </div>
                {i.error && <p className="sh-row-summary">{humanizeAIError(i.error)}</p>}
                <div className="sh-row-meta">
                  <span>{i.completed_at ? relTime(i.completed_at) : relTime(i.created_at)}</span>
                </div>
              </div>
              <span
                className="sh-row-archive"
                onClick={(e) => { e.stopPropagation(); void archive(i.id) }}
                role="button"
                tabIndex={0}
                aria-label="Archive"
              >
                <Archive size={14} />
              </span>
            </button>
          ))}
        </>
      )}

      {/* The old "Send me anything…" empty-ledger box is intentionally gone — the widget
          grid now fills the space below, so a big empty placeholder just looked broken. */}

      {openIntent && (
        <div className="sh-modal-backdrop" onClick={() => { setOpenIntent(null); setCopied(false) }}>
          <div className="sh-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sh-modal-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sh-modal-kind">
                  <KindIcon kind={openIntent.kind} size={11} />
                  <span>{kindLabel(openIntent.kind)}</span>
                </div>
                <h3 className="sh-modal-title">{openIntent.text}</h3>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                {(openIntent.kind === 'draft' || openIntent.kind === 'code') && openIntent.status === 'done' && openIntent.result_md && (
                  <button
                    type="button"
                    className="sh-modal-copy"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(openIntent.result_md ?? '')
                        setCopied(true)
                        window.setTimeout(() => setCopied(false), 1500)
                      } catch {
                        toast.error('Copy failed')
                      }
                    }}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
                <button
                  type="button"
                  className="sh-modal-close"
                  onClick={() => { setOpenIntent(null); setCopied(false) }}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="sh-modal-body">
              {openIntent.status === 'running' || openIntent.status === 'queued' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)' }}>
                  <Loader2 size={14} className="sh-spinning" color="var(--accent)" />
                  <span style={{ fontSize: 13 }}>Working on it…</span>
                </div>
              ) : openIntent.status === 'failed' ? (
                <div style={{ color: 'var(--error-text)', fontSize: 13 }}>
                  {humanizeAIError(openIntent.error)}
                </div>
              ) : (
                <>
                  <div className="md-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {openIntent.result_md || ''}
                    </ReactMarkdown>
                  </div>
                  {openIntent.citations && openIntent.citations.length > 0 && (
                    <div className="sh-citations">
                      <h4>Sources</h4>
                      {openIntent.citations.map((c, idx) => (
                        <a
                          key={idx}
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sh-citation"
                          title={c.url}
                        >
                          {c.title}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
