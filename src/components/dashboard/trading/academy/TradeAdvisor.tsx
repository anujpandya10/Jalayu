'use client'

import { useState, useEffect, useCallback } from 'react'
import { Compass, Loader2, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { isUsMarketOpenNow } from '@/lib/market-hours'
import SetupStatsBadge from './SetupStatsBadge'

interface SuggestResponse {
  symbol: string
  direction: 'LONG' | 'SHORT'
  price: number
  verdict: 'bullish' | 'neutral' | 'bearish'
  aligned: boolean
  score: number
  setupTag: string
  reason: string
  rsi: number | null
  suggested: { stop: number; target1: number; target2: number }
  warning: string | null
}

interface BotSetupStat { setupTag: string; totalTrades: number; winRatePct: number; avgPnl: number }

const REFRESH_MS = 30_000

/**
 * Trade Advisor — the desk's own opinion on the symbol you're looking at,
 * stated plainly: direction, why, and exact stop/target levels. Re-reads
 * automatically every time you load a different symbol (and every 30s while
 * you're on one), so it's never stale. This is the engine's real signal logic
 * — not a guess about the future, a calibrated read with its own real
 * historical win rate attached, so you can judge how much to trust it.
 */
export default function TradeAdvisor({
  symbol, cash, hasPosition, onTraded,
}: {
  symbol: string
  cash: number
  hasPosition: boolean
  onTraded: (message: string) => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [longRead, setLongRead] = useState<SuggestResponse | null>(null)
  const [shortRead, setShortRead] = useState<SuggestResponse | null>(null)
  const [botStats, setBotStats] = useState<BotSetupStat[] | null>(null)
  const [qty, setQty] = useState(100)
  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [lRes, sRes, statsRes] = await Promise.all([
        fetch(`/api/academy/suggest?symbol=${encodeURIComponent(symbol)}&direction=LONG`, { cache: 'no-store' }),
        fetch(`/api/academy/suggest?symbol=${encodeURIComponent(symbol)}&direction=SHORT`, { cache: 'no-store' }),
        fetch('/api/academy/stats', { cache: 'no-store' }),
      ])
      const [lJson, sJson] = await Promise.all([lRes.json(), sRes.json()])
      if (!lRes.ok) throw new Error(lJson.error || 'Could not read this symbol')
      setLongRead(lJson); setShortRead(sRes.ok ? sJson : null)
      if (statsRes.ok) setBotStats((await statsRes.json()).botSetupStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
      setLongRead(null); setShortRead(null)
    } finally {
      setLoading(false)
    }
  }, [symbol])

  useEffect(() => {
    void load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const placeRecommended = async (plan: SuggestResponse) => {
    setPlacing(true); setPlaceError(null)
    try {
      const res = await fetch('/api/academy/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol, direction: plan.direction, shares: qty, orderType: 'MARKET',
          stopPrice: plan.suggested.stop, target1Price: plan.suggested.target1, target2Price: plan.suggested.target2,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setPlaceError(json.error || 'Order failed'); return }
      onTraded(json.message || `Placed recommended ${plan.direction.toLowerCase()} on ${symbol}`)
    } finally {
      setPlacing(false)
    }
  }

  if (loading && !longRead) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-3)' }}>
        <Loader2 size={14} className="animate-spin" /> Reading {symbol}…
      </div>
    )
  }
  if (error || !longRead) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, fontSize: 12.5, color: '#DC2626' }}>
        {error || 'Could not read this symbol.'}
      </div>
    )
  }

  // Pick whichever side actually has a real setup; otherwise show the no-trade read.
  const plan: SuggestResponse | null = longRead.aligned ? longRead : shortRead?.aligned ? shortRead : null
  const ref = plan ?? longRead
  const isLong = ref.direction === 'LONG'
  const marketOpen = isUsMarketOpenNow()
  const pct = (level: number) => ((level - ref.price) / ref.price) * 100

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Compass size={15} color="var(--accent)" />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Trade Advisor</h3>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{symbol}</span>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>${ref.price.toFixed(2)}</span>
        {loading && <Loader2 size={11} className="animate-spin" color="var(--text-3)" />}
        <span style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 800,
          background: plan ? (isLong ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.12)') : 'rgba(217,119,6,0.12)',
          color: plan ? (isLong ? '#16A34A' : '#DC2626') : '#b45309',
        }}>
          {plan ? (isLong ? <TrendingUp size={12} /> : <TrendingDown size={12} />) : <AlertTriangle size={12} />}
          {plan ? (isLong ? 'Bullish setup' : 'Bearish setup') : 'No clear setup'}
        </span>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55, margin: '0 0 10px' }}>
        {ref.reason} (score {ref.score.toFixed(1)}{ref.rsi != null ? `, RSI ${ref.rsi.toFixed(0)}` : ''})
      </p>

      {!plan && (
        <div style={{ marginBottom: 10, padding: '9px 12px', borderRadius: 8, background: 'var(--morning)', border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {longRead.warning || `Neither a long nor short setup is confirmed on ${symbol} right now. Worth waiting for confirmation or checking another symbol.`}
        </div>
      )}

      {plan && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 10 }}>
            <Level label={isLong ? 'Buy at' : 'Short at'} value={ref.price} pct={0} color="var(--text)" />
            <Level label="Stop loss" value={plan.suggested.stop} pct={pct(plan.suggested.stop)} color="#DC2626" />
            <Level label="Sell half at" value={plan.suggested.target1} pct={pct(plan.suggested.target1)} color="#22C55E" />
            <Level label="Let rest run to" value={plan.suggested.target2} pct={pct(plan.suggested.target2)} color="#16A34A" />
          </div>

          <div style={{ marginBottom: 10 }}>
            <SetupStatsBadge setupTag={plan.setupTag} stats={botStats} />
          </div>

          {!marketOpen && (
            <div style={{ marginBottom: 10, fontSize: 11.5, color: 'var(--text-3)' }}>Market closed — recommended trade will be ready to place when it opens.</div>
          )}
          {hasPosition && (
            <div style={{ marginBottom: 10, fontSize: 11.5, color: 'var(--text-3)' }}>You already hold {symbol} — manage the open position above.</div>
          )}

          {!hasPosition && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" value={qty} min={1} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: 70, padding: '9px 10px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }} />
              <button type="button" onClick={() => void placeRecommended(plan)} disabled={placing || !marketOpen}
                style={{ flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none',
                  background: isLong ? '#16A34A' : '#DC2626', color: '#fff', cursor: !marketOpen ? 'not-allowed' : placing ? 'wait' : 'pointer', opacity: marketOpen ? 1 : 0.5, fontFamily: 'inherit' }}>
                {placing ? 'Placing…' : `Place this trade — ${isLong ? 'buy' : 'short'} ${qty} with bracket`}
              </button>
            </div>
          )}
          {placeError && <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 8 }}>{placeError}</div>}
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.4 }}>
            This is the bot&apos;s real signal math, not a guarantee — its actual win rate for this setup is shown above. Refreshes automatically every 30s and whenever you load a different symbol.
          </p>
        </>
      )}
    </div>
  )
}

function Level({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div style={{ padding: '8px 10px', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>${value.toFixed(2)}</div>
      {pct !== 0 && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</div>}
    </div>
  )
}
