'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Loader2, RefreshCw, Pencil, Eraser } from 'lucide-react'
import { emaArray, vwapArray, bollingerArray, rsiArray, macdArray, type Bar } from '@/lib/chart-indicators'
import IndicatorPane, { type PaneLine } from './IndicatorPane'

interface CandlesResponse {
  symbol: string
  interval: string
  asset: { symbol: string; name: string; price: number; change24h: number }
  candles: Bar[]
}

type Overlay = 'ema9' | 'ema21' | 'ema50' | 'vwap' | 'bb'
const INTERVALS: { id: string; label: string }[] = [
  { id: '1m', label: '1m' }, { id: '5m', label: '5m' }, { id: '15m', label: '15m' }, { id: '1d', label: '1D' },
]
const OVERLAY_META: { id: Overlay; label: string; color: string }[] = [
  { id: 'ema9', label: 'EMA 9', color: '#3B82F6' },
  { id: 'ema21', label: 'EMA 21', color: '#F59E0B' },
  { id: 'ema50', label: 'EMA 50', color: '#A855F7' },
  { id: 'vwap', label: 'VWAP', color: '#22D3EE' },
  { id: 'bb', label: 'Bollinger', color: '#94A3B8' },
]
const QUICK = ['AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'AMD', 'MSFT', 'AMZN']

function toLine(times: number[], arr: (number | null)[]): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = []
  for (let i = 0; i < arr.length; i++) if (arr[i] != null) out.push({ time: times[i], value: arr[i] as number })
  return out
}

interface Props {
  defaultSymbol?: string
}

