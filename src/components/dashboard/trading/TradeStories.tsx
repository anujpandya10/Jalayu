'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, TrendingUp, TrendingDown, Lightbulb, ArrowRight, Clock,
  BookOpen, Sparkles,
} from 'lucide-react'

interface Trade {
  id: string
  symbol: string
  name: string
  action: string
  direction: string
  price: number
  total: number
  pnl: number | null
  reason: string
  created_at: string
}

// Template-based "story" generator — explains WHY the bot took each trade
// and pairs it with a one-line lesson. Pure functions on the trade record so
// the same trade always produces the same story.

interface StorySection {
  setupName: string
  setupColor: string
  emoji: string
  whyShort: string
  strategy: string
  lesson: string
}

function setupOf(reason: string): string {
  const m = reason.match(/\[([A-Z_]+)\]/)
  return m ? m[1] : 'UNKNOWN'
}

const STRATEGIES: Record<string, StorySection> = {
  MOMENTUM_LONG: {
    setupName: 'Momentum Long',
    setupColor: '#16A34A',
    emoji: '🚀',
    whyShort: 'asset rising fast with real volume — trend confirmed',
    strategy: 'We buy when an asset is already moving up with volume behind it. Trends tend to continue more often than they reverse. The fast moving average (EMA9) above the slow one (EMA21) confirms the upward direction.',
    lesson: 'Volume confirms price. A pump without volume often fades; a pump WITH volume often keeps running.',
  },
  OVERSOLD_BOUNCE: {
    setupName: 'Oversold Bounce',
    setupColor: '#10B981',
    emoji: '🪂',
    whyShort: 'crashed too far, too fast — primed to bounce',
    strategy: 'When something falls sharply and RSI drops below 30, sellers have likely exhausted themselves. Buyers step in to scoop up the "discount." We catch the snap-back.',
    lesson: 'Markets overshoot in both directions. Extreme fear creates extreme value if you have the stomach.',
  },
  VWAP_LONG: {
    setupName: 'VWAP Long',
    setupColor: '#3B82F6',
    emoji: '⚖️',
    whyShort: 'price dipped below intraday fair value',
    strategy: 'VWAP (volume-weighted average price) is what the asset "should" cost based on today\'s trading. When price dips below VWAP with neutral RSI, big traders often buy the value — we follow.',
    lesson: 'VWAP is professional traders\' favorite reference. When you see a coordinated bounce off VWAP, smart money is at work.',
  },
  MEAN_REVERT: {
    setupName: 'Mean Revert',
    setupColor: '#8B5CF6',
    emoji: '🔁',
    whyShort: 'small pullback in an otherwise healthy asset',
    strategy: 'Healthy assets in uptrends pause and breathe. When they dip slightly below VWAP with RSI cooling, they often resume the climb. We catch the resumption.',
    lesson: 'Not every dip is a reversal — most are just rest stops on the way up.',
  },
  PUMP_SHORT: {
    setupName: 'Pump Short',
    setupColor: '#DC2626',
    emoji: '🪤',
    whyShort: 'overheated rally with reversal signal — fade the FOMO',
    strategy: 'When something pumps 12%+ with RSI above 70 AND short-term momentum turns down (EMA9 < EMA21), the move is exhausted. We short the reversal.',
    lesson: 'Greed at extremes is the best signal for a top. Wait for the actual rollover — don\'t fight strength.',
  },
  SUPERNOVA_SHORT: {
    setupName: 'Supernova Short',
    setupColor: '#991B1B',
    emoji: '🌋',
    whyShort: 'parabolic move — gravity always wins',
    strategy: '25%+ moves in 24h with extreme volume rarely sustain. We short the inevitable correction.',
    lesson: 'The bigger and faster the rally, the more violent the crash. Parabolic moves are gifts to short sellers.',
  },
  VWAP_SHORT: {
    setupName: 'VWAP Short',
    setupColor: '#F59E0B',
    emoji: '📉',
    whyShort: 'extended above fair value with reversal forming',
    strategy: 'Price stretched 1.5%+ above VWAP with overbought RSI signals exhaustion. We fade the move back to fair value.',
    lesson: 'What goes too far from average tends to revert — markets seek equilibrium.',
  },
  FOREX_DIP: {
    setupName: 'Forex Dip',
    setupColor: '#0891B2',
    emoji: '💱',
    whyShort: 'currency oversold against USD',
    strategy: 'When a currency pair drops sharply with oversold RSI, central bank rules of thumb favor reversion. We catch the technical bounce.',
    lesson: 'Forex moves are usually small but consistent. Position sizing matters more than entry timing.',
  },
  FOREX_FADE: {
    setupName: 'Forex Fade',
    setupColor: '#0E7490',
    emoji: '💱',
    whyShort: 'currency overextended — short the strength',
    strategy: 'Sharp rallies in currency pairs often fade as carry trades unwind. We short overbought conditions.',
    lesson: 'Currencies have memories. Strong moves often correct as positioning gets crowded.',
  },
}

