'use client'

import { RotateCcw, Loader2, AlertTriangle } from 'lucide-react'

export interface Account {
  cash: number
  equity: number
  buyingPower: number
  dayTradeBuyingPower: number
  openPnl: number
  realizedToday: number
  totalPnl: number
  seed: number
  dayTradesUsed: number
  pdtRestricted: boolean
  marginCall: boolean
  openPositions: number
}

interface Props {
  account: Account | null
  fallbackEquity: number
  seed: number
  onReset: () => void
  resetting: boolean
}

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function AccountSummary({ account, fallbackEquity, seed, onReset, resetting }: Props) {
  const equity = account?.equity ?? fallbackEquity
  const totalPnl = account?.totalPnl ?? equity - seed
  const positive = totalPnl >= 0
  const dtUsed = account?.dayTradesUsed ?? 0

  return (
    <div style={{ padding: '18px 20px', borderRadius: 14, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Net account value</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{money(equity)}</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, color: positive ? '#15803d' : '#b91c1c' }}>
            {positive ? '+' : '−'}{money(Math.abs(totalPnl)).replace('$', '$')} ({positive ? '+' : ''}{seed ? ((totalPnl / seed) * 100).toFixed(2) : '0.00'}%) total
          </div>
        </div>
        <button type="button" onClick={onReset} disabled={resetting}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)', cursor: resetting ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          {resetting ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Reset
        </button>
      </div>

      {(account?.pdtRestricted || account?.marginCall) && (
        <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, background: 'rgba(254,226,226,0.5)', border: '1px solid #fecaca', fontSize: 11.5, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.5 }}>
          <AlertTriangle size={13} />
          {account.marginCall
            ? 'Margin call — your equity is below the 25% maintenance requirement. Close some exposure.'
            : `Pattern Day Trader restriction — ${dtUsed} day trades used in 5 sessions under $25k. Close-only until it clears.`}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <Metric label="Buying power" value={money(account?.buyingPower ?? equity)} />
        <Metric label="Day-trade BP" value={money(account?.dayTradeBuyingPower ?? equity)} />
        <Metric label="Cash" value={money(account?.cash ?? equity)} sub={(account?.cash ?? 0) < 0 ? 'margin loan' : undefined} subColor={(account?.cash ?? 0) < 0 ? '#b91c1c' : undefined} />
        <Metric label="Open P&L" value={money(account?.openPnl ?? 0)} valueColor={(account?.openPnl ?? 0) >= 0 ? '#15803d' : '#b91c1c'} />
        <Metric label="Realized today" value={money(account?.realizedToday ?? 0)} valueColor={(account?.realizedToday ?? 0) >= 0 ? '#15803d' : '#b91c1c'} />
        <Metric label="Day trades" value={`${dtUsed} / 3`} valueColor={dtUsed >= 3 ? '#b91c1c' : 'var(--text)'} sub="5 sessions" />
      </div>
    </div>
  )
}

function Metric({ label, value, sub, valueColor, subColor }: { label: string; value: string; sub?: string; valueColor?: string; subColor?: string }) {
  return (
    <div style={{ padding: '9px 11px', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: valueColor ?? 'var(--text)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: subColor ?? 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}
