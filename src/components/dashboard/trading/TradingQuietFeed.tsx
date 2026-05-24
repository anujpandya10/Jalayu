'use client'

import { useRef, useEffect } from 'react'
import { isSignificantEvent, type TickEventLike } from '@/lib/trading-page-insights'

interface ActivityItem {
  id: number
  event: TickEventLike & {
    name?: string
    price?: number
    direction?: string
    shares?: number
    total?: number
    pnl?: number
  }
}

function fmtMoney(n: number): string {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export default function TradingQuietFeed({
  items,
  scanning,
  emptyMessage = 'No trades yet. When the engine acts, it will show here.',
}: {
  items: ActivityItem[]
  scanning?: boolean
  emptyMessage?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const significant = items.filter(({ event }) => isSignificantEvent(event)).slice(0, 12)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0
  }, [significant.length])

  return (
    <div
      ref={ref}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxHeight: 280,
        overflowY: 'auto',
      }}
    >
      {scanning && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '4px 0' }}>
          Checking market…
        </div>
      )}
      {significant.length === 0 && !scanning && (
        <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5, padding: '8px 0' }}>
          {emptyMessage}
        </div>
      )}
      {significant.map(({ id, event }) => {
        const isVeto = event.reason.includes('🛡️ Apex veto')
        const isExit = event.type === 'LONG_SELL' || event.type === 'SHORT_COVER'
        const isEntry = event.type === 'LONG_BUY' || event.type === 'SHORT_OPEN'
        const pnl = event.pnl ?? 0
        const pnlPos = pnl >= 0

        let title = event.symbol || '—'
        let subtitle = event.reason.replace('🛡️ Apex veto: ', '')
        if (isEntry) title = `${event.type === 'SHORT_OPEN' ? 'Short' : 'Long'} ${event.symbol}`
        if (isExit) title = `Closed ${event.symbol}`
        if (isVeto) title = `Veto · ${event.symbol}`

        return (
          <div
            key={id}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--morning)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>{timeAgo(event.ts)}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>{subtitle}</div>
            {isExit && event.pnl != null && (
              <div style={{
                marginTop: 6, fontSize: 12, fontWeight: 600,
                color: pnlPos ? '#15803d' : '#b91c1c',
              }}>
                {pnlPos ? '+' : '−'}{fmtMoney(Math.abs(pnl))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
