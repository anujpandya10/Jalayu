'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Loader2, RefreshCw, Pencil, Eraser } from 'lucide-react'
import {
  emaArray, vwapArray, bollingerArray, rsiArray, macdArray,
  smaArray, wmaArray, vwmaArray, keltnerArray, donchianArray, psarArray, superTrendArray, ichimokuArray,
  stochasticArray, stochRsiArray, adxArray, cciArray, williamsRArray, rocArray, atrArray,
  awesomeArray, aroonArray, obvArray, mfiArray, cmfArray,
  type Bar,
} from '@/lib/chart-indicators'
import IndicatorPane, { type PaneLine } from './IndicatorPane'

interface CandlesResponse {
  symbol: string
  interval: string
  asset: { symbol: string; name: string; price: number; change24h: number }
  candles: Bar[]
}

type Overlay =
  | 'ema9' | 'ema21' | 'ema50' | 'sma20' | 'sma50' | 'sma200' | 'wma' | 'vwma'
  | 'vwap' | 'bb' | 'keltner' | 'donchian' | 'supertrend' | 'psar' | 'ichimoku'
type OscId = 'rsi' | 'macd' | 'stoch' | 'stochrsi' | 'adx' | 'cci' | 'willr' | 'roc' | 'atr' | 'obv' | 'mfi' | 'cmf' | 'ao' | 'aroon'
const INTERVALS: { id: string; label: string }[] = [
  { id: '1m', label: '1m' }, { id: '5m', label: '5m' }, { id: '15m', label: '15m' },
  { id: '30m', label: '30m' }, { id: '1h', label: '1h' }, { id: '1d', label: '1D' },
]
const RANGES: { id: string; label: string }[] = [
  { id: '1d', label: '1D' }, { id: '5d', label: '5D' }, { id: '1mo', label: '1M' },
  { id: '3mo', label: '3M' }, { id: '6mo', label: '6M' }, { id: '1y', label: '1Y' },
]
const OVERLAY_META: { id: Overlay; label: string; color: string }[] = [
  { id: 'ema9', label: 'EMA 9', color: '#3B82F6' },
  { id: 'ema21', label: 'EMA 21', color: '#F59E0B' },
  { id: 'ema50', label: 'EMA 50', color: '#A855F7' },
  { id: 'sma20', label: 'SMA 20', color: '#60A5FA' },
  { id: 'sma50', label: 'SMA 50', color: '#FB923C' },
  { id: 'sma200', label: 'SMA 200', color: '#F43F5E' },
  { id: 'wma', label: 'WMA 20', color: '#34D399' },
  { id: 'vwma', label: 'VWMA 20', color: '#2DD4BF' },
  { id: 'vwap', label: 'VWAP', color: '#22D3EE' },
  { id: 'bb', label: 'Bollinger', color: '#94A3B8' },
  { id: 'keltner', label: 'Keltner', color: '#C084FC' },
  { id: 'donchian', label: 'Donchian', color: '#E879F9' },
  { id: 'supertrend', label: 'SuperTrend', color: '#10B981' },
  { id: 'psar', label: 'Parabolic SAR', color: '#FACC15' },
  { id: 'ichimoku', label: 'Ichimoku', color: '#F87171' },
]
const OSC_META: { id: OscId; label: string }[] = [
  { id: 'rsi', label: 'RSI' }, { id: 'macd', label: 'MACD' }, { id: 'stoch', label: 'Stochastic' },
  { id: 'stochrsi', label: 'Stoch RSI' }, { id: 'adx', label: 'ADX/DMI' }, { id: 'cci', label: 'CCI' },
  { id: 'willr', label: 'Williams %R' }, { id: 'roc', label: 'ROC' }, { id: 'atr', label: 'ATR' },
  { id: 'obv', label: 'OBV' }, { id: 'mfi', label: 'MFI' }, { id: 'cmf', label: 'CMF' },
  { id: 'ao', label: 'Awesome' }, { id: 'aroon', label: 'Aroon' },
]
const QUICK = ['AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'AMD', 'MSFT', 'AMZN']

function toLine(times: number[], arr: (number | null)[]): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = []
  for (let i = 0; i < arr.length; i++) if (arr[i] != null) out.push({ time: times[i], value: arr[i] as number })
  return out
}

