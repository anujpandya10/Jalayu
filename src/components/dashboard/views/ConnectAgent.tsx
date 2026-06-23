'use client'

import { useState, useEffect } from 'react'
import { Loader2, Bot, CheckCircle2, Trash2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

interface Status {
  connected: boolean
  provider?: string
  key_hint?: string
  model?: string
  verified?: boolean
}

const PROVIDERS = [
  { id: 'anthropic', label: 'Claude (Anthropic)', wired: true, console: 'https://console.anthropic.com/settings/keys', hint: 'Starts with sk-ant-' },
  { id: 'openai', label: 'ChatGPT (OpenAI)', wired: false, console: 'https://platform.openai.com/api-keys', hint: 'Starts with sk-' },
  { id: 'google', label: 'Gemini (Google)', wired: false, console: 'https://aistudio.google.com/app/apikey', hint: 'From Google AI Studio' },
]

export default function ConnectAgent() {
  const [status, setStatus] = useState<Status | null>(null)
  const [provider, setProvider] = useState('anthropic')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const res = await fetch('/api/ai-keys', { cache: 'no-store' })
      if (res.ok) { const s = await res.json(); setStatus(s); if (s.provider) setProvider(s.provider) }
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const meta = PROVIDERS.find((p) => p.id === provider)!

  const save = async () => {
    if (!key.trim()) { toast.error('Paste your API key'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/ai-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: key.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Could not save key'); return }
      toast.success(json.verified ? 'Agent connected & verified ✓' : 'Key saved')
      setKey('')
      await load()
    } finally { setBusy(false) }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect your AI agent? AI features will stop until you reconnect.')) return
    setBusy(true)
    try {
      await fetch('/api/ai-keys', { method: 'DELETE' })
      await load()
      toast.success('Disconnected')
    } finally { setBusy(false) }
  }

  return (
    <section className="card">
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
        Connect your agent
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Bot size={16} color="var(--text)" />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Your AI key</h3>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.55 }}>
        Jalayu runs on your own AI agent, so it&apos;s your account that&apos;s billed — never anyone else&apos;s. Paste a key and it&apos;s stored encrypted.
      </p>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading…</div>
      ) : status?.connected ? (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={15} color="#16A34A" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {PROVIDERS.find((p) => p.id === status.provider)?.label ?? status.provider} connected
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  Key ••••{status.key_hint} {status.verified ? '· verified' : '· stored (not yet active)'}
                </div>
              </div>
            </div>
            <button type="button" onClick={() => void disconnect()} disabled={busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Trash2 size={12} /> Disconnect
            </button>
          </div>
          <button type="button" onClick={() => setStatus({ connected: false })}
            style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Replace key
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', fontSize: 13, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}{p.wired ? '' : ' — support coming'}</option>)}
            </select>
          </div>
          {!meta.wired && (
            <div style={{ fontSize: 11.5, color: 'var(--text-2)', padding: '8px 10px', borderRadius: 8, background: 'var(--morning)', border: '1px solid var(--border)', lineHeight: 1.5 }}>
              Jalayu is built on Claude today, so it&apos;s fully wired. You can store a {meta.label} key now, but routing for it is the next step — use Claude for the live experience.
            </div>
          )}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>API key</label>
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={meta.hint}
              style={{ width: '100%', padding: '9px 11px', fontSize: 13, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <a href={meta.console} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none' }}>
              Get a key <ExternalLink size={11} />
            </a>
          </div>
          <button type="button" onClick={() => void save()} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {busy ? 'Verifying…' : 'Connect & verify'}
          </button>
        </div>
      )}
    </section>
  )
}
