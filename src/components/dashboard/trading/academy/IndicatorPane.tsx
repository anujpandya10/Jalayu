'use client'

import { useEffect, useRef } from 'react'

export interface PaneLine {
  data: { time: number; value: number }[]
  color: string
  lineWidth?: number
}
export interface PaneHistogram {
  data: { time: number; value: number; color?: string }[]
}
export interface PaneRefLine { price: number; color: string }

interface Props {
  height?: number
  lines?: PaneLine[]
  histogram?: PaneHistogram
  refLines?: PaneRefLine[]
}

/**
 * A small sub-pane chart (RSI, MACD) sharing the cockpit's look. Owns its own
 * lightweight-charts instance and cleans it up. Uses the same dynamic-import +
 * dual-API pattern as the rest of the app's charts.
 */
export default function IndicatorPane({ height = 110, lines = [], histogram, refLines = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current) return
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
          height,
          layout: { background: { color: 'transparent' }, textColor: '#8b93a7' },
          grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
          rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
          timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
          crosshair: { mode: 1 },
        })
        chartRef.current = chart
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = chart as any

        if (histogram) {
          const hs = c.addHistogramSeries
            ? c.addHistogramSeries({ priceLineVisible: false })
            : c.addSeries((lib as { HistogramSeries: unknown }).HistogramSeries, { priceLineVisible: false })
          hs.setData(histogram.data)
        }
        for (const ln of lines) {
          const ls = c.addLineSeries
            ? c.addLineSeries({ color: ln.color, lineWidth: ln.lineWidth ?? 1, priceLineVisible: false })
            : c.addSeries((lib as { LineSeries: unknown }).LineSeries, { color: ln.color, lineWidth: ln.lineWidth ?? 1, priceLineVisible: false })
          ls.setData(ln.data)
          for (const r of refLines) {
            ls.createPriceLine({ price: r.price, color: r.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true })
          }
        }

        c.timeScale().fitContent()
        const onResize = () => {
          if (containerRef.current && chartRef.current) {
            ;(chartRef.current as { applyOptions: (o: { width: number }) => void }).applyOptions({ width: containerRef.current.clientWidth })
          }
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      } catch (err) {
        console.error('Indicator pane failed', err)
      }
    })()

    return () => {
      disposed = true
      if (chartRef.current) {
        try { (chartRef.current as { remove: () => void }).remove() } catch { /* ignore */ }
        chartRef.current = null
      }
    }
  }, [height, lines, histogram, refLines])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
