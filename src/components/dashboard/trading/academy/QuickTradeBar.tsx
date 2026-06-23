'use client'

import { useState } from 'react'
import { Zap, Loader2, X, ShieldAlert } from 'lucide-react'
import { isUsMarketOpenNow } from '@/lib/market-hours'

interface HeldPosition { direction: 'LONG' | 'SHORT'; shares: number }
interface EntryGate { verdict: 'GOOD' | 'WEAK' | 'BAD'; reason: string; matchedSetup?: string }

interface Props {
  symbol: string
  /** If you already hold this symbol, shows "Close position" instead of Buy/Short. */
  position?: HeldPosition | null
  onTraded: (message: string) => void
}

const QUICK_SIZES = [10, 50, 100, 500]

/**
 * Webull "TurboTrader" style one-click bar — buy or short the charted symbol
 * at market with a single tap, or close it if you already hold it. Quantity
 * presets + custom. Market orders fill via /api/academy/orders (open) or
 * /api/academy/trade (close).
 */
export default function QuickTradeBar({ symbol, position, onTraded }: Props) {
  const [qty, setQty] = useState(100)
  const [busy, setBusy] = useState<'LONG' | 'SHORT' | 'CLOSE' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<{ direction: 'LONG' | 'SHORT'; gate: EntryGate } | null>(null)
  const marketOpen = isUsMarketOpenNow()

  const trade = async (direction: 'LONG' | 'SHORT', overrideGate = false) => {
    setBusy(direction); setErr(null)
    try {
      const res = await fetch('/api/academy/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, direction, shares: qty, orderType: 'MARKET', overrideGate }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.needsOverride && json.gate) { setBlocked({ direction, gate: json.gate }); return }
        setErr(json.error || 'Order failed')
        return
      }
      setBlocked(null)
      const verdictPrefix = json.gate?.verdict === 'GOOD' ? '✓ Good entry — ' : json.gate?.verdict === 'WEAK' ? '⚠ Weak setup — ' : ''
      onTraded(verdictPrefix + (json.message || `${direction === 'LONG' ? 'Bought' : 'Shorted'} ${qty} ${symbol}`))
    } finally {
      setBusy(null)
    }
  }

  const closePosition = async () => {
    setBusy('CLOSE'); setErr(null)
    try {
      const res = await fetch('/api/academy/trade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, intent: 'CLOSE' }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error || 'Close failed'); return }
      onTraded(json.message || `Closed ${symbol}`)
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
        <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
          background: marketOpen ? 'rgba(34,197,94,0.12)' : 'rgba(120,113,108,0.14)', color: marketOpen ? '#15803d' : 'var(--text-3)' }}>
          {marketOpen ? '● Market open' : '○ Market closed'}
        </span>
      </div>

      {!marketOpen && (
        <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 8, background: 'var(--morning)', border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
          US market is closed (9:30am–4:00pm ET, weekdays). Orders resume when it opens.
        </div>
      )}

      {blocked && (
        <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
            <ShieldAlert size={14} color="#DC2626" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
              <strong style={{ color: '#DC2626' }}>No real edge here.</strong> {blocked.gate.reason}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setBlocked(null)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button type="button" onClick={() => void trade(blocked.direction, true)}
              style={{ flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 700, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              Trade anyway
            </button>
          </div>
        </div>
      )}

      {position ? (
        <button type="button" onClick={() => void closePosition()} disabled={busy != null || !marketOpen}
          style={{ width: '100%', padding: '13px 0', borderRadius: 10, fontSize: 14, fontWeight: 800, border: 'none', cursor: busy ? 'wait' : !marketOpen ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: '#1c1917', color: '#fff', opacity: marketOpen ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {busy === 'CLOSE' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          Close {position.direction === 'SHORT' ? 'short' : 'long'} — sell {position.shares} shares
        </button>
      ) : (
        <>
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

          {/* Buy (go long) / Short (go short) — never labeled "Sell" while flat, since that reads as closing something you don't hold */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void trade('LONG')} disabled={busy != null || !marketOpen}
              style={{ flex: 1, padding: '13px 0', borderRadius: 10, fontSize: 14, fontWeight: 800, border: 'none', cursor: busy ? 'wait' : !marketOpen ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: '#16A34A', color: '#fff', opacity: marketOpen ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {busy === 'LONG' ? <Loader2 size={14} className="animate-spin" /> : null}
              Buy {qty} (go long)
            </button>
            <button type="button" onClick={() => void trade('SHORT')} disabled={busy != null || !marketOpen}
              style={{ flex: 1, padding: '13px 0', borderRadius: 10, fontSize: 14, fontWeight: 800, border: 'none', cursor: busy ? 'wait' : !marketOpen ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: '#DC2626', color: '#fff', opacity: marketOpen ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {busy === 'SHORT' ? <Loader2 size={14} className="animate-spin" /> : null}
              Short {qty} (bet it falls)
            </button>
          </div>
        </>
      )}
      {err && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 8 }}>{err}</div>}
    </div>
  )
}
