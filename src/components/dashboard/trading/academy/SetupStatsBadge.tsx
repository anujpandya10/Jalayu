'use client'

interface BotSetupStat {
  setupTag: string
  totalTrades: number
  winRatePct: number
  avgPnl: number
}

interface Props {
  setupTag: string
  stats: BotSetupStat[] | null
}

/**
 * "64% win · 11 trades" — the auto-bot's real, forward-tested win rate for
 * one setup tag. Used in both the curriculum (chapter footer) and the order
 * ticket (before the student commits to a trade).
 */
export default function SetupStatsBadge({ setupTag, stats }: Props) {
  const stat = stats?.find((s) => s.setupTag === setupTag)

  if (!stat || stat.totalTrades === 0) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', borderRadius: 999, fontSize: 10.5,
        background: 'var(--morning)', color: 'var(--text-3)',
        border: '1px solid var(--border)',
      }}>
        {setupTag} · no real trades yet
      </span>
    )
  }

  const positive = stat.winRatePct >= 50
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 600,
      background: positive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
      color: positive ? '#15803d' : '#b91c1c',
      border: `1px solid ${positive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`,
    }}>
      {setupTag}: {stat.winRatePct.toFixed(0)}% win · {stat.totalTrades} real trade{stat.totalTrades === 1 ? '' : 's'}
    </span>
  )
}
