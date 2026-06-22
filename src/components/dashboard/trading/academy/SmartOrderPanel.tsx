'use client'

import { useState } from 'react'
import { Loader2, Search, TrendingUp, TrendingDown } from 'lucide-react'

interface QuoteResponse {
  quote: { symbol: string; name: string; price: number; changePct: number }
  signal: { score: number; setupTag: string; reason: string }
}

interface Props {
  onPlaced: (message: string) => void
}

type OrderType = 'LIMIT' | 'BRACKET'
const QUICK_SHARES = [10, 50, 100]

/**
 * Smart (auto-managed) orders: limit "buy/sell at this price" and brackets
 * (sell half at target 1 with the stop sliding to break-even, rest at
 * target 2). These run server-side via the monitor/cron — no coach call.
 */
export default function SmartOrderPanel({ onPlaced }: Props) {
  const [symbolInput, setSymbolInput] = useState('')
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [orderType, setOrderType] = useState<OrderType>('BRACKET')
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG')
  const [shares, setShares] = useState('50')
  const [entryKind, setEntryKind] = useState<'MARKET' | 'LIMIT'>('MARKET')
  const [limitPrice, setLimitPrice] = useState('')
  const [stop, setStop] = useState('')
  const [t1, setT1] = useState('')
  const [t2, setT2] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const sym = symbolInput.toUpperCase().trim()

  const lookup = async () => {
    if (!sym) return
    setLoadingQuote(true); setLookupError(null); setQuote(null)
    try {
      const res = await fetch(`/api/academy/quote?symbol=${encodeURIComponent(sym)}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setQuote(json as QuoteResponse)
      // Prefill sensible defaults around the live price
      const p = json.quote.price as number
      if (!stop) setStop((p * 0.99).toFixed(2))
      if (!t1) setT1((p * 1.01).toFixed(2))
      if (!t2) setT2((p * 1.02).toFixed(2))
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed')
    } finally {
      setLoadingQuote(false)
    }
  }

  const submit = async () => {
    if (!quote) return
    setSubmitting(true); setSubmitError(null)
    try {
      const isLimitEntry = orderType === 'LIMIT' || entryKind === 'LIMIT'
      const body: Record<string, unknown> = {
        symbol: quote.quote.symbol,
        direction,
        shares: Number(shares),
        entryKind: orderType === 'LIMIT' ? 'LIMIT' : entryKind,
        limitPrice: isLimitEntry ? Number(limitPrice) : null,
      }
      if (orderType === 'BRACKET') {
        body.stopPrice = stop ? Number(stop) : null
        body.target1Price = t1 ? Number(t1) : null
        body.target2Price = t2 ? Number(t2) : null
      }
      const res = await fetch('/api/academy/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      onPlaced(json.message || 'Order placed.')
      setQuote(null); setSymbolInput(''); setLimitPrice(''); setStop(''); setT1(''); setT2('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Order failed')
    } finally {
      setSubmitting(false)
    }
  }

  const p = quote?.quote.price ?? 0
  const half = Math.round((Number(shares) / 2) * 100) / 100
  const planText = orderType === 'BRACKET'
    ? `${direction === 'LONG' ? 'Buy' : 'Short'} ${shares} ${sym} ${entryKind === 'MARKET' ? 'now' : `when it hits $${limitPrice || '—'}`}. ` +
      `Take ${half} off at $${t1 || '—'} (stop then moves to break-even), close the rest at $${t2 || '—'}. Hard stop $${stop || '—'}.`
    : `${direction === 'LONG' ? 'Buy' : 'Short'} ${shares} ${sym} when price ${direction === 'LONG' ? 'drops to' : 'rises to'} $${limitPrice || '—'}.`

  const field = (label: string, value: string, set: (v: string) => void, placeholder = '') => (
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>{label}</label>
      <input type="number" value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)}
        style={{ width: '100%', padding: '7px 9px', fontSize: 12.5, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }} />
    </div>
  )

  return (
    <div>
      {/* Symbol */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input type="text" value={symbolInput} placeholder="AAPL"
          onChange={(e) => setSymbolInput(e.target.value.toUpperCase().slice(0, 10))}
          onKeyDown={(e) => { if (e.key === 'Enter') void lookup() }}
          style={{ flex: 1, padding: '9px 12px', fontSize: 13, fontWeight: 600, background: 'var(--morning)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', fontFamily: 'inherit', textTransform: 'uppercase' }} />
        <button type="button" onClick={() => void lookup()} disabled={loadingQuote || !sym}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: loadingQuote ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          {loadingQuote ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Look up
        </button>
      </div>
      {lookupError && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 10 }}>{lookupError}</div>}

      {quote && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', marginBottom: 10, borderRadius: 8, background: 'var(--morning)' }}>
            <div><div style={{ fontSize: 13, fontWeight: 700 }}>{quote.quote.symbol}</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{quote.quote.name}</div></div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>${p.toFixed(2)}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: quote.quote.changePct >= 0 ? '#15803d' : '#b91c1c' }}>{quote.quote.changePct >= 0 ? '+' : ''}{quote.quote.changePct.toFixed(2)}%</div>
            </div>
          </div>

          {/* Order type */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['BRACKET', 'LIMIT'] as OrderType[]).map((t) => (
              <button key={t} type="button" onClick={() => setOrderType(t)}
                style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: orderType === t ? 'var(--accent)' : 'var(--morning)', color: orderType === t ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)' }}>
                {t === 'BRACKET' ? 'Bracket (half / half)' : 'Limit'}
              </button>
            ))}
          </div>

          {/* Direction */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button type="button" onClick={() => setDirection('LONG')}
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit',
                border: `1.5px solid ${direction === 'LONG' ? '#16A34A' : 'var(--border)'}`, background: direction === 'LONG' ? 'rgba(34,197,94,0.1)' : 'var(--surface)', color: direction === 'LONG' ? '#16A34A' : 'var(--text-2)' }}>
              <TrendingUp size={13} /> Long
            </button>
            <button type="button" onClick={() => setDirection('SHORT')}
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit',
                border: `1.5px solid ${direction === 'SHORT' ? '#DC2626' : 'var(--border)'}`, background: direction === 'SHORT' ? 'rgba(220,38,38,0.08)' : 'var(--surface)', color: direction === 'SHORT' ? '#DC2626' : 'var(--text-2)' }}>
              <TrendingDown size={13} /> Short
            </button>
          </div>

          {/* Shares */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Shares</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {QUICK_SHARES.map((q) => (
                <button key={q} type="button" onClick={() => setShares(String(q))}
                  style={{ padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    background: shares === String(q) ? 'var(--accent)' : 'var(--morning)', color: shares === String(q) ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)' }}>{q}</button>
              ))}
              <input type="number" value={shares} onChange={(e) => setShares(e.target.value)}
                style={{ flex: 1, padding: '7px 10px', fontSize: 12.5, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }} />
            </div>
          </div>

          {/* Entry kind (bracket only) */}
          {orderType === 'BRACKET' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['MARKET', 'LIMIT'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setEntryKind(k)}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    background: entryKind === k ? 'var(--surface-2, var(--morning))' : 'transparent', color: entryKind === k ? 'var(--text)' : 'var(--text-3)', border: `1px solid ${entryKind === k ? 'var(--border)' : 'transparent'}` }}>
                  Enter {k === 'MARKET' ? 'now (market)' : 'at limit'}
                </button>
              ))}
            </div>
          )}

          {/* Price fields */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(orderType === 'LIMIT' || entryKind === 'LIMIT') && field(orderType === 'LIMIT' ? 'Limit price' : 'Entry limit', limitPrice, setLimitPrice, p.toFixed(2))}
            {orderType === 'BRACKET' && field('Stop', stop, setStop)}
          </div>
          {orderType === 'BRACKET' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {field('Target 1 (sell half)', t1, setT1)}
              {field('Target 2 (sell rest)', t2, setT2)}
            </div>
          )}

          {/* Plan preview */}
          <div style={{ padding: '9px 11px', marginBottom: 10, borderRadius: 8, background: 'var(--morning)', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>Plan: </strong>{planText}
          </div>

          {submitError && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{submitError}</div>}
          <button type="button" onClick={() => void submit()} disabled={submitting}
            style={{ width: '100%', padding: '11px 0', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
              background: direction === 'LONG' ? '#16A34A' : '#DC2626', color: '#fff' }}>
            {submitting ? 'Placing…' : orderType === 'BRACKET' && entryKind === 'MARKET' ? 'Place bracket (enter now)' : 'Set order'}
          </button>
        </>
      )}
    </div>
  )
}
