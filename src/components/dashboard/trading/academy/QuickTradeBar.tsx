'use client'

import { useState } from 'react'
import { Zap, Loader2 } from 'lucide-react'

interface Props {
  symbol: string
  onTraded: (message: string) => void
}

const QUICK_SIZES = [10, 50, 100, 500]

/**
 * Webull "TurboTrader" style one-click bar — buy/sell the charted symbol at
 * market with a single tap. Quantity presets + custom. Market orders fill via
 * the existing /api/academy/orders path.
 */
export default function QuickTradeBar({ symbol, onTraded }: Props) {
  const [qty, setQty] = useState(100)
  const [busy, setBusy] = useState<'LONG' | 'SHORT' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const trade = async (direction: 'LONG' | 'SHORT') => {
    setBusy(direction); setErr(null)
    try {
      const res = await fetch('/api/academy/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, direction, shares: qty, orderType: 'MARKET' }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error || 'Order failed'); return }
      onTraded(json.message || `${direction === 'LONG' ? 'Bought' : 'Sold'} ${qty} ${symbol}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Zap size={15} color="var(--accent)" />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Quick trade</h3>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginLeft: 2 }}>{symbol}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· one tap, market order</span>
      </div>

      {/* Quantity */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {QUICK_SIZES.map((q) => (
          <button key={q} type="button" onClick={() => setQty(q)}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: qty === q ? 'var(--accent)' : 'var(--morning)', color: qty === q ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)' }}>
            {q}
          </button>
        ))}
        <input type="number" value={qty} min={1} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          style={{ width: 80, padding: '7px 10px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }} />
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>shares</span>
      </div>

      {/* Buy / Sell */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => void trade('LONG')} disabled={busy != null}
          style={{ flex: 1, padding: '13px 0', borderRadius: 10, fontSize: 14, fontWeight: 800, border: 'none', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', background: '#16A34A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {busy === 'LONG' ? <Loader2 size={14} className="animate-spin" /> : null}
          Buy {qty} @ Market
        </button>
        <button type="button" onClick={() => void trade('SHORT')} disabled={busy != null}
          style={{ flex: 1, padding: '13px 0', borderRadius: 10, fontSize: 14, fontWeight: 800, border: 'none', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', background: '#DC2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {busy === 'SHORT' ? <Loader2 size={14} className="animate-spin" /> : null}
          Sell {qty} @ Market
        </button>
      </div>
      {err && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>{err}</div>}
    </div>
  )
}