interface Props {
  defaultSymbol?: string
  /** When set/changed (e.g. tapping a watchlist name), the chart loads it. */
  symbol?: string
  /** Fires when the user loads a different symbol in the chart, so the rest of the desk (quick trade) can follow. */
  onSymbolChange?: (symbol: string) => void
}

export default function TradingChart({ defaultSymbol = 'AAPL', symbol: controlledSymbol, onSymbolChange }: Props) {
  const [symbolInput, setSymbolInput] = useState(controlledSymbol ?? defaultSymbol)
  const [symbol, setSymbol] = useState(controlledSymbol ?? defaultSymbol)

  // Follow an externally-selected symbol (watchlist pick)
  useEffect(() => {
    if (controlledSymbol && controlledSymbol !== symbol) {
      setSymbol(controlledSymbol)
      setSymbolInput(controlledSymbol)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledSymbol])
  const [interval, setInterval] = useState('5m')
  const [range, setRange] = useState('5d')
  const [data, setData] = useState<CandlesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [overlays, setOverlays] = useState<Record<Overlay, boolean>>({
    ema9: true, ema21: true, ema50: false, sma20: false, sma50: false, sma200: false, wma: false, vwma: false,
    vwap: true, bb: false, keltner: false, donchian: false, supertrend: false, psar: false, ichimoku: false,
  })
  const [oscillators, setOscillators] = useState<Record<OscId, boolean>>({
    rsi: true, macd: false, stoch: false, stochrsi: false, adx: false, cci: false, willr: false,
    roc: false, atr: false, obv: false, mfi: false, cmf: false, ao: false, aroon: false,
  })
  const [drawMode, setDrawMode] = useState(false)
  const [lines, setLines] = useState<number[]>([])

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<unknown>(null)
  const candleSeriesRef = useRef<unknown>(null)
  const priceLineHandlesRef = useRef<unknown[]>([])
  const drawModeRef = useRef(drawMode)
  drawModeRef.current = drawMode

  const fetchData = useCallback(async (sym: string, iv: string, rg: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/academy/candles?symbol=${encodeURIComponent(sym)}&interval=${iv}&range=${rg}`, { cache: 'no-store' })
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

  useEffect(() => { void fetchData(symbol, interval, range) }, [symbol, interval, range, fetchData])

  // Pre-compute indicator series from candles
  const series = useMemo(() => {
    if (!data || data.candles.length === 0) return null
    const candles = data.candles
    const times = candles.map((c) => c.time)
    const closes = candles.map((c) => c.close)
    const bb = bollingerArray(closes)
    const macd = macdArray(closes)
    const kelt = keltnerArray(candles)
    const donch = donchianArray(candles)
    const st = superTrendArray(candles)
    const ich = ichimokuArray(candles)
    const stoch = stochasticArray(candles)
    const stochRsi = stochRsiArray(closes)
    const adx = adxArray(candles)
    const aroon = aroonArray(candles)

    return {
      times,
      // Overlays
      ema9: toLine(times, emaArray(closes, 9)),
      ema21: toLine(times, emaArray(closes, 21)),
      ema50: toLine(times, emaArray(closes, 50)),
      sma20: toLine(times, smaArray(closes, 20)),
      sma50: toLine(times, smaArray(closes, 50)),
      sma200: toLine(times, smaArray(closes, 200)),
      wma: toLine(times, wmaArray(closes, 20)),
      vwma: toLine(times, vwmaArray(candles, 20)),
      vwap: toLine(times, vwapArray(candles)),
      bbUpper: toLine(times, bb.map((b) => (b ? b.upper : null))),
      bbMid: toLine(times, bb.map((b) => (b ? b.middle : null))),
      bbLower: toLine(times, bb.map((b) => (b ? b.lower : null))),
      keltUpper: toLine(times, kelt.map((k) => (k ? k.upper : null))),
      keltMid: toLine(times, kelt.map((k) => (k ? k.middle : null))),
      keltLower: toLine(times, kelt.map((k) => (k ? k.lower : null))),
      donchUpper: toLine(times, donch.map((d) => (d ? d.upper : null))),
      donchMid: toLine(times, donch.map((d) => (d ? d.middle : null))),
      donchLower: toLine(times, donch.map((d) => (d ? d.lower : null))),
      supertrendUp: toLine(times, st.map((s) => (s && s.up ? s.value : null))),
      supertrendDown: toLine(times, st.map((s) => (s && !s.up ? s.value : null))),
      psar: toLine(times, psarArray(candles)),
      ichTenkan: toLine(times, ich.map((i) => i.tenkan)),
      ichKijun: toLine(times, ich.map((i) => i.kijun)),
      ichSenkouA: toLine(times, ich.map((i) => i.senkouA)),
      ichSenkouB: toLine(times, ich.map((i) => i.senkouB)),
      // Oscillators
      rsi: toLine(times, rsiArray(closes)),
      macdLine: toLine(times, macd.map((m) => (m ? m.macd : null))),
      macdSignal: toLine(times, macd.map((m) => (m ? m.signal : null))),
      macdHist: macd.map((m, i) => (m ? { time: times[i], value: m.hist, color: m.hist >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)' } : null))
        .filter(Boolean) as { time: number; value: number; color: string }[],
      stochK: toLine(times, stoch.map((s) => (s ? s.k : null))),
      stochD: toLine(times, stoch.map((s) => (s ? s.d : null))),
      stochRsiK: toLine(times, stochRsi.map((s) => (s ? s.k : null))),
      stochRsiD: toLine(times, stochRsi.map((s) => (s ? s.d : null))),
      adx: toLine(times, adx.map((a) => (a ? a.adx : null))),
      plusDI: toLine(times, adx.map((a) => (a ? a.plusDI : null))),
      minusDI: toLine(times, adx.map((a) => (a ? a.minusDI : null))),
      cci: toLine(times, cciArray(candles)),
      willr: toLine(times, williamsRArray(candles)),
      roc: toLine(times, rocArray(closes)),
      atr: toLine(times, atrArray(candles)),
      obv: toLine(times, obvArray(candles)),
      mfi: toLine(times, mfiArray(candles)),
      cmf: toLine(times, cmfArray(candles)),
      ao: toLine(times, awesomeArray(candles)),
      aroonUp: toLine(times, aroon.map((a) => (a ? a.up : null))),
      aroonDown: toLine(times, aroon.map((a) => (a ? a.down : null))),
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
        if (overlays.sma20) addLine(series.sma20, '#60A5FA')
        if (overlays.sma50) addLine(series.sma50, '#FB923C')
        if (overlays.sma200) addLine(series.sma200, '#F43F5E')
        if (overlays.wma) addLine(series.wma, '#34D399')
        if (overlays.vwma) addLine(series.vwma, '#2DD4BF')
        if (overlays.vwap) addLine(series.vwap, '#22D3EE', 2)
        if (overlays.bb) {
          addLine(series.bbUpper, 'rgba(148,163,184,0.7)')
          addLine(series.bbMid, 'rgba(148,163,184,0.4)')
          addLine(series.bbLower, 'rgba(148,163,184,0.7)')
        }
        if (overlays.keltner) {
          addLine(series.keltUpper, 'rgba(192,132,252,0.7)')
          addLine(series.keltMid, 'rgba(192,132,252,0.4)')
          addLine(series.keltLower, 'rgba(192,132,252,0.7)')
        }
        if (overlays.donchian) {
          addLine(series.donchUpper, 'rgba(232,121,249,0.7)')
          addLine(series.donchLower, 'rgba(232,121,249,0.7)')
        }
        if (overlays.supertrend) {
          addLine(series.supertrendUp, '#10B981', 2)
          addLine(series.supertrendDown, '#EF4444', 2)
        }
        if (overlays.psar) addLine(series.psar, '#FACC15')
        if (overlays.ichimoku) {
          addLine(series.ichTenkan, '#F87171')
          addLine(series.ichKijun, '#60A5FA')
          addLine(series.ichSenkouA, 'rgba(34,197,94,0.5)')
          addLine(series.ichSenkouB, 'rgba(239,68,68,0.5)')
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

  // Build { title, lines, histogram?, refLines? } for every active oscillator pane.
  const oscPanes = useMemo(() => {
    if (!series) return []
    const panes: { id: OscId; title: string; lines: PaneLine[]; histogram?: { data: { time: number; value: number; color?: string }[] }; refLines?: { price: number; color: string }[] }[] = []
    if (oscillators.rsi) panes.push({ id: 'rsi', title: 'RSI (14) — 30 / 70 bands', lines: [{ data: series.rsi, color: '#E879F9' }], refLines: [{ price: 70, color: 'rgba(239,68,68,0.4)' }, { price: 30, color: 'rgba(34,197,94,0.4)' }] })
    if (oscillators.macd) panes.push({ id: 'macd', title: 'MACD (12 / 26 / 9)', lines: [{ data: series.macdLine, color: '#3B82F6' }, { data: series.macdSignal, color: '#F59E0B' }], histogram: { data: series.macdHist } })
    if (oscillators.stoch) panes.push({ id: 'stoch', title: 'Stochastic (14, 3)', lines: [{ data: series.stochK, color: '#3B82F6' }, { data: series.stochD, color: '#F59E0B' }], refLines: [{ price: 80, color: 'rgba(239,68,68,0.4)' }, { price: 20, color: 'rgba(34,197,94,0.4)' }] })
    if (oscillators.stochrsi) panes.push({ id: 'stochrsi', title: 'Stoch RSI', lines: [{ data: series.stochRsiK, color: '#3B82F6' }, { data: series.stochRsiD, color: '#F59E0B' }], refLines: [{ price: 80, color: 'rgba(239,68,68,0.4)' }, { price: 20, color: 'rgba(34,197,94,0.4)' }] })
    if (oscillators.adx) panes.push({ id: 'adx', title: 'ADX / DMI (14)', lines: [{ data: series.adx, color: '#94A3B8', lineWidth: 2 }, { data: series.plusDI, color: '#22C55E' }, { data: series.minusDI, color: '#EF4444' }], refLines: [{ price: 25, color: 'rgba(148,163,184,0.4)' }] })
    if (oscillators.cci) panes.push({ id: 'cci', title: 'CCI (20)', lines: [{ data: series.cci, color: '#A855F7' }], refLines: [{ price: 100, color: 'rgba(239,68,68,0.4)' }, { price: -100, color: 'rgba(34,197,94,0.4)' }] })
    if (oscillators.willr) panes.push({ id: 'willr', title: 'Williams %R (14)', lines: [{ data: series.willr, color: '#F87171' }], refLines: [{ price: -20, color: 'rgba(239,68,68,0.4)' }, { price: -80, color: 'rgba(34,197,94,0.4)' }] })
    if (oscillators.roc) panes.push({ id: 'roc', title: 'ROC (12)', lines: [{ data: series.roc, color: '#2DD4BF' }], refLines: [{ price: 0, color: 'rgba(148,163,184,0.3)' }] })
    if (oscillators.atr) panes.push({ id: 'atr', title: 'ATR (14)', lines: [{ data: series.atr, color: '#FB923C' }] })
    if (oscillators.obv) panes.push({ id: 'obv', title: 'OBV', lines: [{ data: series.obv, color: '#60A5FA' }] })
    if (oscillators.mfi) panes.push({ id: 'mfi', title: 'MFI (14)', lines: [{ data: series.mfi, color: '#34D399' }], refLines: [{ price: 80, color: 'rgba(239,68,68,0.4)' }, { price: 20, color: 'rgba(34,197,94,0.4)' }] })
    if (oscillators.cmf) panes.push({ id: 'cmf', title: 'Chaikin Money Flow (20)', lines: [{ data: series.cmf, color: '#FACC15' }], refLines: [{ price: 0, color: 'rgba(148,163,184,0.3)' }] })
    if (oscillators.ao) panes.push({ id: 'ao', title: 'Awesome Oscillator', lines: [{ data: series.ao, color: '#10B981' }], refLines: [{ price: 0, color: 'rgba(148,163,184,0.3)' }] })
    if (oscillators.aroon) panes.push({ id: 'aroon', title: 'Aroon (25)', lines: [{ data: series.aroonUp, color: '#22C55E' }, { data: series.aroonDown, color: '#EF4444' }] })
    return panes
  }, [series, oscillators])

  const submitSymbol = () => {
    const s = symbolInput.toUpperCase().trim()
    if (s) { setSymbol(s); onSymbolChange?.(s) }
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
        <button type="button" onClick={() => void fetchData(symbol, interval, range)} disabled={loading} title="Refresh"
          style={{ padding: 5, background: 'var(--surface-2, var(--morning))', border: '1px solid var(--border)', borderRadius: 6, cursor: loading ? 'wait' : 'pointer', display: 'flex' }}>
          <RefreshCw size={11} color="var(--text-2)" />
        </button>
      </div>

      {/* Quick tickers */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {QUICK.map((s) => (
          <button key={s} type="button" onClick={() => { setSymbolInput(s); setSymbol(s); onSymbolChange?.(s) }}
            style={{ padding: '3px 8px', fontSize: 10.5, fontWeight: 500, background: symbol === s ? 'var(--accent)' : 'var(--morning)', color: symbol === s ? '#fff' : 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit' }}>
            {s}
          </button>
        ))}
      </div>

      {/* Overlay toggles */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Overlays</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {OVERLAY_META.map((o) => (
            <Toggle key={o.id} active={overlays[o.id]} color={o.color} label={o.label} onClick={() => setOverlays((p) => ({ ...p, [o.id]: !p[o.id] }))} />
          ))}
        </div>
      </div>

      {/* Oscillator / pane toggles */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Indicators</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {OSC_META.map((o) => (
            <Toggle key={o.id} active={oscillators[o.id]} color="#94A3B8" label={o.label} onClick={() => setOscillators((p) => ({ ...p, [o.id]: !p[o.id] }))} />
          ))}
        </div>
      </div>

      {/* Draw tools */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
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

      {/* Timeframe controls — under the chart, Webull-style */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Range</span>
        {RANGES.map((rg) => (
          <button key={rg.id} type="button" onClick={() => setRange(rg.id)}
            style={{ padding: '4px 9px', fontSize: 10.5, fontWeight: 600, background: range === rg.id ? 'var(--text)' : 'var(--surface-2, var(--morning))', color: range === rg.id ? 'var(--surface)' : 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
            {rg.label}
          </button>
        ))}
        <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <span style={{ fontSize: 9.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Candles</span>
        {INTERVALS.map((iv) => (
          <button key={iv.id} type="button" onClick={() => setInterval(iv.id)}
            style={{ padding: '4px 8px', fontSize: 10.5, fontWeight: 600, background: interval === iv.id ? 'var(--accent)' : 'var(--surface-2, var(--morning))', color: interval === iv.id ? '#fff' : 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
            {iv.label}
          </button>
        ))}
      </div>

      {oscPanes.map((pane) => (
        <div key={pane.id} style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', margin: '6px 2px 2px' }}>{pane.title}</div>
          <IndicatorPane height={pane.histogram ? 110 : 100} lines={pane.lines} histogram={pane.histogram} refLines={pane.refLines} />
        </div>
      ))}

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
