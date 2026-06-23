'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Loader2, Play, Pause, SkipForward, RotateCcw, FastForward } from 'lucide-react'
import { emaArray, vwapArray, computeSignalMarkers, type Bar } from '@/lib/chart-indicators'

interface CandlesResponse {
  symbol: string
  asset: { symbol: string; name: string }
  candles: Bar[]
}

interface ReplayPosition { direction: 'LONG' | 'SHORT'; shares: number; entryPrice: number }
interface ClosedTrade { direction: 'LONG' | 'SHORT'; entryPrice: number; exitPrice: number; pnl: number }

const SPEEDS = [{ ms: 1200, label: '1x' }, { ms: 600, label: '2x' }, { ms: 250, label: '4x' }]
const SEED_CASH = 10_000

function toLine(times: number[], arr: (number | null)[]): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = []
  for (let i = 0; i < arr.length; i++) if (arr[i] != null) out.push({ time: times[i], value: arr[i] as number })
  return out
}

/**
 * Bar Replay — step (or auto-play) through real historical candles you
 * haven't "seen" yet, practicing entries/exits against data that's already
 * happened. Entirely client-side: a $10,000 sandbox that never touches the
 * real Academy account, portfolio, or trade history — reset anytime.
 */
export default function BarReplay() {
  const [symbolInput, setSymbolInput] = useState('AAPL')
  const [interval, setIntervalSel] = useState('5m')
  const [range, setRange] = useState('1mo')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CandlesResponse | null>(null)

  const [startIndex, setStartIndex] = useState(0)
  const [replayIndex, setReplayIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speedMs, setSpeedMs] = useState(SPEEDS[0].ms)

  const [cash, setCash] = useState(SEED_CASH)
  const [position, setPosition] = useState<ReplayPosition | null>(null)
  const [closed, setClosed] = useState<ClosedTrade[]>([])
  const [qty, setQty] = useState(100)
  const [showSignals, setShowSignals] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<unknown>(null)

  const loadHistory = useCallback(async () => {
    const sym = symbolInput.toUpperCase().trim()
    if (!sym) return
    setLoading(true); setError(null); setStarted(false); setPlaying(false)
    try {
      const res = await fetch(`/api/academy/candles?symbol=${encodeURIComponent(sym)}&interval=${interval}&range=${range}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json as CandlesResponse)
      const n = (json as CandlesResponse).candles.length
      setStartIndex(Math.max(40, n - 150))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [symbolInput, interval, range])

  useEffect(() => { void loadHistory() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startReplay = () => {
    setReplayIndex(startIndex)
    setStarted(true)
    setPlaying(false)
    setCash(SEED_CASH)
    setPosition(null)
    setClosed([])
  }

  const candles = data?.candles ?? []
  const atEnd = replayIndex >= candles.length
  const currentPrice = replayIndex > 0 ? candles[replayIndex - 1]?.close ?? null : null

  // Auto-play
  useEffect(() => {
    if (!playing || !started) return
    if (atEnd) { setPlaying(false); return }
    const id = setTimeout(() => setReplayIndex((i) => Math.min(candles.length, i + 1)), speedMs)
    return () => clearTimeout(id)
  }, [playing, started, replayIndex, candles.length, speedMs, atEnd])

  // Render the revealed candles + EMA9/21 + VWAP context
  useEffect(() => {
    if (!containerRef.current || !started || candles.length === 0) return
    const visible = candles.slice(0, Math.max(1, replayIndex))
    let disposed = false

    void (async () => {
      try {
        const lib = await import('lightweight-charts')
        if (disposed || !containerRef.current) return
        if (chartRef.current) { (chartRef.current as { remove: () => void }).remove(); chartRef.current = null }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createChart: any = (lib as any).createChart
        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth, height: 360,
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
          : c.addSeries((lib as { CandlestickSeries: unknown }).CandlestickSeries, { upColor: '#22C55E', downColor: '#EF4444', borderVisible: false })
        candleSeries.setData(visible)
        if (showSignals) {
          const markers = computeSignalMarkers(visible)
          if (markers.length > 0) {
            const createSeriesMarkers = (lib as { createSeriesMarkers?: (s: unknown, m: unknown[]) => unknown }).createSeriesMarkers
            createSeriesMarkers?.(candleSeries, markers)
          }
        }

        const times = visible.map((b) => b.time)
        const closes = visible.map((b) => b.close)
        const addLine = (lineData: { time: number; value: number }[], color: string) => {
          if (lineData.length === 0) return
          const s = c.addLineSeries
            ? c.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
            : c.addSeries((lib as { LineSeries: unknown }).LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
          s.setData(lineData)
        }
        addLine(toLine(times, emaArray(closes, 9)), '#3B82F6')
        addLine(toLine(times, emaArray(closes, 21)), '#F59E0B')
        addLine(toLine(times, vwapArray(visible)), '#22D3EE')

        if (position) {
          candleSeries.createPriceLine({
            price: position.entryPrice, color: '#FFFFFF', lineWidth: 1, lineStyle: 1,
            axisLabelVisible: true, title: `Entry ${position.direction === 'LONG' ? 'long' : 'short'}`,
          })
        }

        c.timeScale().fitContent()
      } catch (err) {
        console.error('Replay chart failed', err)
      }
    })()

    return () => {
      disposed = true
      if (chartRef.current) { try { (chartRef.current as { remove: () => void }).remove() } catch { /* ignore */ } chartRef.current = null }
    }
  }, [started, replayIndex, candles, position, showSignals])

  const openLong = () => { if (currentPrice != null) { setPosition({ direction: 'LONG', shares: qty, entryPrice: currentPrice }); setCash((c) => c - currentPrice * qty) } }
  const openShort = () => { if (currentPrice != null) { setPosition({ direction: 'SHORT', shares: qty, entryPrice: currentPrice }); setCash((c) => c - currentPrice * qty) } }
  const closePosition = () => {
    if (!position || currentPrice == null) return
    const pnl = position.direction === 'LONG'
      ? (currentPrice - position.entryPrice) * position.shares
      : (position.entryPrice - currentPrice) * position.shares
    setCash((c) => c + (position.direction === 'LONG' ? currentPrice * position.shares : position.entryPrice * position.shares + pnl))
    setClosed((prev) => [{ direction: position.direction, entryPrice: position.entryPrice, exitPrice: currentPrice, pnl }, ...prev])
    setPosition(null)
  }

  const openPnl = position && currentPrice != null
    ? (position.direction === 'LONG' ? (currentPrice - position.entryPrice) * position.shares : (position.entryPrice - currentPrice) * position.shares)
    : 0
  const equity = cash + (position && currentPrice != null ? (position.direction === 'LONG' ? currentPrice * position.shares : position.entryPrice * position.shares + openPnl) : 0)
  const totalPnl = equity - SEED_CASH
  const wins = closed.filter((t) => t.pnl > 0).length

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <FastForward size={15} color="var(--accent)" />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Bar Replay</h3>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Real historical candles, revealed one bar at a time. Practice entries and exits on data that already happened —
        a separate ${SEED_CASH.toLocaleString()} sandbox that never touches your real Academy account. Reset anytime, no cost.
      </p>

      {/* Symbol / interval / range pickers */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input type="text" value={symbolInput} onChange={(e) => setSymbolInput(e.target.value.toUpperCase().slice(0, 10))}
          onKeyDown={(e) => { if (e.key === 'Enter') void loadHistory() }}
          style={{ width: 84, padding: '7px 10px', fontSize: 13, fontWeight: 700, background: 'var(--morning)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', textTransform: 'uppercase' }} />
        <select value={interval} onChange={(e) => setIntervalSel(e.target.value)}
          style={{ padding: '7px 8px', fontSize: 12, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }}>
          {['1m', '5m', '15m', '30m', '1h'].map((iv) => <option key={iv} value={iv}>{iv}</option>)}
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value)}
          style={{ padding: '7px 8px', fontSize: 12, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)', fontFamily: 'inherit' }}>
          {[['5d', '5D'], ['1mo', '1M'], ['3mo', '3M'], ['6mo', '6M']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button type="button" onClick={() => void loadHistory()} disabled={loading}
          style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : 'Load history'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 10 }}>{error}</div>}

      {data && !started && (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: 'var(--morning)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 8 }}>
            Loaded {candles.length} bars of {data.asset.name}. Pick where the replay starts (you&apos;ll only see bars up to this point until you step/play forward):
          </div>
          <input type="range" min={30} max={Math.max(31, candles.length - 5)} value={startIndex}
            onChange={(e) => setStartIndex(Number(e.target.value))} style={{ width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-3)', marginBottom: 10 }}>
            <span>Bar {startIndex} of {candles.length}</span>
            <span>{candles.length - startIndex} bars to play through</span>
          </div>
          <button type="button" onClick={startReplay}
            style={{ width: '100%', padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: '#16A34A', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            Start replay from here
          </button>
        </div>
      )}

      {started && (
        <>
          {/* Account strip */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--text-2)' }}>Equity <strong style={{ color: 'var(--text)' }}>${equity.toFixed(2)}</strong></span>
            <span style={{ color: totalPnl >= 0 ? '#16A34A' : '#DC2626', fontWeight: 700 }}>{totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}</span>
            {closed.length > 0 && <span style={{ color: 'var(--text-3)' }}>{wins}/{closed.length} wins</span>}
            <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>Bar {replayIndex} / {candles.length}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setShowSignals((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: 10.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                background: showSignals ? 'var(--surface-2, var(--morning))' : 'transparent', color: showSignals ? 'var(--text)' : 'var(--text-3)', border: `1px solid ${showSignals ? 'var(--border)' : 'transparent'}`, opacity: showSignals ? 1 : 0.6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#16A34A' }} /> Buy/sell signals
            </button>
            {showSignals && (
              <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.4 }}>
                ▲ green = a real long setup just fired · ▼ red = a short setup — hover an arrow to see which one.
              </span>
            )}
          </div>

          <div ref={containerRef} style={{ width: '100%', height: 360, background: '#0d1126', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }} />

          {/* Playback controls */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setPlaying((p) => !p)} disabled={atEnd}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', fontSize: 12, fontWeight: 700, borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', cursor: atEnd ? 'not-allowed' : 'pointer', opacity: atEnd ? 0.5 : 1, fontFamily: 'inherit' }}>
              {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" onClick={() => setReplayIndex((i) => Math.min(candles.length, i + 1))} disabled={atEnd}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)', cursor: atEnd ? 'not-allowed' : 'pointer', opacity: atEnd ? 0.5 : 1, fontFamily: 'inherit' }}>
              <SkipForward size={13} /> Step
            </button>
            {SPEEDS.map((s) => (
              <button key={s.label} type="button" onClick={() => setSpeedMs(s.ms)}
                style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
                  background: speedMs === s.ms ? 'var(--text)' : 'var(--morning)', color: speedMs === s.ms ? 'var(--surface)' : 'var(--text-2)' }}>
                {s.label}
              </button>
            ))}
            <button type="button" onClick={startReplay}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
              <RotateCcw size={13} /> Reset
            </button>
            {atEnd && <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>End of history</span>}
          </div>

          {/* Trade controls */}
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--morning)', border: '1px solid var(--border)' }}>
            {currentPrice == null ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Step forward to reveal the first bar before trading.</div>
            ) : position ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text)' }}>
                    {position.direction === 'SHORT' ? 'Short' : 'Long'} {position.shares} @ ${position.entryPrice.toFixed(2)} → ${currentPrice.toFixed(2)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: openPnl >= 0 ? '#16A34A' : '#DC2626' }}>
                    {openPnl >= 0 ? '+' : ''}${openPnl.toFixed(2)}
                  </span>
                </div>
                <button type="button" onClick={closePosition}
                  style={{ width: '100%', padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: '#1c1917', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Close position
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" value={qty} min={1} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: 70, padding: '8px 9px', fontSize: 12.5, fontWeight: 600, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit' }} />
                <button type="button" onClick={openLong}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: '#16A34A', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Buy @ ${currentPrice.toFixed(2)}
                </button>
                <button type="button" onClick={openShort}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Sell @ ${currentPrice.toFixed(2)}
                </button>
              </div>
            )}
          </div>

          {/* Trade log */}
          {closed.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Replay trades</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {closed.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '5px 8px', borderRadius: 6, background: 'var(--morning)' }}>
                    <span style={{ color: 'var(--text-2)' }}>{t.direction === 'SHORT' ? 'Short' : 'Long'} ${t.entryPrice.toFixed(2)} → ${t.exitPrice.toFixed(2)}</span>
                    <span style={{ fontWeight: 700, color: t.pnl >= 0 ? '#16A34A' : '#DC2626' }}>{t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
