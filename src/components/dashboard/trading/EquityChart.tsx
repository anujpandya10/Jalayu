'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react'

interface SeriesPoint {
  time: number
  equity: number
  pnl: number
  symbol: string
}

interface EquityData {
  seed: number
  series: SeriesPoint[]
  summary: {
    finalEquity: number
    totalPnl: number
    totalTrades: number
    wins: number
    losses: number
    winRate: number
    bestTrade: { symbol: string; pnl: number } | null
    worstTrade: { symbol: string; pnl: number } | null
  }
}

export default function EquityChart() {
  const [data, setData] = useState<EquityData | null>(null)
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/equity', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json() as EquityData
      setData(json)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Render chart
  useEffect(() => {
    if (!containerRef.current || !data || data.series.length === 0) return
    let disposed = false

    void (async () => {
      try {
        const lib = await import('lightweight-charts')
        if (disposed || !containerRef.current) return

        if (chartRef.current) {
          chartRef.current.remove()
          chartRef.current = null
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createChart: any = (lib as any).createChart
        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 220,
          layout: { background: { color: 'transparent' }, textColor: '#78716C' },
          grid: {
            vertLines: { color: 'rgba(0,0,0,0.04)' },
            horzLines: { color: 'rgba(0,0,0,0.04)' },
          },
          rightPriceScale: { borderColor: 'rgba(0,0,0,0.1)' },
          timeScale: { borderColor: 'rgba(0,0,0,0.1)', timeVisible: false, secondsVisible: false },
          crosshair: { mode: 1 },
        })
        chartRef.current = chart

        const positive = data.summary.totalPnl >= 0
        const lineColor = positive ? '#16A34A' : '#DC2626'
        const areaTop = positive ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'
        const areaBot = positive ? 'rgba(34,197,94,0)' : 'rgba(239,68,68,0)'

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = chart as any
        const series = c.addAreaSeries
          ? c.addAreaSeries({
              lineColor, topColor: areaTop, bottomColor: areaBot, lineWidth: 2,
            })
          : c.addSeries((lib as { AreaSeries: unknown }).AreaSeries, {
              lineColor, topColor: areaTop, bottomColor: areaBot, lineWidth: 2,
            })

        series.setData(
          data.series.map((s) => ({ time: s.time, value: s.equity })),
        )

        // Seed line (the starting $500)
        const seedSeries = c.addLineSeries
          ? c.addLineSeries({ color: 'rgba(120,113,108,0.5)', lineWidth: 1, lineStyle: 2, title: 'Seed' })
          : c.addSeries((lib as { LineSeries: unknown }).LineSeries, { color: 'rgba(120,113,108,0.5)', lineWidth: 1, lineStyle: 2 })
        seedSeries.setData(
          data.series.map((s) => ({ time: s.time, value: data.seed })),
        )

        c.timeScale().fitContent()

        const handleResize = () => {
          if (containerRef.current && chartRef.current) {
            chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
          }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
      } catch (err) {
        console.error('Equity chart failed', err)
      }
    })()

    return () => {
      disposed = true
      if (chartRef.current) {
        try { chartRef.current.remove() } catch { /* ignore */ }
        chartRef.current = null
      }
    }
  }, [data])

  const summary = data?.summary
  const positive = (summary?.totalPnl ?? 0) >= 0

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {positive ? <TrendingUp size={16} color="#16A34A" /> : <TrendingDown size={16} color="#DC2626" />}
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Your trading journey
          </h3>
          {loading && <Loader2 size={12} className="animate-spin" color="var(--text-3)" />}
        </div>
        {summary && (
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-3)', flexWrap: 'wrap' }}>
            <span>Started ${data?.seed.toFixed(2)}</span>
            <span>·</span>
            <span style={{ color: positive ? '#16A34A' : '#DC2626', fontWeight: 600 }}>
              Now ${summary.finalEquity.toFixed(2)} ({summary.totalPnl >= 0 ? '+' : ''}${summary.totalPnl.toFixed(2)})
            </span>
            <span>·</span>
            <span>{summary.totalTrades} trades · {Math.round(summary.winRate * 100)}% win rate</span>
          </div>
        )}
      </div>

      <div ref={containerRef} style={{ width: '100%', height: 220 }} />

      {summary && summary.totalTrades > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 11, color: 'var(--text-3)', flexWrap: 'wrap' }}>
          {summary.bestTrade && (
            <span>🏆 Best: <strong style={{ color: '#16A34A' }}>{summary.bestTrade.symbol}</strong> +${summary.bestTrade.pnl.toFixed(2)}</span>
          )}
          {summary.worstTrade && (
            <span>📉 Worst: <strong style={{ color: '#DC2626' }}>{summary.worstTrade.symbol}</strong> {summary.worstTrade.pnl >= 0 ? '+' : ''}${summary.worstTrade.pnl.toFixed(2)}</span>
          )}
          <span>✅ {summary.wins} wins · ❌ {summary.losses} losses</span>
        </div>
      )}
    </div>
  )
}
