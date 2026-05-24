'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, History, TrendingUp, TrendingDown, MinusCircle,
  Cpu, AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react'

interface Decision {
  id: string
  symbol: string
  asset_type: string
  current_price: number
  ema9: number | null
  ema21: number | null
  vwap_dev_pct: number | null
  atr_pct: number | null
  regime: string | null
  rsi_1m: number | null
  rsi_15m: number | null
  vol_spike: number | null
  equity_at_decision: number
  drawdown_pct: number | null
  drawdown_active: boolean
  decision: 'BUY' | 'SELL' | 'HOLD'
  conviction_score: number
  rationale: string
  suggested_position_size_pct: number | null
  stop_loss_target: number | null
  take_profit_target: number | null
  rr_ratio: number | null
  engine_score_at_decision: number | null
  engine_setup_at_decision: string | null
  created_at: string
  outcome: { pnl: number; pct: number; reason: string; closedAt: string } | null
  conviction_bucket: string
  rsi_alignment: string
  vol_bucket: string
  agreement_bucket: string
}

interface EvBucket { bucket: string; trades: number; winRate: number; avgPnlPct: number; sumPnl: number }
interface HistoryResponse {
  decisions: Decision[]
  ev: {
    byConviction: EvBucket[]
    byRsiAlignment: EvBucket[]
    byRegime: EvBucket[]
    byVolSpike: EvBucket[]
    byAgreement: EvBucket[]
  }
  totals: {
    decisionsLogged: number
    actedOnCount: number
    avgConviction: number
    decisionMix: { BUY: number; SELL: number; HOLD: number }
    overallWinRate: number
    overallAvgPnlPct: number
  }
}

const DEC_COLOR: Record<string, string> = { BUY: '#16A34A', SELL: '#DC2626', HOLD: '#78716C' }

