'use client'

import { useState } from 'react'
import { Loader2, Search, TrendingUp, TrendingDown } from 'lucide-react'
import { REAL_SETUP_TAGS } from '@/lib/academy-coach'
import SetupStatsBadge from './SetupStatsBadge'
import type { ReviewTrade, ReviewVerdict } from './TradeReviewCard'

interface QuoteResponse {
  quote: { symbol: string; name: string; price: number; change: number; changePct: number }
  signal: { score: number; direction: 'LONG' | 'SHORT'; action: string; setupTag: string; reason: string }
}

interface BotSetupStat { setupTag: string; totalTrades: number; winRatePct: number; avgPnl: number }

interface Props {
  cash: number
  openSymbols: string[]
  botStats: BotSetupStat[] | null
  onTraded: (result: { trade: ReviewTrade; review: ReviewVerdict | null; reviewError: string | null }) => void
}

export default function OrderTicket({ cash, openSymbols, botStats, onTraded }: Props) {
  const [symbolInput, setSymbolInput] = useState('')
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)

  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG')
  const [dollarAmount, setDollarAmount] = useState('50')
  const [showPlan, setShowPlan] = useState(false)
  const [declaredSetupTag, setDeclaredSetupTag] = useState('')
  const [declaredStopLoss, setDeclaredStopLoss] = useState('')
  const [declaredTakeProfit, setDeclaredTakeProfit] = useState('')
  const [thesis, setThesis] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const lookupSymbol = symbolInput.toUpperCase().trim()
  const alreadyOpen = quote != null && openSymbols.includes(quote.quote.symbol)

  const lookup = async () => {
    if (!lookupSymbol) return
    setLoadingQuote(true)
    setLookupError(null)
    setQuote(null)
    try {
      const res = await fetch(`/api/academy/quote?symbol=${encodeURIComponent(lookupSymbol)}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setQuote(json as QuoteResponse)
      setDeclaredSetupTag(json.signal?.setupTag && REAL_SETUP_TAGS.includes(json.signal.setupTag) ? json.signal.setupTag : '')
      setDirection(json.signal?.direction === 'SHORT' ? 'SHORT' : 'LONG')
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed')
    } finally {
      setLoadingQuote(false)
    }
  }

  const submit = async () => {
    if (!quote) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/academy/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: quote.quote.symbol,
          intent: 'OPEN',
          direction,
          dollarAmount: Number(dollarAmount),
          declaredSetupTag: declaredSetupTag || null,
          declaredStopLoss: declaredStopLoss ? Number(declaredStopLoss) : null,
          declaredTakeProfit: declaredTakeProfit ? Number(declaredTakeProfit) : null,
          thesis: thesis || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      onTraded({ trade: json.trade, review: json.review?.verdict ?? null, reviewError: json.reviewError })
      setQuote(null)
      setSymbolInput('')
      setDeclaredSetupTag('')
      setDeclaredStopLoss('')
      setDeclaredTakeProfit('')
      setThesis('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Trade failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 14,
      background: 'var(--surface)', padding: 16,
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>
        Place an order
      </h3>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          type="text"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value.toUpperCase().slice(0, 10))}
          onKeyDown={(e) => { if (e.key === 'Enter') void lookup() }}
          placeholder="AAPL"
          style={{
            flex: 1, padding: '9px 12px', fontSize: 13, fontWeight: 600,
            background: 'var(--morning)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 8,
            outline: 'none', fontFamily: 'inherit', textTransform: 'uppercase',
          }}
        />
        <button
          type="button"
          onClick={() => void lookup()}
          disabled={loadingQuote || !lookupSymbol}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            background: 'var(--accent)', color: '#fff', border: 'none',
            cursor: loadingQuote ? 'wait' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {loadingQuote ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          Look up
        </button>
      </div>

      {lookupError && (
        <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 10 }}>{lookupError}</div>
      )}

      {quote && (
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 12px', marginBottom: 10, borderRadius: 8,
            background: 'var(--morning)',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{quote.quote.symbol}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{quote.quote.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>${quote.quote.price.toFixed(2)}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: quote.quote.changePct >= 0 ? '#15803d' : '#b91c1c' }}>
                {quote.quote.changePct >= 0 ? '+' : ''}{quote.quote.changePct.toFixed(2)}%
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12, fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Current signal: <strong style={{ color: 'var(--text)' }}>{quote.signal.setupTag}</strong>
            {' '}(score {quote.signal.score.toFixed(1)}, {quote.signal.action}) — {quote.signal.reason}
            {REAL_SETUP_TAGS.includes(quote.signal.setupTag) && (
              <div style={{ marginTop: 6 }}>
                <SetupStatsBadge setupTag={quote.signal.setupTag} stats={botStats} />
              </div>
            )}
          </div>

          {alreadyOpen ? (
            <div style={{
              padding: 10, borderRadius: 8, fontSize: 12, color: 'var(--text-2)',
              background: 'var(--morning)', border: '1px solid var(--border)',
            }}>
              You already have an open position in {quote.quote.symbol} — close it from Positions above before trading it again.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setDirection('LONG')}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    border: `1.5px solid ${direction === 'LONG' ? '#16A34A' : 'var(--border)'}`,
                    background: direction === 'LONG' ? 'rgba(34,197,94,0.1)' : 'var(--surface)',
                    color: direction === 'LONG' ? '#16A34A' : 'var(--text-2)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <TrendingUp size={13} /> Buy to open
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('SHORT')}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    border: `1.5px solid ${direction === 'SHORT' ? '#DC2626' : 'var(--border)'}`,
                    background: direction === 'SHORT' ? 'rgba(220,38,38,0.08)' : 'var(--surface)',
                    color: direction === 'SHORT' ? '#DC2626' : 'var(--text-2)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <TrendingDown size={13} /> Sell short to open
                </button>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                  Dollar amount (cash available: ${cash.toFixed(2)})
                </label>
                <input
                  type="number"
                  min={0}
                  value={dollarAmount}
                  onChange={(e) => setDollarAmount(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 13, fontWeight: 600,
                    background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 8,
                    outline: 'none', fontFamily: 'inherit', color: 'var(--text)',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setShowPlan(!showPlan)}
                style={{
                  background: 'none', border: 'none', padding: 0, marginBottom: showPlan ? 10 : 12,
                  fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {showPlan ? 'Hide my plan' : 'I have a plan — declare it (optional)'}
              </button>

              {showPlan && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <select
                    value={declaredSetupTag}
                    onChange={(e) => setDeclaredSetupTag(e.target.value)}
                    style={{
                      padding: '8px 10px', fontSize: 12, borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--morning)',
                      color: 'var(--text)', fontFamily: 'inherit',
                    }}
                  >
                    <option value="">What setup do you think this is?</option>
                    {REAL_SETUP_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="number" placeholder="Stop loss $" value={declaredStopLoss}
                      onChange={(e) => setDeclaredStopLoss(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }}
                    />
                    <input
                      type="number" placeholder="Take profit $" value={declaredTakeProfit}
                      onChange={(e) => setDeclaredTakeProfit(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }}
                    />
                  </div>
                  <textarea
                    placeholder="Why are you taking this trade?"
                    value={thesis}
                    onChange={(e) => setThesis(e.target.value)}
                    rows={2}
                    style={{
                      padding: '8px 10px', fontSize: 12, borderRadius: 8, resize: 'vertical',
                      border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit',
                    }}
                  />
                </div>
              )}

              {submitError && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{submitError}</div>}

              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                style={{
                  width: '100%', padding: '11px 0', borderRadius: 9, fontSize: 13, fontWeight: 700,
                  border: 'none', cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                  background: direction === 'LONG' ? '#16A34A' : '#DC2626', color: '#fff',
                }}
              >
                {submitting ? 'Placing order…' : direction === 'LONG' ? 'Buy to open' : 'Sell short to open'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
