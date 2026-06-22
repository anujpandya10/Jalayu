'use client'

import { useState } from 'react'
import { Shield } from 'lucide-react'

interface Props {
  symbol: string
  currentPrice: number
  onManaged: () => void
}

/**
 * Attach protective exits (stop-loss, take-profit targets, trailing stop) to a
 * position you already hold. Mirrors Webull's "set stop / take profit" on an
 * open position.
 */
export default function ManagePosition({ symbol, currentPrice, onManaged }: Props) {
  const [open, setOpen] = useState(false)
  const [stop, setStop] = useState('')
  const [t1, setT1] = useState('')
  const [t2, setT2] = useState('')
  const [trail, setTrail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/academy/positions/manage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          stopPrice: stop ? Number(stop) : null,
          target1Price: t1 ? Number(t1) : null,
          target2Price: t2 ? Number(t2) : null,
          trailPercent: trail ? Number(trail) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpen(false); onManaged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
        <Shield size={11} /> Protect
      </button>
    )
  }

  const fld = (label: string, v: string, set: (s: string) => void, ph: string) => (
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 9.5, color: 'var(--text-3)', display: 'block', marginBottom: 2 }}>{label}</label>
      <input type="number" value={v} placeholder={ph} onChange={(e) => set(e.target.value)}
        style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit' }} />
    </div>
  )

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'var(--morning)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Protect {symbol} (now ${currentPrice.toFixed(2)})</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {fld('Stop loss', stop, setStop, (currentPrice * 0.98).toFixed(2))}
        {fld('Trailing %', trail, setTrail, 'e.g. 2')}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {fld('Target 1 (½)', t1, setT1, (currentPrice * 1.02).toFixed(2))}
        {fld('Target 2', t2, setT2, (currentPrice * 1.04).toFixed(2))}
      </div>
      {err && <div style={{ fontSize: 11, color: '#b91c1c', marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => void save()} disabled={busy}
          style={{ flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 12, fontWeight: 600, border: 'none', background: 'var(--accent)', color: '#fff', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          {busy ? 'Saving…' : 'Set protection'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          style={{ padding: '8px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