export default function ApexHistory() {
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'BUY' | 'SELL' | 'HOLD'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tab, setTab] = useState<'history' | 'ev'>('history')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = filter === 'all' ? '' : `?decision=${filter}`
      const res = await fetch(`/api/trading/apex/history${q}`, { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { void load() }, [load])

  const decisions = data?.decisions ?? []

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={16} color="var(--accent)" />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Apex history & EV
          </h3>
          {loading && <Loader2 size={12} className="animate-spin" color="var(--text-3)" />}
        </div>
        {data && (
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {data.totals.decisionsLogged} decisions ·{' '}
            {data.totals.actedOnCount} acted on ·{' '}
            avg conviction {data.totals.avgConviction.toFixed(1)}/10
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
        {(['history', 'ev'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 500,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--accent)' : 'var(--text-3)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, fontFamily: 'inherit',
            }}
          >
            {t === 'history' ? `Decisions (${decisions.length})` : 'EV breakdowns'}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: 12, fontSize: 12, color: '#DC2626',
          background: 'rgba(239,68,68,0.08)', borderRadius: 8,
          border: '1px solid rgba(239,68,68,0.2)', marginBottom: 12,
        }}>
          {error.includes('relation') || error.includes('does not exist')
            ? 'Apex decisions table not provisioned yet. Apply migration 022 in Supabase SQL editor.'
            : error}
        </div>
      )}

      {/* HISTORY TAB ─────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <>
          {/* Decision filter pills */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['all', 'BUY', 'SELL', 'HOLD'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  padding: '4px 9px', fontSize: 10.5, fontWeight: 500,
                  background: filter === f ? 'var(--accent)' : 'var(--surface-2)',
                  color: filter === f ? '#fff' : 'var(--text-2)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {decisions.length === 0 && !loading && !error && (
            <div style={{
              padding: 20, textAlign: 'center',
              fontSize: 12, color: 'var(--text-3)',
              background: 'var(--morning)', borderRadius: 8,
            }}>
              No Apex decisions yet. Call <strong>Get Apex&apos;s read</strong> on any asset above
              — every evaluation gets logged here with indicator snapshot, conviction, and
              correlation to any matching paper trade in the 60 min after.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {decisions.map((d) => {
              const isOpen = expanded === d.id
              const color = DEC_COLOR[d.decision]
              const Icon = d.decision === 'BUY' ? TrendingUp
                : d.decision === 'SELL' ? TrendingDown : MinusCircle
              return (
                <div key={d.id} style={{
                  border: '1px solid var(--border)', borderRadius: 8,
                  overflow: 'hidden',
                }}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : d.id)}
                    style={{
                      width: '100%', padding: '8px 10px',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto auto',
                      gap: 10, alignItems: 'center', fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    {isOpen ? <ChevronDown size={11} color="var(--text-3)" /> : <ChevronRight size={11} color="var(--text-3)" />}
                    <div style={{
                      padding: '2px 8px', borderRadius: 5,
                      background: `${color}18`, color, fontSize: 10, fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                      <Icon size={9} /> {d.decision}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                      {d.symbol}
                      <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-3)', fontWeight: 400 }}>
                        ${d.current_price < 1 ? d.current_price.toFixed(4) : d.current_price.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                      conv {d.conviction_score.toFixed(1)}/10
                    </div>
                    {d.outcome ? (
                      <div style={{
                        fontSize: 11, fontWeight: 600,
                        color: d.outcome.pnl >= 0 ? '#16A34A' : '#DC2626',
                      }}>
                        {d.outcome.pnl >= 0 ? '+' : ''}${d.outcome.pnl.toFixed(2)} ({d.outcome.pct >= 0 ? '+' : ''}{d.outcome.pct.toFixed(2)}%)
                      </div>
                    ) : (
                      <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>—</div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      {new Date(d.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </button>

                  {isOpen && (
                    <div style={{
                      padding: 12, borderTop: '1px solid var(--border)',
                      background: 'var(--morning)',
                    }}>
                      {d.drawdown_active && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          fontSize: 11, color: '#92400e', marginBottom: 8,
                        }}>
                          <AlertTriangle size={10} /> drawdown protocol active ({d.drawdown_pct?.toFixed(2)}%)
                        </div>
                      )}

                      <div style={{ fontSize: 11.5, color: 'var(--text)', marginBottom: 10, fontStyle: 'italic' }}>
                        &ldquo;{d.rationale}&rdquo;
                      </div>

                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6,
                        fontSize: 11,
                      }}>
                        <DataField label="RSI-1m"   value={d.rsi_1m?.toFixed(1)} />
                        <DataField label="RSI-15m"  value={d.rsi_15m?.toFixed(1)} />
                        <DataField label="Vol spike" value={d.vol_spike != null ? `${d.vol_spike.toFixed(2)}×` : null} />
                        <DataField label="VWAP dev" value={d.vwap_dev_pct != null ? `${d.vwap_dev_pct >= 0 ? '+' : ''}${d.vwap_dev_pct.toFixed(2)}%` : null} />
                        <DataField label="ATR%"     value={d.atr_pct?.toFixed(2)} />
                        <DataField label="Regime"   value={d.regime} />
                        <DataField label="EMA9/21"
                          value={d.ema9 != null && d.ema21 != null
                            ? (d.ema9 > d.ema21 ? '↑ bull' : '↓ bear') : null}
                        />
                        <DataField label="R/R" value={d.rr_ratio != null ? `1:${d.rr_ratio.toFixed(2)}` : null} />
                      </div>

                      {d.decision !== 'HOLD' && (d.stop_loss_target || d.take_profit_target) && (
                        <div style={{
                          marginTop: 10, padding: 8,
                          background: 'var(--surface)', borderRadius: 6,
                          fontSize: 10.5, color: 'var(--text-2)',
                          display: 'flex', gap: 12, flexWrap: 'wrap',
                        }}>
                          <span>Position: <strong>{((d.suggested_position_size_pct ?? 0) * 100).toFixed(1)}%</strong></span>
                          <span>SL: <strong>${d.stop_loss_target?.toFixed(d.current_price < 1 ? 6 : 2)}</strong></span>
                          <span>TP: <strong>${d.take_profit_target?.toFixed(d.current_price < 1 ? 6 : 2)}</strong></span>
                        </div>
                      )}

                      <div style={{
                        marginTop: 8, fontSize: 10, color: 'var(--text-3)',
                        display: 'flex', gap: 10, flexWrap: 'wrap',
                      }}>
                        {d.engine_score_at_decision != null && (
                          <>
                            <span>Engine: <strong>{Number(d.engine_score_at_decision).toFixed(1)}</strong> [{d.engine_setup_at_decision ?? '—'}]</span>
                            <span>·</span>
                          </>
                        )}
                        <span>Tag: {d.conviction_bucket}</span>
                        <span>·</span>
                        <span>{d.agreement_bucket}</span>
                        <span>·</span>
                        <span>{d.rsi_alignment}</span>
                      </div>

                      {d.outcome && (
                        <div style={{
                          marginTop: 10, padding: 8,
                          background: d.outcome.pnl >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                          border: `1px solid ${d.outcome.pnl >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                          borderRadius: 6, fontSize: 10.5,
                        }}>
                          Outcome: <strong>{d.outcome.pnl >= 0 ? '+' : ''}${d.outcome.pnl.toFixed(2)}</strong>
                          {' '}({d.outcome.pct >= 0 ? '+' : ''}{d.outcome.pct.toFixed(2)}%)
                          {' — '}{d.outcome.reason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* EV BREAKDOWNS TAB ───────────────────────────────────────────────── */}
      {tab === 'ev' && data && (
        <>
          {data.totals.actedOnCount === 0 ? (
            <div style={{
              padding: 20, textAlign: 'center',
              fontSize: 12, color: 'var(--text-3)',
              background: 'var(--morning)', borderRadius: 8,
            }}>
              No outcomes correlated yet. EV requires Apex decisions paired with paper trades
              that fired within 60 minutes after on the same symbol. Run more evaluations and
              let the engine work in parallel.
            </div>
          ) : (
            <>
              <div style={{
                padding: 12, marginBottom: 14,
                background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(59,130,246,0.08))',
                border: '1px solid var(--border)', borderRadius: 8,
              }}>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 4 }}>
                  ACROSS ALL {data.totals.actedOnCount} CORRELATED OUTCOMES
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5 }}>
                  <span>Win rate: <strong style={{
                    color: data.totals.overallWinRate >= 0.5 ? '#16A34A' : '#DC2626',
                  }}>{(data.totals.overallWinRate * 100).toFixed(1)}%</strong></span>
                  <span>Avg PnL: <strong style={{
                    color: data.totals.overallAvgPnlPct >= 0 ? '#16A34A' : '#DC2626',
                  }}>{data.totals.overallAvgPnlPct >= 0 ? '+' : ''}{data.totals.overallAvgPnlPct.toFixed(2)}%</strong></span>
                </div>
              </div>

              <EvBlock title="By conviction bucket" buckets={data.ev.byConviction} />
              <EvBlock title="By RSI alignment (multi-timeframe)" buckets={data.ev.byRsiAlignment} />
              <EvBlock title="By volatility regime" buckets={data.ev.byRegime} />
              <EvBlock title="By volume spike" buckets={data.ev.byVolSpike} />
              <EvBlock title="Engine vs Apex agreement" buckets={data.ev.byAgreement ?? []} />
            </>
          )}
        </>
      )}
    </div>
  )
}

function DataField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div style={{
      padding: '5px 8px', background: 'var(--surface)', borderRadius: 5,
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text)', marginTop: 1, fontWeight: 500 }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

function EvBlock({ title, buckets }: { title: string; buckets: EvBucket[] }) {
  if (buckets.length === 0) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
      }}>
        {title}
      </div>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
      }}>
        {buckets.map((b, i) => {
          const pnlPos = b.avgPnlPct >= 0
          return (
            <div key={b.bucket} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto auto',
              gap: 12, alignItems: 'center',
              padding: '8px 10px',
              borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
              background: i % 2 === 0 ? 'transparent' : 'var(--surface-2, var(--surface))',
            }}>
              <span style={{ fontSize: 11.5, color: 'var(--text)' }}>{b.bucket}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{b.trades} trades</span>
              <span style={{ fontSize: 11, color: b.winRate >= 0.5 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
                {(b.winRate * 100).toFixed(0)}% win
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: pnlPos ? '#16A34A' : '#DC2626',
                minWidth: 70, textAlign: 'right',
              }}>
                {pnlPos ? '+' : ''}{b.avgPnlPct.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Tiny unused-import suppression to keep the file lint-clean if Cpu unused
void Cpu
