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
import { Send, Loader2, CheckCircle2, AlertCircle, ChevronRight, Archive, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import toast from 'react-hot-toast'
import type { Profile } from '@/lib/types'

interface Intent {
  id: string
  text: string
  kind: string
  status: 'queued' | 'running' | 'done' | 'needs_review' | 'failed'
  error: string | null
  result_md: string | null
  result_summary: string | null
  citations: { title: string; url: string }[] | null
  model: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  reviewed_at: string | null
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const firstName = profile?.nickname || profile?.full_name?.split(' ')[0] || ''
  const today = new Date()
  const dateLabel = `${DAY_NAMES[today.getDay()]}, ${MONTH_NAMES[today.getMonth()]} ${today.getDate()}`

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

  const active = intents.filter((i) => i.status === 'queued' || i.status === 'running')
  const done = intents.filter((i) => i.status === 'done')
  const failed = intents.filter((i) => i.status === 'failed')

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
        .sh-greeting {
          font-family: var(--font-lora), Georgia, serif;
          font-size: 26px; line-height: 1.3; color: var(--text);
          margin: 0 0 24px; font-weight: 500; letter-spacing: -0.01em;
        }
        @media (max-width: 520px) { .sh-greeting { font-size: 22px; } }

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
        .sh-row-text {
          font-size: 14px; color: var(--text); margin: 0 0 4px;
          font-weight: 500; line-height: 1.4;
          overflow: hidden; text-overflow: ellipsis;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        }
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

      <p className="sh-date">{dateLabel}</p>
      <h1 className="sh-greeting">
        {firstName ? `Hey ${firstName}. ` : ''}What should I work on?
      </h1>

      <div className="sh-input-wrap">
        <textarea
          ref={textareaRef}
          className="sh-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Research a question, dig into something, summarize what's going on with X…"
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
                <p className="sh-row-text">{i.text}</p>
                <div className="sh-row-meta">
                  <span>{i.status === 'queued' ? 'queued' : 'researching…'}</span>
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
                <p className="sh-row-text">{i.text}</p>
                {i.result_summary && <p className="sh-row-summary">{i.result_summary}</p>}
                <div className="sh-row-meta">
                  <span>{i.completed_at ? relTime(i.completed_at) : relTime(i.created_at)}</span>
                  {i.citations && i.citations.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{i.citations.length} source{i.citations.length === 1 ? '' : 's'}</span>
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
                <p className="sh-row-text">{i.text}</p>
                {i.error && <p className="sh-row-summary">{i.error}</p>}
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

      {intents.length === 0 && (
        <div className="sh-empty" style={{ marginTop: 24 }}>
          Send me anything you want figured out. I'll work in the background and
          your answer will show up here.
        </div>
      )}

      {openIntent && (
        <div className="sh-modal-backdrop" onClick={() => setOpenIntent(null)}>
          <div className="sh-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sh-modal-head">
              <h3 className="sh-modal-title">{openIntent.text}</h3>
              <button
                type="button"
                className="sh-modal-close"
                onClick={() => setOpenIntent(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="sh-modal-body">
              {openIntent.status === 'running' || openIntent.status === 'queued' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)' }}>
                  <Loader2 size={14} className="sh-spinning" color="var(--accent)" />
                  <span style={{ fontSize: 13 }}>Working on it…</span>
                </div>
              ) : openIntent.status === 'failed' ? (
                <div style={{ color: 'var(--error-text)', fontSize: 13 }}>
                  {openIntent.error || 'Failed without an error message.'}
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
