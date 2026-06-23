'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Loader2, RefreshCw, Minus, TrendingUp as TrendlineIcon, Percent, Star, Trash2 } from 'lucide-react'
import {
  emaArray, vwapArray, bollingerArray, rsiArray, macdArray,
  smaArray, wmaArray, vwmaArray, keltnerArray, donchianArray, psarArray, superTrendArray, ichimokuArray,
  stochasticArray, stochRsiArray, adxArray, cciArray, williamsRArray, rocArray, atrArray,
  awesomeArray, aroonArray, obvArray, mfiArray, cmfArray, computeSignalMarkers,
  type Bar,
} from '@/lib/chart-indicators'
import IndicatorPane, { type PaneLine } from './IndicatorPane'
import { isUsMarketOpenNow } from '@/lib/market-hours'

interface CandlesResponse {
  symbol: string
  interval: string
  range: string
  asset: { symbol: string; name: string; price: number; change24h: number }
  candles: Bar[]
}

interface ChartPoint { time: number; price: number }
type Drawing =
  | { id: string; type: 'horizontal'; price: number }
  | { id: string; type: 'trendline'; p1: ChartPoint; p2: ChartPoint }
  | { id: string; type: 'fib'; p1: ChartPoint; p2: ChartPoint }
interface PendingTool { type: 'trendline' | 'fib'; anchor: ChartPoint }
interface ContextMenuState { x: number; y: number; point: ChartPoint }

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

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
  { id: '3mo', label: '3M' }, { id: '6mo', label: '6M' }, { id: '1y', label: '1Y' }, { id: 'max', label: 'ALL' },
]
const RANGE_IDS = RANGES.map((r) => r.id)
const INTERVAL_IDS_ORDER = ['1m', '5m', '15m', '30m', '1h', '1d']
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

export interface ChartPosition {
  direction: 'LONG' | 'SHORT'
  shares: number
  avgEntryPrice: number
  currentPrice: number
  pnl: number
  pnlPct: number
  managed: boolean
  stopPrice: number | null
  target1Price: number | null
  target2Price: number | null
}

type DragKind = 'stop' | 'target1' | 'target2'
interface DraggableLine { handle: { applyOptions: (o: { price: number }) => void }; price: number }

interface Props {
  defaultSymbol?: string
  /** When set/changed (e.g. tapping a watchlist name), the chart loads it. */
  symbol?: string
  /** Fires when the user loads a different symbol in the chart, so the rest of the desk (quick trade) can follow. */
  onSymbolChange?: (symbol: string) => void
  /** The desk's open position in the charted symbol, if any — drives the entry line + live P&L readout/band. */
  position?: ChartPosition | null
  /** Fires after a successful on-chart Buy/Sell so the parent can refresh portfolio + show the verdict. */
  onTraded?: (message: string) => void
  /** Monitor mode: show position lines + P&L but no on-chart trade box and no draggable lines (the bot is in control). */
  readOnly?: boolean
}

