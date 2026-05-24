'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck, Target, TrendingUp, TrendingDown, MinusCircle, AlertTriangle, Cpu } from 'lucide-react'

interface ApexResponse {
  symbol: string
  name: string
  currentPrice: number
  decision: {
    decision: 'BUY' | 'SELL' | 'HOLD'
    conviction_score: number
    rationale: string
    risk_parameters: {
      suggested_position_size_pct: number
      stop_loss_target: number
      take_profit_target: number
    }
  }
  rrRatio: number | null
  drawdownActive: boolean
  drawdownPct: number
  generatedAt: string
}

interface Props {
  /** Symbol to evaluate. If not set, user picks via the dropdown. */
  symbol?: string
}

/**
 * Apex — request an institutional-grade evaluation of any asset.
 *
 * Click "Get Apex's read" → Claude (acting as Apex) analyzes the asset
 * using fresh indicators + drawdown protocol and returns a structured
 * decision: BUY/SELL/HOLD with conviction score, rationale, and risk
 * parameters (position size, stop loss, take profit, R/R ratio).
 */
export default function ApexTake({ symbol: defaultSymbol = 'BTC' }: Props) {
  const [symbol, setSymbol] = useState(defaultSymbol)
  const [data, setData] = useState<ApexResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const request = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/trading/apex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      setData(json as ApexResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const decisionMeta = (d: 'BUY' | 'SELL' | 'HOLD') => {
    if (d === 'BUY')  return { icon: TrendingUp,  color: '#16A34A', label: 'BUY',  bg: 'rgba(34,197,94,0.12)' }
    if (d === 'SELL') return { icon: TrendingDown, color: '#DC2626', label: 'SELL', bg: 'rgba(239,68,68,0.12)' }
    return { icon: MinusCircle, color: '#78716C', label: 'HOLD', bg: 'rgba(120,113,108,0.12)' }
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f33 100%)',
      borderRadius: 14,
      padding: 18,
      color: '#fff',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -50, right: -50,
        width: 220, height: 220, borderRadius: '50%',
        background: 'rgba(56,189,248,0.12)', filter: 'blur(60px)', pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #06B6D4, #3B82F6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
            }}>
              <Cpu size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
                Apex
              </h3>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>
                Institutional-grade quantitative intelligence
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, 8))}
              placeholder="BTC"
              style={{
                width: 80, padding: '6px 10px', fontSize: 12, fontWeight: 600,
                background: 'rgba(255,255,255,0.1)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 7,
                outline: 'none', fontFamily: 'inherit', textTransform: 'uppercase',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') void request() }}
            />
            <button
              type="button"
              onClick={request}
              disabled={loading || !symbol}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                background: 'linear-gradient(135deg, #06B6D4, #3B82F6)',
                color: '#fff', border: 'none', borderRadius: 7,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
                fontFamily: 'inherit',
              }}
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
              {loading ? 'Analyzing…' : 'Get Apex\'s read'}
            </button>
          </div>
        </div>

        {/* Drawdown indicator */}
        {data?.drawdownActive && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', marginBottom: 12,
            background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 7, fontSize: 11, color: '#FCD34D',
          }}>
            <AlertTriangle size={11} />
            Drawdown protocol active ({data.drawdownPct.toFixed(2)}% from seed). Apex requires
            conviction ≥ 8.5/10 and reduces size by 50%.
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: 12, background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
            fontSize: 12, color: '#FCA5A5',
          }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!data && !loading && !error && (
          <div style={{
            padding: '20px 12px', textAlign: 'center',
            fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6,
          }}>
            Pick a symbol above and click <strong>Get Apex&apos;s read</strong> for an
            institutional-grade evaluation: BUY/SELL/HOLD with conviction score, statistical
            rationale, and exact stop-loss / take-profit prices.
            <br />
            <span style={{ fontSize: 11, opacity: 0.8 }}>
              Capital preservation first. 1:2 R/R minimum. No noise. No gambling.
            </span>
          </div>
        )}

        {/* Decision render */}
        {data && (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14,
              alignItems: 'center', marginBottom: 14,
            }}>
              {/* Decision pill */}
              {(() => {
                const m = decisionMeta(data.decision.decision)
                const Icon = m.icon
                return (
                  <div style={{
                    padding: '10px 14px',
                    background: m.bg, border: `1.5px solid ${m.color}`,
                    borderRadius: 12,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <Icon size={16} color={m.color} />
                    <span style={{ fontSize: 16, fontWeight: 700, color: m.color, letterSpacing: '0.04em' }}>
                      {m.label}
                    </span>
                  </div>
                )
              })()}

              {/* Symbol + price */}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {data.symbol} <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 400, fontSize: 11 }}>{data.name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                  Current: ${data.currentPrice < 1 ? data.currentPrice.toFixed(4) : data.currentPrice.toFixed(2)}
                </div>
              </div>

              {/* Conviction meter */}
              <div style={{ textAlign: 'right', minWidth: 110 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Conviction
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
                    {data.decision.conviction_score.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>/10</span>
                </div>
                {/* Bar */}
                <div style={{
                  width: 100, height: 4, marginLeft: 'auto', marginTop: 3,
                  background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${(data.decision.conviction_score / 10) * 100}%`, height: '100%',
                    background: data.decision.conviction_score >= 8.5 ? '#16A34A'
                      : data.decision.conviction_score >= 6 ? '#F59E0B' : '#DC2626',
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            </div>

            {/* Rationale */}
            <div style={{
              padding: 12, marginBottom: 12,
              background: 'rgba(255,255,255,0.05)', borderRadius: 8,
              fontSize: 12.5, color: 'rgba(255,255,255,0.92)', lineHeight: 1.6,
            }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                Statistical edge
              </div>
              {data.decision.rationale}
            </div>

            {/* Risk parameters (only show meaningful values for BUY/SELL) */}
            {data.decision.decision !== 'HOLD' && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8,
              }}>
                <RiskCard
                  icon={Target} label="Position size"
                  value={`${(data.decision.risk_parameters.suggested_position_size_pct * 100).toFixed(1)}%`}
                  sub="of equity"
                />
                <RiskCard
                  icon={TrendingDown} label="Stop loss"
                  value={`$${data.decision.risk_parameters.stop_loss_target.toFixed(data.currentPrice < 1 ? 6 : 2)}`}
                  sub={`${(((data.decision.risk_parameters.stop_loss_target - data.currentPrice) / data.currentPrice) * 100).toFixed(2)}%`}
                  subColor="#FCA5A5"
                />
                <RiskCard
                  icon={TrendingUp} label="Take profit"
                  value={`$${data.decision.risk_parameters.take_profit_target.toFixed(data.currentPrice < 1 ? 6 : 2)}`}
                  sub={`${(((data.decision.risk_parameters.take_profit_target - data.currentPrice) / data.currentPrice) * 100).toFixed(2)}%`}
                  subColor="#86EFAC"
                />
                {data.rrRatio != null && (
                  <RiskCard
                    icon={ShieldCheck} label="R/R ratio"
                    value={`1:${data.rrRatio.toFixed(2)}`}
                    sub={data.rrRatio >= 2 ? '✓ meets minimum' : '⚠ below 1:2'}
                    subColor={data.rrRatio >= 2 ? '#86EFAC' : '#FCA5A5'}
                  />
                )}
              </div>
            )}

            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 10, textAlign: 'right' }}>
              Generated {new Date(data.generatedAt).toLocaleTimeString()}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RiskCard({
  icon: Icon, label, value, sub, subColor,
}: {
  icon: typeof Target
  label: string
  value: string
  sub?: string
  subColor?: string
}) {
  return (
    <div style={{
      padding: 10,
      background: 'rgba(255,255,255,0.07)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <Icon size={10} color="rgba(255,255,255,0.55)" />
        <span style={{ fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 10, color: subColor ?? 'rgba(255,255,255,0.5)', marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  )
}
