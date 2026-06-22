'use client'

import { Loader2, CheckCircle2, AlertTriangle, XCircle, TrendingUp, TrendingDown } from 'lucide-react'

export interface ReviewVerdict {
  verdict: 'GOOD' | 'QUESTIONABLE' | 'BAD'
  matched_setup_tag: string | null
  setup_match: boolean | null
  headline: string
  rationale: string
  better_action: string | null
  risk_note: string | null
  hindsight_verdict?: string | null
  hindsight_pct_move?: number | null
}

export interface ReviewTrade {
  id: string
  symbol: string
  action: 'BUY' | 'SELL'
  direction: 'LONG' | 'SHORT'
  shares: number
  price: number
  total: number
  pnl: number | null
  created_at: string
}

interface Props {
  trade: ReviewTrade
  review: ReviewVerdict | null
  reviewError?: string | null
  pending?: boolean
}

const VERDICT_META: Record<ReviewVerdict['verdict'], { color: string; bg: string; border: string; Icon: typeof CheckCircle2 }> = {
  GOOD: { color: '#16A34A', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', Icon: CheckCircle2 },
  QUESTIONABLE: { color: '#D97706', bg: 'rgba(217,119,6,0.1)', border: 'rgba(217,119,6,0.3)', Icon: AlertTriangle },
  BAD: { color: '#DC2626', bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.3)', Icon: XCircle },
}

export default function TradeReviewCard({ trade, review, reviewError, pending }: Props) {
  const isEntry = trade.pnl == null
  const pnlPositive = (trade.pnl ?? 0) >= 0

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      background: 'var(--surface)', padding: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{trade.symbol}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {trade.direction === 'SHORT' ? 'Short' : 'Long'} · {isEntry ? 'opened' : 'closed'} · {trade.shares} sh @ ${trade.price.toFixed(2)}
            </span>
          </div>
        </div>
        {!isEntry && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 13, fontWeight: 700, color: pnlPositive ? '#15803d' : '#b91c1c',
          }}>
            {pnlPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {pnlPositive ? '+' : '−'}${Math.abs(trade.pnl ?? 0).toFixed(2)}
          </div>
        )}
      </div>

      {pending && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)' }}>
          <Loader2 size={12} className="animate-spin" /> Coach is reviewing this trade…
        </div>
      )}

      {!pending && reviewError && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontStyle: 'italic' }}>
          Coach feedback unavailable for this trade.
        </div>
      )}

      {!pending && review && (() => {
        const meta = VERDICT_META[review.verdict]
        const Icon = meta.Icon
        return (
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 999, marginBottom: 8,
              background: meta.bg, border: `1px solid ${meta.border}`,
              fontSize: 11, fontWeight: 700, color: meta.color,
            }}>
              <Icon size={11} /> {review.verdict}
              {review.matched_setup_tag && review.matched_setup_tag !== 'NO_SETUP' && (
                <span style={{ fontWeight: 500, opacity: 0.85 }}>· {review.matched_setup_tag}</span>
              )}
            </div>

            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              {review.headline}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 8px' }}>
              {review.rationale}
            </p>
            {review.better_action && (
              <div style={{
                padding: '8px 10px', borderRadius: 8, marginBottom: 8,
                background: 'var(--morning)', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55,
              }}>
                <strong style={{ color: 'var(--text)' }}>Next time: </strong>{review.better_action}
              </div>
            )}
            {review.risk_note && (
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {review.risk_note}
              </div>
            )}

            {review.hindsight_verdict && (
              <div style={{
                marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)',
                fontSize: 11.5, color: 'var(--text-2)',
              }}>
                <strong style={{ color: 'var(--text)' }}>10 minutes later: </strong>
                {review.hindsight_verdict === 'LEFT_MONEY_ON_TABLE'
                  ? `price kept moving your way (${review.hindsight_pct_move != null && review.hindsight_pct_move >= 0 ? '+' : ''}${review.hindsight_pct_move?.toFixed(2)}%) — there was more on the table.`
                  : `your timing held up — price didn't keep running against your exit (${review.hindsight_pct_move != null && review.hindsight_pct_move >= 0 ? '+' : ''}${review.hindsight_pct_move?.toFixed(2)}%).`}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
