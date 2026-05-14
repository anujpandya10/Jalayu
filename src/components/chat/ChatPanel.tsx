'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Loader2, Sparkles, Mic, BookmarkPlus, Lightbulb } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import { generateId } from '@/lib/utils'
import ChatMessage from './ChatMessage'

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRec
  }
}

interface SpeechRec extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((ev: { results: { 0: { 0: { transcript: string } } } }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}

const EXPLAIN_KEY = 'jalayu_chat_explain'

export default function ChatPanel() {
  const {
    showChatPanel,
    setShowChatPanel,
    chatMessages,
    addChatMessage,
    updateLastChatMessage,
    setChatMessages,
    profile,
  } = useStore()
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [explainWhy, setExplainWhy] = useState(false)
  const [listening, setListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRec | null>(null)

  useEffect(() => {
    try {
      setExplainWhy(localStorage.getItem(EXPLAIN_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!showChatPanel) return
    ;(async () => {
      try {
        const res = await fetch('/api/chat/messages?limit=40')
        if (!res.ok) return
        const j = await res.json()
        const mapped = (j.messages || []).map(
          (m: { id: string; role: string; content: string; created_at: string }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.created_at,
          }),
        )
        if (mapped.length) setChatMessages(mapped)
      } catch {
        /* ignore */
      }
    })()
  }, [showChatPanel, setChatMessages])

  useEffect(() => {
    if (showChatPanel) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [showChatPanel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const toggleExplain = () => {
    setExplainWhy((v) => {
      const n = !v
      try {
        localStorage.setItem(EXPLAIN_KEY, n ? '1' : '0')
      } catch {
        /* ignore */
      }
      return n
    })
  }

  const persistMessages = async (userContent: string, assistantContent: string) => {
    try {
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: userContent },
            { role: 'assistant', content: assistantContent },
          ],
        }),
      })
    } catch {
      /* ignore */
    }
  }

  const saveTakeaway = async () => {
    const last = [...chatMessages].reverse().find((m) => m.role === 'assistant' && m.content.trim())
    if (!last?.content.trim()) {
      toast.error('No assistant message to save yet')
      return
    }
    const line = window.prompt('Save as memory (one line):', last.content.slice(0, 200))
    if (!line?.trim()) return
    const res = await fetch('/api/chat/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fact: line.trim() }),
    })
    if (res.ok) toast.success('Saved to long-term memory')
    else toast.error('Could not save')
  }

  const startVoice = () => {
    const SR = typeof window !== 'undefined' && window.webkitSpeechRecognition
    if (!SR) {
      toast.error('Voice not supported in this browser')
      return
    }
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (ev) => {
      const text = ev.results[0][0].transcript
      setInput((prev) => (prev ? `${prev} ${text}` : text))
      setListening(false)
    }
    rec.onerror = () => {
      setListening(false)
      toast.error('Voice capture failed')
    }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    setListening(true)
    rec.start()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg = { id: generateId(), role: 'user' as const, content: text, timestamp: new Date().toISOString() }
    addChatMessage(userMsg)
    setInput('')
    setStreaming(true)

    const assistantId = generateId()
    addChatMessage({ id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() })

    let accumulated = ''
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          explainWhy,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Stream error')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        updateLastChatMessage(accumulated)
      }

      if (accumulated.trim()) {
        await persistMessages(text, accumulated.trim())
      }
    } catch {
      updateLastChatMessage('Sorry, something went wrong. Please try again.')
    } finally {
      setStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const name = profile?.nickname || profile?.full_name || 'you'

  return (
    <AnimatePresence>
      {showChatPanel && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowChatPanel(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.15)',
              zIndex: 50,
            }}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 'min(420px, 100vw)',
              background: '#fff',
              borderLeft: '0.5px solid #E5E3FF',
              zIndex: 51,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '0.5px solid #E5E3FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: '#534AB7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={13} color="#fff" />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#111827', margin: 0 }}>Ask Jalayu</p>
                  <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>Your personal AI companion</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={toggleExplain}
                  title="Explain recommendations with one Because line"
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: explainWhy ? '1px solid #534AB7' : '0.5px solid #E5E3FF',
                    background: explainWhy ? '#EEEDFE' : '#F8F7FF',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    color: '#534AB7',
                  }}
                >
                  <Lightbulb size={12} />
                  Why
                </button>
                <button
                  type="button"
                  onClick={saveTakeaway}
                  title="Save takeaway"
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '0.5px solid #E5E3FF',
                    background: '#F8F7FF',
                    cursor: 'pointer',
                  }}
                >
                  <BookmarkPlus size={14} color="#534AB7" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowChatPanel(false)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: '#F8F7FF',
                    border: '0.5px solid #E5E3FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} color="#6b7280" />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', paddingTop: 40 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: '#EEEDFE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 14px',
                    }}
                  >
                    <Sparkles size={20} color="#534AB7" />
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 6 }}>Hey, {name}</p>
                  <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, maxWidth: 260, margin: '0 auto 20px' }}>
                    I know your goals, struggles, and daily patterns. Ask me anything — I&apos;m built for you specifically.
                  </p>
                  {['How am I doing this week?', 'What should I focus on right now?', 'Help me with my energy levels'].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setInput(suggestion)
                        inputRef.current?.focus()
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        margin: '0 auto 8px',
                        maxWidth: 280,
                        padding: '9px 14px',
                        background: '#F8F7FF',
                        border: '0.5px solid #E5E3FF',
                        borderRadius: 10,
                        fontSize: 12,
                        color: '#374151',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {chatMessages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {streaming && chatMessages[chatMessages.length - 1]?.role === 'assistant' && !chatMessages[chatMessages.length - 1]?.content && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <div
                    style={{
                      padding: '9px 12px',
                      borderRadius: '12px 12px 12px 2px',
                      background: '#fff',
                      border: '0.5px solid #E5E3FF',
                      display: 'flex',
                      gap: 4,
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: '#AFA9EC',
                          display: 'inline-block',
                          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderTop: '0.5px solid #E5E3FF',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-end',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={startVoice}
                disabled={listening || streaming}
                title="Speak"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: '0.5px solid #E5E3FF',
                  background: listening ? '#EEEDFE' : '#F8F7FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: listening ? 'wait' : 'pointer',
                  flexShrink: 0,
                }}
              >
                <Mic size={16} color="#534AB7" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask anything, ${name}…`}
                rows={1}
                style={{
                  flex: 1,
                  resize: 'none',
                  border: '0.5px solid #E5E3FF',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: 13,
                  color: '#111827',
                  background: '#F8F7FF',
                  outline: 'none',
                  lineHeight: 1.5,
                  maxHeight: 100,
                  overflowY: 'auto',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#534AB7')}
                onBlur={(e) => (e.target.style.borderColor = '#E5E3FF')}
              />
              <button
                type="button"
                onClick={send}
                disabled={!input.trim() || streaming}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: input.trim() && !streaming ? '#534AB7' : '#E5E3FF',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: input.trim() && !streaming ? 'pointer' : 'not-allowed',
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}
              >
                {streaming ? (
                  <Loader2 size={14} color={input.trim() ? '#fff' : '#9CA3AF'} className="animate-spin" />
                ) : (
                  <Send size={14} color={input.trim() ? '#fff' : '#9CA3AF'} />
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
