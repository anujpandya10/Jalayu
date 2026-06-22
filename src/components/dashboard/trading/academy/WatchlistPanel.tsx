'use client'

import { useState, useEffect, useCallback } from 'react'
import { Star, Plus, X, Loader2 } from 'lucide-react'

interface Item {
  symbol: string
  name: string
  price: number | null
  changePct: number | null
}

interface Props {
  onPick: (symbol: string) => void
  activeSymbol?: string
}

/**
 * The watchlist — your 5 names for the day (the 8:30 step). Live price + %,
 * tap to load into the chart, add/remove inline.
 */
export default function WatchlistPanel({ onPick, activeSymbol }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/academy/watchlist', { cache: 'no-store' })
      if (res.ok) setItems(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  const add = async () => {
    const sym = input.toUpperCase().trim()
    if (!sym) return
    setAdding(true); setErr(null)
    try {
      const res = await fetch('/api/academy/watchlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setInput('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setAdding(false)
    }
  }

  const remove = async (sym: string) => {
    setItems((prev) => prev.filter((i) => i.symbol !== sym))
    try { await fetch(`/api/academy/watchlist?symbol=${encodeURIComponent(sym)}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Star size={15} color="var(--accent)" />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Watchlist</h3>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{items.length} {items.length === 1 ? 'name' : 'names'}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input type="text" value={input} placeholder="Add ticker (e.g. TSLA)"
          onChange={(e) => setInput(e.target.value.toUpperCase().slice(0, 10))}
          onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
          style={{ flex: 1, padding: '8px 11px', fontSize: 12.5, fontWeight: 600, background: 'var(--morning)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', fontFamily: 'inherit', textTransform: 'uppercase' }} />
        <button type="button" onClick={() => void add()} disabled={adding || !input}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', cursor: adding ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
        </button>
      </div>
      {err && <div style={{ fontSize: 11.5, color: '#b91c1c', marginBottom: 8 }}>{err}</div>}

      {items.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', borderRadius: 10, border: '1px dashed var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
          Empty. Add the 5 names you&apos;re watching today.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((it) => {
            const active = it.symbol === activeSymbol
            const up = (it.changePct ?? 0) >= 0
            return (
              <div key={it.symbol}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  background: active ? 'rgba(10,123,106,0.08)' : 'transparent', border: `1px solid ${active ? 'var(--accent)' : 'transparent'}` }}
                onClick={() => onPick(it.symbol)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{it.symbol}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{it.price != null ? `$${it.price.toFixed(2)}` : '—'}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: up ? '#15803d' : '#b91c1c' }}>
                    {it.changePct != null ? `${up ? '+' : ''}${it.changePct.toFixed(2)}%` : ''}
                  </div>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); void remove(it.symbol) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }} title="Remove">
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
