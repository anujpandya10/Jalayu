'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, BarChart3, RefreshCw } from 'lucide-react'

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface Marker {
  time: number
  action: string
  direction: string
  position: 'aboveBar' | 'belowBar'
  color: string
  shape: string
  text: string
  pnl: number | null
}

interface ScannerData {
  symbol: string
  interval: string
  asset: { symbol: string; name: string; price: number; change24h: number }
  candles: Candle[]
  markers: Marker[]
  indicators: { ema9: number | null; ema21: number | null; vwap: number | null; rsi: number | null }
  tradeCount: number
}

const POPULAR_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'MATIC']

/**
 * Candle scanner — like the TradingView screenshot.
 *   • Candlestick chart of one selected asset
 *   • Buy/sell markers from your actual trade history overlaid
 *   • EMA9 + EMA21 + VWAP lines
 *   • Latest indicators on the side
 *   • Symbol picker on top
 *
 * Uses lightweight-charts (TradingView's free MIT chart library).
 */
export default function CandleScanner() {
  const [symbol, setSymbol] = useState('BTC')
  const [data, setData] = useState<ScannerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Use unknown for chart/series refs — lightweight-charts types vary by version
  const chartRef = useRef<unknown>(null)
  const candleSeriesRef = useRef<unknown>(null)
  const ema9SeriesRef = useRef<unknown>(null)
  const ema21SeriesRef = useRef<unknown>(null)

  const fetchData = useCallback(async (sym: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/trading/scanner?symbol=${sym}&interval=1m`, { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const json = await res.json() as ScannerData
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData(symbol)
  }, [symbol, fetchData])

  // Lazy-load the chart library (client-only) and create the chart
  useEffect(() => {
    if (!containerRef.current || !data || data.candles.length === 0) return
    let disposed = false
    let chart: unknown = null

    void (async () => {
      try {
        const lib = await import('lightweight-charts')
        if (disposed || !containerRef.current) return

        // Clean up any previous chart
        if (chartRef.current) {
          ;(chartRef.current as { remove: () => void }).remove()
          chartRef.current = null
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createChart: any = (lib as any).createChart

        chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 360,
          layout: {
            background: { color: '#0d1126' },
            textColor: '#A8B0C8',
          },
          grid: {
            vertLines: { color: 'rgba(255,255,255,0.04)' },
            horzLines: { color: 'rgba(255,255,255,0.04)' },
          },
          rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
          timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, secondsVisible: false },
          crosshair: { mode: 1 },
        })
        chartRef.current = chart

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = chart as any
        // Candlestick series
        const candleSeries = c.addCandlestickSeries
          ? c.addCandlestickSeries({
              upColor: '#22C55E', downColor: '#EF4444',
              borderVisible: false,
              wickUpColor: '#22C55E', wickDownColor: '#EF4444',
            })
          : c.addSeries((lib as { CandlestickSeries: unknown }).CandlestickSeries, {
              upColor: '#22C55E', downColor: '#EF4444',
              borderVisible: false,
              wickUpColor: '#22C55E', wickDownColor: '#EF4444',
            })
        candleSeries.setData(data.candles)
        candleSeriesRef.current = candleSeries

        // EMA9 + EMA21 lines (flat — we only have current value, no history)
        if (data.indicators.ema9 != null) {
          const ema9Series = c.addLineSeries
            ? c.addLineSeries({ color: '#3B82F6', lineWidth: 1, title: 'EMA9' })
            : c.addSeries((lib as { LineSeries: unknown }).LineSeries, { color: '#3B82F6', lineWidth: 1, title: 'EMA9' })
          ema9Series.setData(
            data.candles.map((c) => ({ time: c.time, value: data.indicators.ema9 as number })),
          )
          ema9SeriesRef.current = ema9Series
        }
        if (data.indicators.ema21 != null) {
          const ema21Series = c.addLineSeries
            ? c.addLineSeries({ color: '#F59E0B', lineWidth: 1, title: 'EMA21' })
            : c.addSeries((lib as { LineSeries: unknown }).LineSeries, { color: '#F59E0B', lineWidth: 1, title: 'EMA21' })
          ema21Series.setData(
            data.candles.map((c) => ({ time: c.time, value: data.indicators.ema21 as number })),
          )
          ema21SeriesRef.current = ema21Series
        }

        // Trade markers on the candle series
        if (data.markers && data.markers.length > 0) {
          candleSeries.setMarkers(
            data.markers.map((m) => ({
              time: m.time,
              position: m.position,
              color: m.color,
              shape: m.shape,
              text: m.text,
            })),
          )
        }

        c.timeScale().fitContent()

        // Resize handler
        const handleResize = () => {
          if (containerRef.current && chartRef.current) {
            ;(chartRef.current as { applyOptions: (o: { width: number }) => void })
              .applyOptions({ width: containerRef.current.clientWidth })
          }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
      } catch (err) {
        console.error('Chart init failed', err)
      }
    })()

    return () => {
      disposed = true
      if (chartRef.current) {
        try { (chartRef.current as { remove: () => void }).remove() } catch { /* ignore */ }
        chartRef.current = null
      }
      if (chart) {
        try { (chart as { remove: () => void }).remove() } catch { /* ignore */ }
      }
    }
  }, [data])

  // Performance summary from markers
  const closedTrades = (data?.markers ?? []).filter((m) => m.pnl != null)
  const wins = closedTrades.filter((m) => (m.pnl ?? 0) > 0).length
  const losses = closedTrades.filter((m) => (m.pnl ?? 0) < 0).length
  const netPnl = closedTrades.reduce((s, m) => s + (m.pnl ?? 0), 0)

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 16,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={16} color="var(--accent)" />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Scanner
          </h3>
          {data?.asset && (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {data.asset.name} · ${data.asset.price < 1 ? data.asset.price.toFixed(4) : data.asset.price.toFixed(2)} ·{' '}
              <span style={{ color: data.asset.change24h >= 0 ? '#16A34A' : '#DC2626' }}>
                {data.asset.change24h >= 0 ? '+' : ''}{data.asset.change24h.toFixed(2)}% 24h
              </span>
            </span>
          )}
          {loading && <Loader2 size={12} className="animate-spin" color="var(--text-3)" />}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {POPULAR_SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSymbol(s)}
              style={{
                padding: '4px 8px', fontSize: 10.5, fontWeight: 500,
                background: symbol === s ? 'var(--accent)' : 'var(--surface-2)',
                color: symbol === s ? '#fff' : 'var(--text-2)',
                border: '1px solid var(--border)', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void fetchData(symbol)}
            disabled={loading}
            style={{
              padding: 5, marginLeft: 4,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center',
            }}
            title="Refresh"
          >
            <RefreshCw size={11} color="var(--text-2)" />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, fontSize: 12, color: '#EF4444' }}>{error}</div>
      )}

      {/* Chart container */}
      <div
        ref={containerRef}
        style={{
          width: '100%', height: 360,
          background: '#0d1126', borderRadius: 8,
          overflow: 'hidden',
        }}
      />

      {/* Stats + indicators */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: 8, marginTop: 12,
      }}>
        <Stat label="Trades" value={String(data?.tradeCount ?? 0)} />
        <Stat label="Wins" value={String(wins)} color="#16A34A" />
        <Stat label="Losses" value={String(losses)} color="#DC2626" />
        <Stat label="Net P&L"
          value={`${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}`}
          color={netPnl >= 0 ? '#16A34A' : '#DC2626'} />
        <Stat label="RSI" value={data?.indicators.rsi != null ? data.indicators.rsi.toFixed(1) : '—'} />
        <Stat label="EMA9 / EMA21"
          value={
            data?.indicators.ema9 != null && data?.indicators.ema21 != null
              ? `${data.indicators.ema9 > data.indicators.ema21 ? '↑ up' : '↓ down'}`
              : '—'
          }
          color={
            data?.indicators.ema9 != null && data?.indicators.ema21 != null
              ? (data.indicators.ema9 > data.indicators.ema21 ? '#16A34A' : '#DC2626')
              : undefined
          }
        />
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8 }}>
        Green markers = profitable exits · Red markers = losing exits · Arrows = entries.
        Pick another symbol above to scan it.
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '8px 10px', background: 'var(--surface-2)',
      border: '1px solid var(--border)', borderRadius: 8,
    }}>
      <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color ?? 'var(--text)', marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}