export default function TradingChart({ defaultSymbol = 'AAPL' }: Props) {
  const [symbolInput, setSymbolInput] = useState(defaultSymbol)
  const [symbol, setSymbol] = useState(defaultSymbol)
  const [interval, setInterval] = useState('5m')
  const [data, setData] = useState<CandlesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [overlays, setOverlays] = useState<Record<Overlay, boolean>>({
    ema9: true, ema21: true, ema50: false, vwap: true, bb: false,
  })
  const [showRsi, setShowRsi] = useState(true)
  const [showMacd, setShowMacd] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [lines, setLines] = useState<number[]>([])

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<unknown>(null)
  const candleSeriesRef = useRef<unknown>(null)
  const priceLineHandlesRef = useRef<unknown[]>([])
  const drawModeRef = useRef(drawMode)
  drawModeRef.current = drawMode

  const fetchData = useCallback(async (sym: string, iv: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/academy/candles?symbol=${encodeURIComponent(sym)}&interval=${iv}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json as CandlesResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chart')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData(symbol, interval) }, [symbol, interval, fetchData])

  // Pre-compute indicator series from candles
  const series = useMemo(() => {
    if (!data || data.candles.length === 0) return null
    const candles = data.candles
    const times = candles.map((c) => c.time)
    const closes = candles.map((c) => c.close)
    const bb = bollingerArray(closes)
    const macd = macdArray(closes)
    return {
      times,
      ema9: toLine(times, emaArray(closes, 9)),
      ema21: toLine(times, emaArray(closes, 21)),
      ema50: toLine(times, emaArray(closes, 50)),
      vwap: toLine(times, vwapArray(candles)),
      bbUpper: toLine(times, bb.map((b) => (b ? b.upper : null))),
      bbMid: toLine(times, bb.map((b) => (b ? b.middle : null))),
      bbLower: toLine(times, bb.map((b) => (b ? b.lower : null))),
      rsi: toLine(times, rsiArray(closes)),
      macdLine: toLine(times, macd.map((m) => (m ? m.macd : null))),
      macdSignal: toLine(times, macd.map((m) => (m ? m.signal : null))),
      macdHist: macd.map((m, i) => (m ? { time: times[i], value: m.hist, color: m.hist >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)' } : null))
        .filter(Boolean) as { time: number; value: number; color: string }[],
    }
  }, [data])

  // Build the main candlestick chart + overlays
  useEffect(() => {
    if (!containerRef.current || !data || !series || data.candles.length === 0) return
    let disposed = false

    void (async () => {
      try {
        const lib = await import('lightweight-charts')
        if (disposed || !containerRef.current) return
        if (chartRef.current) {
          ;(chartRef.current as { remove: () => void }).remove()
          chartRef.current = null
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createChart: any = (lib as any).createChart
        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 380,
          layout: { background: { color: '#0d1126' }, textColor: '#A8B0C8' },
          grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
          rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
          timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, secondsVisible: false },
          crosshair: { mode: 1 },
        })
        chartRef.current = chart
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = chart as any

        const candleSeries = c.addCandlestickSeries
          ? c.addCandlestickSeries({ upColor: '#22C55E', downColor: '#EF4444', borderVisible: false, wickUpColor: '#22C55E', wickDownColor: '#EF4444' })
          : c.addSeries((lib as { CandlestickSeries: unknown }).CandlestickSeries, { upColor: '#22C55E', downColor: '#EF4444', borderVisible: false, wickUpColor: '#22C55E', wickDownColor: '#EF4444' })
        candleSeries.setData(data.candles)
        candleSeriesRef.current = candleSeries
        priceLineHandlesRef.current = []

        const addLine = (lineData: { time: number; value: number }[], color: string, width = 1) => {
          if (lineData.length === 0) return
          const s = c.addLineSeries
            ? c.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false })
            : c.addSeries((lib as { LineSeries: unknown }).LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false })
          s.setData(lineData)
        }

        if (overlays.ema9) addLine(series.ema9, '#3B82F6')
        if (overlays.ema21) addLine(series.ema21, '#F59E0B')
        if (overlays.ema50) addLine(series.ema50, '#A855F7')
        if (overlays.vwap) addLine(series.vwap, '#22D3EE', 2)
        if (overlays.bb) {
          addLine(series.bbUpper, 'rgba(148,163,184,0.7)')
          addLine(series.bbMid, 'rgba(148,163,184,0.4)')
          addLine(series.bbLower, 'rgba(148,163,184,0.7)')
        }

        // Re-apply any drawn horizontal lines
        for (const price of lines) {
          const h = candleSeries.createPriceLine({ price, color: '#FBBF24', lineWidth: 1, lineStyle: 0, axisLabelVisible: true })
          priceLineHandlesRef.current.push(h)
        }

        // Click-to-draw a horizontal line at the clicked price
        chart.subscribeClick((param: { point?: { y: number } }) => {
          if (!drawModeRef.current || !param.point) return
          const price = candleSeries.coordinateToPrice(param.point.y)
          if (price == null) return
          const rounded = Math.round(price * 100) / 100
          setLines((prev) => (prev.includes(rounded) ? prev : [...prev, rounded]))
        })

        c.timeScale().fitContent()
        const onResize = () => {
          if (containerRef.current && chartRef.current) {
            ;(chartRef.current as { applyOptions: (o: { width: number }) => void }).applyOptions({ width: containerRef.current.clientWidth })
          }
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      } catch (err) {
        console.error('Cockpit chart failed', err)
        setError('Chart failed to render')
      }
    })()

    return () => {
      disposed = true
      if (chartRef.current) {
        try { (chartRef.current as { remove: () => void }).remove() } catch { /* ignore */ }
        chartRef.current = null
      }
    }
  }, [data, series, overlays, lines])

  const rsiLines: PaneLine[] = series ? [{ data: series.rsi, color: '#E879F9', lineWidth: 1 }] : []
  const macdLines: PaneLine[] = series ? [
    { data: series.macdLine, color: '#3B82F6', lineWidth: 1 },
    { data: series.macdSignal, color: '#F59E0B', lineWidth: 1 },
  ] : []

  const submitSymbol = () => {
    const s = symbolInput.toUpperCase().trim()
    if (s) setSymbol(s)
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
      {/* Header: symbol + interval + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text" value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase().slice(0, 10))}
            onKeyDown={(e) => { if (e.key === 'Enter') submitSymbol() }}
            style={{ width: 84, padding: '6px 10px', fontSize: 13, fontWeight: 700, background: 'var(--morning)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', textTransform: 'uppercase' }}
          />
          <button type="button" onClick={submitSymbol} style={{ padding: '6px 11px', fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>Load</button>
          {data?.asset && (
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              ${data.asset.price.toFixed(2)} <span style={{ color: data.asset.change24h >= 0 ? '#16A34A' : '#DC2626' }}>{data.asset.change24h >= 0 ? '+' : ''}{data.asset.change24h.toFixed(2)}%</span>
            </span>
          )}
          {loading && <Loader2 size={12} className="animate-spin" color="var(--text-3)" />}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {INTERVALS.map((iv) => (
            <button key={iv.id} type="button" onClick={() => setInterval(iv.id)}
              style={{ padding: '4px 8px', fontSize: 10.5, fontWeight: 600, background: interval === iv.id ? 'var(--accent)' : 'var(--surface-2, var(--morning))', color: interval === iv.id ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
              {iv.label}
            </button>
          ))}
          <button type="button" onClick={() => void fetchData(symbol, interval)} disabled={loading} title="Refresh"
            style={{ padding: 5, marginLeft: 2, background: 'var(--surface-2, var(--morning))', border: '1px solid var(--border)', borderRadius: 6, cursor: loading ? 'wait' : 'pointer', display: 'flex' }}>
            <RefreshCw size={11} color="var(--text-2)" />
          </button>
        </div>
      </div>

      {/* Quick tickers */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {QUICK.map((s) => (
          <button key={s} type="button" onClick={() => { setSymbolInput(s); setSymbol(s) }}
            style={{ padding: '3px 8px', fontSize: 10.5, fontWeight: 500, background: symbol === s ? 'var(--accent)' : 'var(--morning)', color: symbol === s ? '#fff' : 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit' }}>
            {s}
          </button>
        ))}
      </div>

      {/* Overlay + pane toggles + draw tools */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {OVERLAY_META.map((o) => (
          <Toggle key={o.id} active={overlays[o.id]} color={o.color} label={o.label} onClick={() => setOverlays((p) => ({ ...p, [o.id]: !p[o.id] }))} />
        ))}
        <Toggle active={showRsi} color="#E879F9" label="RSI" onClick={() => setShowRsi((v) => !v)} />
        <Toggle active={showMacd} color="#3B82F6" label="MACD" onClick={() => setShowMacd((v) => !v)} />
        <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
        <button type="button" onClick={() => setDrawMode((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', fontSize: 10.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
            background: drawMode ? '#FBBF24' : 'var(--morning)', color: drawMode ? '#1c1917' : 'var(--text-2)', border: `1px solid ${drawMode ? '#FBBF24' : 'var(--border)'}` }}>
          <Pencil size={11} /> {drawMode ? 'Click chart to add line' : 'Draw line'}
        </button>
        {lines.length > 0 && (
          <button type="button" onClick={() => setLines([])}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', fontSize: 10.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--morning)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            <Eraser size={11} /> Clear {lines.length}
          </button>
        )}
      </div>

      {error && <div style={{ padding: 10, fontSize: 12, color: '#EF4444' }}>{error}</div>}

      <div ref={containerRef} style={{ width: '100%', height: 380, background: '#0d1126', borderRadius: 8, overflow: 'hidden' }} />

      {showRsi && series && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', margin: '6px 2px 2px' }}>RSI (14) — 30 / 70 bands</div>
          <IndicatorPane height={100} lines={rsiLines} refLines={[{ price: 70, color: 'rgba(239,68,68,0.4)' }, { price: 30, color: 'rgba(34,197,94,0.4)' }]} />
        </div>
      )}
      {showMacd && series && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', margin: '6px 2px 2px' }}>MACD (12 / 26 / 9)</div>
          <IndicatorPane height={110} lines={macdLines} histogram={{ data: series.macdHist }} />
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
        Real candles from Yahoo. Toggle indicators above; tap <strong>Draw line</strong> then click the chart to mark a support/resistance or your target price.
        {' '}Outside US market hours the latest bars may be sparse.
      </div>
    </div>
  )
}

function Toggle({ active, color, label, onClick }: { active: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: 10.5, fontWeight: 600,
        borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
        background: active ? 'var(--surface-2, var(--morning))' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-3)',
        border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
        opacity: active ? 1 : 0.6,
      }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {label}
    </button>
  )
}
