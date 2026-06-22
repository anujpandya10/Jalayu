'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import TradeReviewCard, { type ReviewTrade, type ReviewVerdict } from './TradeReviewCard'

interface HistoryRow extends ReviewTrade {
  academy_trade_reviews: ReviewVerdict[]
}

interface Props {
  trades: HistoryRow[]
  loading?: boolean
}

const VERDICT_DOT: Record<string, string> = { GOOD: '#16A34A', QUESTIONABLE: '#D97706', BAD: '#DC2626' }

export default function TradeReviewFeed({ trades, loading }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <History size={15} color="var(--accent)" />
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Your trade history & coach feedback
        </h3>
      </div>

      {loading && <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading…</p>}

      {!loading && trades.length === 0 && (
        <div style={{
          padding: 20, textAlign: 'center', borderRadius: 10,
          border: '1px dashed var(--border)', fontSize: 12, color: 'var(--text-3)',
        }}>
          No practice trades yet. Place one above — the coach reviews every entry and exit.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {trades.map((t) => {
          const isOpen = expanded === t.id
          const review = t.academy_trade_reviews?.[0] ?? null
          const dotColor = review ? VERDICT_DOT[review.verdict] ?? 'var(--text-3)' : 'var(--text-3)'
          const closed = t.pnl != null
          return (
            <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : t.id)}
                style={{
                  width: '100%', padding: '8px 10px', background: 'transparent', border: 'none',
                  cursor: 'pointer', display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto',
                  gap: 10, alignItems: 'center', fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                {isOpen ? <ChevronDown size={11} color="var(--text-3)" /> : <ChevronRight size={11} color="var(--text-3)" />}
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                  {t.symbol}
                  <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-3)', fontWeight: 400 }}>
                    {t.direction === 'SHORT' ? 'short' : 'long'} · {closed ? 'closed' : 'opened'}
                  </span>
                </span>
                {closed ? (
                  <span style={{ fontSize: 11, fontWeight: 600, color: (t.pnl ?? 0) >= 0 ? '#16A34A' : '#DC2626' }}>
                    {(t.pnl ?? 0) >= 0 ? '+' : ''}${(t.pnl ?? 0).toFixed(2)}
                  </span>
                ) : (
                  <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>${t.total.toFixed(0)}</span>
                )}
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {new Date(t.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </button>

              {isOpen && (
                <div style={{ padding: 10, borderTop: '1px solid var(--border)', background: 'var(--morning)' }}>
                  <TradeReviewCard trade={t} review={review} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
