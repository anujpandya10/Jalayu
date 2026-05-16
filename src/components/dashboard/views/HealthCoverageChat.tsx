'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Send, Trash2, Globe, ExternalLink } from 'lucide-react'

export interface CoverageMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; url: string; snippet: string }[] | null
  created_at: string
}

const SUGGESTIONS = [
  'Find an in-network primary care doctor near me',
  'Is therapy covered on my plan?',
  'What will an MRI cost with my deductible?',
  'Are my medications on the formulary?',
]

export default function HealthCoverageChat({ showToast }: { showToast: (m: string) => void }) {
  const [messages, setMessages] = useState<CoverageMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/health/coverage/messages?limit=100')
      const data = await res.json()
      if (data.needsMigration) {
        setNeedsMigration(true)
        setMessages([])
        return
      }
      if (res.ok && data.messages) {
        setMessages(data.messages as CoverageMessage[])
      }
    } catch {
      showToast('Could not load chat history')
    } finally {
      setHistoryLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const tempUser: CoverageMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages((m) => [...m, tempUser])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/health/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Request failed')
      }

      const assistant: CoverageMessage = {
        id: data.messageId ?? `a-${Date.now()}`,
        role: 'assistant',
        content: data.answer ?? 'No response received.',
        sources: data.sources ?? null,
        created_at: new Date().toISOString(),
      }
      setMessages((m) => [...m.filter((x) => x.id !== tempUser.id), { ...tempUser, id: `u-${Date.now()}` }, assistant])
    } catch {
      showToast('Failed to get answer')
      setMessages((m) => [
        ...m,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Something went wrong. Please try again.',
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function clearHistory() {
    if (!confirm('Clear all coverage chat history?')) return
    const res = await fetch('/api/health/coverage/messages', { method: 'DELETE' })
    if (res.ok) {
      setMessages([])
      showToast('Chat cleared')
    } else {
      showToast('Could not clear history')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'min(72vh, 640px)',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--morning)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Globe size={15} color="var(--accent)" />
            Coverage advisor
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0, lineHeight: 1.45 }}>
            Uses your saved insurance & meds, plus live web research for doctors, hospitals, and formulary questions.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            title="Clear history"
            style={{
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              color: 'var(--text-3)',
              flexShrink: 0,
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {needsMigration && (
        <div style={{ padding: 12, background: 'rgba(220,38,38,0.06)', borderBottom: '1px solid var(--border)', fontSize: 12, color: '#DC2626' }}>
          Run migration <code style={{ fontSize: 11 }}>015_health_coverage_chat.sql</code> in Supabase to save chat history.
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
        {historyLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', marginTop: 24 }}>Loading history…</p>
        ) : messages.length === 0 ? (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Ask anything about your plan — copays, deductibles, finding in-network care, or whether a medication is covered.
            </p>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Try asking
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setInput(s); inputRef.current?.focus() }}
                  style={{
                    textAlign: 'left',
                    fontSize: 12,
                    color: 'var(--text)',
                    background: 'var(--morning)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 12,
              }}
            >
              <div style={{ maxWidth: '88%' }}>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--morning)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                    fontSize: 13,
                    lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                </div>
                {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                  <div style={{ marginTop: 8, paddingLeft: 2 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Sources
                    </p>
                    {msg.sources.map((s, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                          >
                            {s.title || s.url}
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{s.title}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 13 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Researching your plan…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={handleSend}
        style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          background: 'var(--surface)',
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about coverage, doctors, costs, medications…"
          disabled={loading}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            fontSize: 13,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--bg)',
            color: 'var(--text)',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.45,
            maxHeight: 120,
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: 'none',
            background: loading || !input.trim() ? 'var(--border)' : 'var(--accent)',
            color: '#fff',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
        </button>
      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