export default function TradingChart({ defaultSymbol = 'AAPL', symbol: controlledSymbol, onSymbolChange, position, onTraded, readOnly = false }: Props) {
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
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [pendingTool, setPendingTool] = useState<PendingTool | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [menuMsg, setMenuMsg] = useState<string | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number; price: number } | null>(null)
  const [pnlBand, setPnlBand] = useState<{ top: number; height: number; left: number; width: number; up: boolean } | null>(null)
  const [chartQty, setChartQty] = useState(100)
  const [chartTradeBusy, setChartTradeBusy] = useState<'LONG' | 'SHORT' | null>(null)
  const [showSignals, setShowSignals] = useState(true)
  const [dragPrice, setDragPrice] = useState<{ kind: DragKind; price: number; x: number; y: number } | null>(null)
  const priceLinesRef = useRef<Partial<Record<DragKind, DraggableLine>>>({})
  const draggingRef = useRef<DragKind | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<unknown>(null)
  const candleSeriesRef = useRef<unknown>(null)
  const priceLineHandlesRef = useRef<unknown[]>([])
  const pendingToolRef = useRef(pendingTool)
  pendingToolRef.current = pendingTool
  // Guards the auto-expand-on-scroll-past-the-edge logic below: set the moment
  // we bump range/interval to fetch more history, cleared once that fetch lands.
  const autoExpandingRef = useRef(false)

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
  // New data has landed (or the fetch failed) — safe to react to the next scroll-to-edge again.
  useEffect(() => { autoExpandingRef.current = false }, [data])

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

  // "Where could I have bought/sold" teaching markers — recreates the bot's
  // real pattern logic (RSI/EMA/MACD/VWAP/Bollinger) on the loaded candles.
  const signalMarkers = useMemo(() => (data ? computeSignalMarkers(data.candles) : []), [data])

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
          crosshair: {
            mode: 1,
            horzLine: { color: '#FBBF24', width: 1, style: 2, labelBackgroundColor: '#FBBF24' },
            vertLine: { color: 'rgba(255,255,255,0.4)', width: 1, style: 2, labelBackgroundColor: 'rgba(255,255,255,0.25)' },
          },
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
        if (showSignals && signalMarkers.length > 0) {
          const createSeriesMarkers = (lib as { createSeriesMarkers?: (s: unknown, m: unknown[]) => unknown }).createSeriesMarkers
          createSeriesMarkers?.(candleSeries, signalMarkers)
        }

        // Live price tag that follows the cursor — so you know exactly where a line will land.
        chart.subscribeCrosshairMove((param: { point?: { x: number; y: number } }) => {
          if (!param.point || !containerRef.current) { setHover(null); return }
          const price = candleSeries.coordinateToPrice(param.point.y)
          if (price == null) { setHover(null); return }
          const rect = containerRef.current.getBoundingClientRect()
          setHover({ x: rect.left + param.point.x, y: rect.top + param.point.y, price })
        })

        // Open position on this symbol: entry line + draggable stop/target lines + a P&L zone.
        priceLinesRef.current = {}
        if (position) {
          const isLong = position.direction === 'LONG'
          candleSeries.createPriceLine({
            price: position.avgEntryPrice, color: '#FFFFFF', lineWidth: 1, lineStyle: 1,
            axisLabelVisible: true, title: `Entry ${isLong ? 'long' : 'short'}`,
          })
          if (position.managed) {
            const makeDraggable = (kind: DragKind, price: number, color: string, title: string) => {
              const handle = candleSeries.createPriceLine({ price, color, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title })
              priceLinesRef.current[kind] = { handle, price }
            }
            if (position.stopPrice != null) makeDraggable('stop', position.stopPrice, '#EF4444', 'Stop ⇕ drag')
            if (position.target1Price != null) makeDraggable('target1', position.target1Price, '#22C55E', 'T1 ⇕ drag')
            if (position.target2Price != null) makeDraggable('target2', position.target2Price, '#16A34A', 'T2 ⇕ drag')
          }
          const updatePnlBand = () => {
            if (!containerRef.current) return
            const yEntry = candleSeries.priceToCoordinate(position.avgEntryPrice)
            const yNow = candleSeries.priceToCoordinate(position.currentPrice)
            if (yEntry == null || yNow == null) { setPnlBand(null); return }
            const rect = containerRef.current.getBoundingClientRect()
            setPnlBand({
              top: rect.top + Math.min(yEntry, yNow), height: Math.max(2, Math.abs(yNow - yEntry)),
              left: rect.left, width: rect.width, up: position.pnl >= 0,
            })
          }
          updatePnlBand()
          c.timeScale().subscribeVisibleTimeRangeChange(updatePnlBand)
          window.addEventListener('resize', updatePnlBand)
        } else {
          setPnlBand(null)
        }

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

        // Re-apply saved drawings (horizontal lines, trendlines, fib retracements)
        for (const d of drawings) {
          if (d.type === 'horizontal') {
            const h = candleSeries.createPriceLine({ price: d.price, color: '#FBBF24', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: 'H' })
            priceLineHandlesRef.current.push(h)
          } else if (d.type === 'trendline') {
            addLine([{ time: d.p1.time, value: d.p1.price }, { time: d.p2.time, value: d.p2.price }], '#FBBF24', 2)
          } else if (d.type === 'fib') {
            for (const ratio of FIB_LEVELS) {
              const price = d.p1.price + (d.p2.price - d.p1.price) * ratio
              const h = candleSeries.createPriceLine({
                price, color: 'rgba(250,204,21,0.7)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true,
                title: `${(ratio * 100).toFixed(1)}%`,
              })
              priceLineHandlesRef.current.push(h)
            }
          }
        }

        // Second click of a 2-point tool (trendline / fib) finalizes the drawing
        chart.subscribeClick((param: { point?: { x: number; y: number } }) => {
          const tool = pendingToolRef.current
          if (!tool || !param.point) return
          const price = candleSeries.coordinateToPrice(param.point.y)
          let time: number | null = (chart.timeScale() as { coordinateToTime: (x: number) => number | null }).coordinateToTime(param.point.x)
          if (time == null) {
            const logical = (chart.timeScale() as { coordinateToLogical: (x: number) => number | null }).coordinateToLogical(param.point.x)
            if (logical != null && data) {
              const idx = Math.max(0, Math.min(data.candles.length - 1, Math.round(logical)))
              time = data.candles[idx].time
            }
          }
          if (price == null || time == null) return
          const id = `${Date.now()}`
          setDrawings((prev) => [...prev, { id, type: tool.type, p1: tool.anchor, p2: { time, price } }])
          setPendingTool(null)
        })

        c.timeScale().fitContent()

        // Zooming/panning past the oldest loaded bar shows nothing because that's
        // genuinely all we've fetched — Webull/TradingView solve this by quietly
        // loading more history the moment you scroll into that empty space.
        // Logical range goes negative past the left edge, which is the signal we
        // want (unlike "from <= 0", which is also true right after fitContent()
        // fits everything on screen and would fire on every load).
        const ts = c.timeScale() as { getVisibleLogicalRange: () => { from: number; to: number } | null; subscribeVisibleLogicalRangeChange: (cb: () => void) => void }
        const onVisibleRangeChange = () => {
          if (autoExpandingRef.current) return
          const lr = ts.getVisibleLogicalRange()
          if (!lr || lr.from > -2) return
          const curRange = data.range ?? range
          const curInterval = data.interval ?? interval
          const rIdx = RANGE_IDS.indexOf(curRange)
          const iIdx = INTERVAL_IDS_ORDER.indexOf(curInterval)
          if (rIdx >= 0 && rIdx < RANGE_IDS.length - 1) {
            autoExpandingRef.current = true
            setRange(RANGE_IDS[rIdx + 1])
          } else if (iIdx >= 0 && iIdx < INTERVAL_IDS_ORDER.length - 1) {
            // Already at the widest range this interval's granularity supports —
            // step to a coarser candle so there's more history to show.
            autoExpandingRef.current = true
            const nextInterval = INTERVAL_IDS_ORDER[iIdx + 1]
            setInterval(nextInterval)
            setRange(nextInterval === '1d' ? 'max' : '1y')
          }
        }
        ts.subscribeVisibleLogicalRangeChange(onVisibleRangeChange)

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
      setHover(null)
      if (chartRef.current) {
        try { (chartRef.current as { remove: () => void }).remove() } catch { /* ignore */ }
        chartRef.current = null
      }
    }
  }, [data, series, overlays, drawings, position, showSignals, signalMarkers])

  // Drag-to-adjust stop/target lines. Lives in its own effect (independent of the
  // heavy chart-rebuild effect) and reads chart/series/line refs lazily at call
  // time, so it works regardless of the async chart-load timing. Mousedown is
  // captured ahead of the library's own canvas listeners (capture phase +
  // stopPropagation) so grabbing a line doesn't also pan the chart.
  useEffect(() => {
    if (readOnly) return  // monitor mode: the bot owns the lines, no manual dragging
    const HIT_PX = 7

    const findHit = (y: number): DragKind | null => {
      const cs = candleSeriesRef.current as { priceToCoordinate: (p: number) => number | null } | null
      if (!cs) return null
      for (const kind of ['stop', 'target1', 'target2'] as DragKind[]) {
        const line = priceLinesRef.current[kind]
        if (!line) continue
        const ly = cs.priceToCoordinate(line.price)
        if (ly != null && Math.abs(ly - y) <= HIT_PX) return kind
      }
      return null
    }

    const onMouseDown = (e: MouseEvent) => {
      if (pendingToolRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const hit = findHit(e.clientY - rect.top)
      if (hit) {
        draggingRef.current = hit
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const kind = draggingRef.current
      const cs = candleSeriesRef.current as { coordinateToPrice: (y: number) => number | null } | null
      if (!kind || !cs || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const price = cs.coordinateToPrice(e.clientY - rect.top)
      if (price == null) return
      const line = priceLinesRef.current[kind]
      if (line) { line.handle.applyOptions({ price }); line.price = price }
      setDragPrice({ kind, price, x: rect.right - 100, y: e.clientY })
    }

    const onMouseUp = () => {
      const kind = draggingRef.current
      draggingRef.current = null
      setDragPrice(null)
      if (!kind) return
      const line = priceLinesRef.current[kind]
      if (!line) return
      const rounded = Math.round(line.price * 100) / 100
      const body: Record<string, unknown> = { symbol }
      if (kind === 'stop') body.stopPrice = rounded
      if (kind === 'target1') body.target1Price = rounded
      if (kind === 'target2') body.target2Price = rounded
      const label = kind === 'stop' ? 'Stop' : kind === 'target1' ? 'Target 1' : 'Target 2'
      void fetch('/api/academy/positions/manage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(async (res) => {
        const json = await res.json().catch(() => ({}))
        onTraded?.(res.ok ? `${label} moved to $${rounded.toFixed(2)}` : (json.error || `Failed to move ${label.toLowerCase()}`))
      }).catch(() => onTraded?.(`Failed to move ${label.toLowerCase()}`))
    }

    const onHoverCursor = (e: MouseEvent) => {
      if (draggingRef.current || pendingToolRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      containerRef.current.style.cursor = findHit(e.clientY - rect.top) ? 'ns-resize' : 'default'
    }

    const container = containerRef.current
    container?.addEventListener('mousedown', onMouseDown, { capture: true })
    container?.addEventListener('mousemove', onHoverCursor)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      container?.removeEventListener('mousedown', onMouseDown, { capture: true })
      container?.removeEventListener('mousemove', onHoverCursor)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [symbol, onTraded, readOnly])

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

  const chartTrade = async (direction: 'LONG' | 'SHORT') => {
    setChartTradeBusy(direction)
    try {
      const res = await fetch('/api/academy/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, direction, shares: chartQty, orderType: 'MARKET' }),
      })
      const json = await res.json()
      onTraded?.(res.ok ? (json.message || `${direction === 'LONG' ? 'Bought' : 'Shorted'} ${chartQty} ${symbol}`) : (json.error || 'Order failed'))
    } finally {
      setChartTradeBusy(null)
    }
  }

  const chartClosePosition = async () => {
    setChartTradeBusy('LONG')
    try {
      const res = await fetch('/api/academy/trade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, intent: 'CLOSE' }),
      })
      const json = await res.json()
      onTraded?.(res.ok ? (json.message || `Closed ${symbol}`) : (json.error || 'Close failed'))
    } finally {
      setChartTradeBusy(null)
    }
  }

  /** Screen (x,y) within the chart container → (time, price), clamped to the loaded range. */
  const resolvePoint = useCallback((x: number, y: number): ChartPoint | null => {
    if (!chartRef.current || !candleSeriesRef.current || !data) return null
    const chart = chartRef.current as { timeScale: () => { coordinateToTime: (x: number) => number | null; coordinateToLogical: (x: number) => number | null } }
    const candleSeries = candleSeriesRef.current as { coordinateToPrice: (y: number) => number | null }
    const price = candleSeries.coordinateToPrice(y)
    if (price == null) return null
    let time = chart.timeScale().coordinateToTime(x)
    if (time == null) {
      const logical = chart.timeScale().coordinateToLogical(x)
      if (logical == null) return null
      const idx = Math.max(0, Math.min(data.candles.length - 1, Math.round(logical)))
      time = data.candles[idx].time
    }
    return { time, price }
  }, [data])

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const point = resolvePoint(e.clientX - rect.left, e.clientY - rect.top)
    if (!point) return
    setMenu({ x: e.clientX, y: e.clientY, point })
  }

  const addToWatchlist = async () => {
    setMenu(null)
    try {
      const res = await fetch('/api/academy/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }) })
      const json = await res.json()
      setMenuMsg(res.ok ? `${symbol} added to watchlist` : json.error || 'Failed to add')
    } catch {
      setMenuMsg('Failed to add')
    }
    setTimeout(() => setMenuMsg(null), 2500)
  }

  // Close the menu on outside click; cancel a pending 2-point tool with Escape.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPendingTool(null); setMenu(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
          {position && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontSize: 12.5, fontWeight: 800,
              background: position.pnl >= 0 ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.12)', color: position.pnl >= 0 ? '#16A34A' : '#DC2626',
            }}>
              {position.direction === 'SHORT' ? 'Short' : 'Long'} {position.shares} · {position.pnl >= 0 ? '+' : ''}${Math.abs(position.pnl).toFixed(2)} ({position.pnl >= 0 ? '+' : ''}{position.pnlPct.toFixed(2)}%)
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

      {/* Teaching markers — "where could I have bought/sold here" */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Toggle active={showSignals} color="#16A34A" label="Buy/sell signals" onClick={() => setShowSignals((v) => !v)} />
          {showSignals && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.4 }}>
              ▲ green = a real long setup (momentum/oversold/VWAP/MACD/Bollinger) just fired here · ▼ red = a short setup. Hover an arrow for which one. Same logic the bot trades, simplified for the chart.
            </span>
          )}
        </div>
      </div>

      {/* Draw tools — right-click the chart to draw, like Webull */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center', fontSize: 10.5, color: 'var(--text-3)' }}>
        <span>Right-click the chart to draw a line, trendline, or Fibonacci retracement.</span>
        {pendingTool && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 99, background: '#FBBF24', color: '#1c1917', fontWeight: 600 }}>
            Click a second point to finish the {pendingTool.type === 'fib' ? 'fib retracement' : 'trendline'} (Esc to cancel)
          </span>
        )}
        {drawings.length > 0 && (
          <button type="button" onClick={() => setDrawings([])}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', fontSize: 10.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--morning)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            <Trash2 size={11} /> Clear {drawings.length}
          </button>
        )}
        {menuMsg && <span style={{ color: '#16A34A', fontWeight: 600 }}>{menuMsg}</span>}
      </div>

      {error && <div style={{ padding: 10, fontSize: 12, color: '#EF4444' }}>{error}</div>}

      <div style={{ position: 'relative' }}>
        <div ref={containerRef} onContextMenu={onContextMenu}
          style={{ width: '100%', height: 380, background: '#0d1126', borderRadius: 8, overflow: 'hidden', cursor: pendingTool ? 'crosshair' : 'default' }} />

        {/* On-chart one-click trade — buy/short without leaving the chart, or close if you already hold it */}
        {!readOnly && <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 5, display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(13,17,38,0.85)', borderRadius: 9, padding: 5, border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {position ? (
            <button type="button" onClick={() => void chartClosePosition()} disabled={chartTradeBusy != null || !isUsMarketOpenNow()}
              style={{ padding: '6px 12px', fontSize: 11.5, fontWeight: 800, borderRadius: 6, border: 'none', background: '#1c1917', color: '#fff', cursor: 'pointer', opacity: isUsMarketOpenNow() ? 1 : 0.45 }}>
              Close {position.direction === 'SHORT' ? 'short' : 'long'} ({position.shares})
            </button>
          ) : (
            <>
              <input type="number" value={chartQty} min={1} onChange={(e) => setChartQty(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: 52, padding: '5px 6px', fontSize: 11.5, fontWeight: 600, borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontFamily: 'inherit' }} />
              <button type="button" onClick={() => void chartTrade('LONG')} disabled={chartTradeBusy != null || !isUsMarketOpenNow()}
                style={{ padding: '6px 10px', fontSize: 11.5, fontWeight: 800, borderRadius: 6, border: 'none', background: '#16A34A', color: '#fff', cursor: 'pointer', opacity: isUsMarketOpenNow() ? 1 : 0.45 }}>
                Buy
              </button>
              <button type="button" onClick={() => void chartTrade('SHORT')} disabled={chartTradeBusy != null || !isUsMarketOpenNow()}
                style={{ padding: '6px 10px', fontSize: 11.5, fontWeight: 800, borderRadius: 6, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', opacity: isUsMarketOpenNow() ? 1 : 0.45 }}>
                Short
              </button>
            </>
          )}
        </div>}
      </div>

      {pnlBand && (
        <div style={{
          position: 'fixed', left: pnlBand.left, top: pnlBand.top, width: pnlBand.width, height: pnlBand.height,
          zIndex: 3, pointerEvents: 'none', background: pnlBand.up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          borderTop: `1px solid ${pnlBand.up ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
          borderBottom: `1px solid ${pnlBand.up ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
        }} />
      )}

      {hover && !dragPrice && (
        <div style={{
          position: 'fixed', left: hover.x + 14, top: hover.y - 11, zIndex: 40, pointerEvents: 'none',
          background: '#FBBF24', color: '#1c1917', fontSize: 11.5, fontWeight: 700,
          padding: '3px 9px', borderRadius: 6, boxShadow: '0 3px 10px rgba(0,0,0,0.35)', fontFamily: 'inherit',
        }}>
          {hover.price < 1 ? hover.price.toFixed(4) : hover.price.toFixed(2)}
        </div>
      )}

      {dragPrice && (
        <div style={{
          position: 'fixed', left: dragPrice.x, top: dragPrice.y - 11, zIndex: 50, pointerEvents: 'none',
          background: dragPrice.kind === 'stop' ? '#EF4444' : '#22C55E', color: '#fff', fontSize: 11.5, fontWeight: 800,
          padding: '4px 10px', borderRadius: 6, boxShadow: '0 3px 10px rgba(0,0,0,0.4)', fontFamily: 'inherit',
        }}>
          {dragPrice.kind === 'stop' ? 'Stop' : dragPrice.kind === 'target1' ? 'T1' : 'T2'} → ${dragPrice.price.toFixed(2)}
        </div>
      )}

      {menu && (
        <div style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999, minWidth: 200, background: '#161b2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.45)', padding: 6, fontSize: 12.5 }}
          onMouseDown={(e) => e.stopPropagation()}>
          <MenuItem icon={<Minus size={13} />} label="Horizontal line" onClick={() => {
            setDrawings((prev) => [...prev, { id: `${Date.now()}`, type: 'horizontal', price: Math.round(menu.point.price * 100) / 100 }])
            setMenu(null)
          }} />
          <MenuItem icon={<TrendlineIcon size={13} />} label="Trendline" onClick={() => { setPendingTool({ type: 'trendline', anchor: menu.point }); setMenu(null) }} />
          <MenuItem icon={<Percent size={13} />} label="Fibonacci retracement" onClick={() => { setPendingTool({ type: 'fib', anchor: menu.point }); setMenu(null) }} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
          <MenuItem icon={<Star size={13} />} label="Add to watchlist" onClick={() => void addToWatchlist()} />
          {drawings.length > 0 && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
              <MenuItem icon={<Trash2 size={13} />} label={`Clear ${drawings.length} drawing${drawings.length === 1 ? '' : 's'}`} onClick={() => { setDrawings([]); setMenu(null) }} />
            </>
          )}
        </div>
      )}

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
        Real candles from Yahoo. Toggle indicators above; right-click anywhere on the chart for drawing tools.
        {' '}If you have a managed position open, drag its Stop/T1/T2 lines to adjust them live.
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

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: '#E2E6F0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, textAlign: 'left' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
      <span style={{ color: '#9CA8C2', display: 'flex' }}>{icon}</span>
      {label}
    </button>
  )
}