const FALLBACK: StorySection = {
  setupName: 'General Strategy',
  setupColor: 'var(--text-2)',
  emoji: '📊',
  whyShort: 'signals indicated an opportunity',
  strategy: 'The engine combined multiple indicators (RSI, VWAP, volume, EMAs) to score this as worth taking.',
  lesson: 'No single indicator is a holy grail. Confirmation across multiple signals reduces false positives.',
}

function getStory(setup: string): StorySection {
  return STRATEGIES[setup] ?? FALLBACK
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function TradeStories() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/history?limit=15', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json() as { trades: Trade[] }
      setTrades(json.trades ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Pair entry + exit into "story cards" by symbol
  // Take the latest closed exits (have pnl) and show as stories
  const stories = trades.filter((t) => t.pnl != null).slice(0, 6)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Sparkles size={16} color="var(--accent)" />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Why your bot made each trade
        </h3>
        {loading && <Loader2 size={12} className="animate-spin" color="var(--text-3)" />}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
        Each trade comes with a strategy and a lesson. Click to expand — over time
        you&apos;ll absorb the patterns the bot uses.
      </p>

      {!loading && stories.length === 0 && (
        <div style={{
          padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)',
          background: 'var(--morning)', borderRadius: 10,
        }}>
          No closed trades yet. As your bot trades, stories will appear here explaining the
          strategy behind each one.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {stories.map((trade, idx) => {
          const setup = setupOf(trade.reason)
          const story = getStory(setup)
          const won = (trade.pnl ?? 0) > 0
          const isOpen = openIdx === idx
          const pnlAbs = Math.abs(trade.pnl ?? 0)

          return (
            <div
              key={trade.id}
              style={{
                border: `1px solid ${isOpen ? story.setupColor : 'var(--border)'}`,
                borderRadius: 10,
                background: isOpen ? 'var(--morning)' : 'var(--surface)',
                overflow: 'hidden',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {/* Compact row */}
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: 'transparent', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: `${story.setupColor}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 16,
                }}>
                  {story.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {won ? '+' : '−'}${pnlAbs.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {trade.direction} {trade.symbol} · {story.setupName}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--text-3)', marginTop: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {story.whyShort}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
                  <Clock size={10} />
                  {relativeTime(trade.created_at)}
                </div>
                <ArrowRight size={12} color="var(--text-3)" style={{
                  transition: 'transform 0.15s',
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0)',
                  flexShrink: 0,
                }} />
              </button>

              {/* Expanded details */}
              {isOpen && (
                <div style={{ padding: '0 12px 12px', borderTop: '0.5px solid var(--border)' }}>
                  <div style={{ marginTop: 10 }}>
                    <div style={{
                      fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)',
                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
                    }}>
                      The strategy
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text)', margin: 0, lineHeight: 1.55 }}>
                      {story.strategy}
                    </p>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{
                      fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)',
                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
                    }}>
                      What the bot saw
                    </div>
                    <p style={{
                      fontSize: 11.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5,
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                      background: 'var(--surface)', padding: '6px 8px', borderRadius: 6,
                    }}>
                      {trade.reason}
                    </p>
                  </div>

                  <div style={{
                    marginTop: 10, padding: '8px 10px',
                    background: won ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${won ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    borderRadius: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {won ? <TrendingUp size={11} color="#16A34A" /> : <TrendingDown size={11} color="#DC2626" />}
                      <span style={{ fontSize: 11, fontWeight: 600, color: won ? '#16A34A' : '#DC2626' }}>
                        Outcome: {won ? 'won' : 'lost'} ${pnlAbs.toFixed(2)} on a ${trade.total.toFixed(2)} position
                      </span>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-2)', marginTop: 3 }}>
                      That&apos;s {((pnlAbs / trade.total) * 100).toFixed(2)}% on this trade.
                    </div>
                  </div>

                  <div style={{
                    marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 6,
                  }}>
                    <Lightbulb size={12} color="#F59E0B" style={{ marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                        Lesson
                      </div>
                      <p style={{ fontSize: 11.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                        {story.lesson}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {stories.length > 0 && (
        <div style={{
          marginTop: 12, padding: 10,
          background: 'var(--morning)', borderRadius: 8,
          fontSize: 11, color: 'var(--text-2)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <BookOpen size={12} color="var(--accent)" />
          <span>
            Every trade is a lesson. Watch what works for your bot — those are real signals
            that work in real markets.
          </span>
        </div>
      )}
    </div>
  )
}
