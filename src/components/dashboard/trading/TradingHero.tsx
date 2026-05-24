'use client'

import { useState } from 'react'
import { Sparkles, Info, TrendingUp, ShieldCheck, GraduationCap, X } from 'lucide-react'

interface Props {
  netWorth: number
  seed: number
  totalTrades: number
  daysActive: number
  name: string
}

/**
 * Emotional hero at the top of the trading page.
 *
 * Frames what the user is doing — they're not just looking at numbers, they're
 * learning a skill that compounds. The tone is honest (this is paper, you'll
 * lose sometimes, fees in real life eat into this) but encouraging.
 */
export default function TradingHero({ netWorth, seed, totalTrades, daysActive, name }: Props) {
  const pnl = netWorth - seed
  const pnlPct = (pnl / seed) * 100
  const positive = pnl >= 0
  const [showInfo, setShowInfo] = useState(false)

  // S&P 500 comparison — a "what if you'd just bought index" benchmark
  // Rough: ~10%/yr historical avg = 0.0274%/day compounded
  const sp500Equivalent = seed * Math.pow(1 + 0.10, daysActive / 365)
  const sp500Pnl = sp500Equivalent - seed

  // Encouragement message based on status
  const message = (() => {
    if (totalTrades === 0) {
      return `Welcome${name ? `, ${name}` : ''}. Your bot is watching the market right now. The first trade is coming.`
    }
    if (totalTrades < 10) {
      return `${totalTrades} trades in. The bot is calibrating to current conditions — early data is noisy.`
    }
    if (pnl >= 0) {
      return `You're in the green. The bot has shown an edge — but it'll have losing days too. That's normal.`
    }
    if (pnl >= -seed * 0.05) {
      return `Down a bit, but small drawdowns are part of the process. The strategy adapts as it learns from your trades.`
    }
    return `In a drawdown right now. The bot is in recovery mode — smaller positions, only top-quality signals. Be patient.`
  })()

  return (
    <div style={{
      position: 'relative',
      background: positive
        ? 'linear-gradient(135deg, #064E3B 0%, #065F46 50%, #047857 100%)'
        : 'linear-gradient(135deg, #1F2937 0%, #111827 50%, #0F172A 100%)',
      borderRadius: 18,
      padding: '24px 24px 22px',
      color: '#fff',
      overflow: 'hidden',
      boxShadow: '0 10px 32px rgba(0,0,0,0.15)',
    }}>
      {/* Decorative shapes */}
      <div style={{
        position: 'absolute', top: -40, right: -40,
        width: 200, height: 200, borderRadius: '50%',
        background: positive ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)',
        filter: 'blur(40px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -60, left: -30,
        width: 180, height: 180, borderRadius: '50%',
        background: positive ? 'rgba(16,185,129,0.1)' : 'rgba(139,92,246,0.1)',
        filter: 'blur(50px)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, opacity: 0.85 }}>
          <Sparkles size={12} />
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Day {Math.max(1, daysActive)} of your trading journey
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em' }}>
            ${netWorth.toFixed(2)}
          </span>
          <span style={{
            fontSize: 14, fontWeight: 600,
            padding: '3px 9px', borderRadius: 999,
            background: 'rgba(255,255,255,0.18)',
            color: positive ? '#86EFAC' : '#FCA5A5',
          }}>
            {positive ? '+' : '−'}${Math.abs(pnl).toFixed(2)} ({positive ? '+' : ''}{pnlPct.toFixed(2)}%)
          </span>
        </div>

        <p style={{
          fontSize: 13.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55,
          margin: '12px 0 0', maxWidth: 580,
        }}>
          {message}
        </p>

        <div style={{
          display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap',
          fontSize: 11.5, color: 'rgba(255,255,255,0.75)',
        }}>
          <div>
            <div style={{ opacity: 0.65, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trades made</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginTop: 2 }}>{totalTrades}</div>
          </div>
          <div>
            <div style={{ opacity: 0.65, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>vs. S&P 500</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2, color: pnl > sp500Pnl ? '#86EFAC' : '#FCA5A5' }}>
              {pnl > sp500Pnl ? 'Ahead' : 'Behind'} by ${Math.abs(pnl - sp500Pnl).toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ opacity: 0.65, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mode</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginTop: 2 }}>Paper</div>
          </div>
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 10px', borderRadius: 999,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 500, fontFamily: 'inherit', alignSelf: 'flex-end',
            }}
          >
            <Info size={11} /> What is this?
          </button>
        </div>
      </div>

      {/* Info modal */}
      {showInfo && (
        <div
          onClick={() => setShowInfo(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 11000,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 14, padding: 20,
              maxWidth: 520, width: '100%',
              color: 'var(--text)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>About your trading bot</h3>
              <button type="button" onClick={() => setShowInfo(false)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
                color: 'var(--text-3)',
              }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
              <p style={{ marginTop: 0 }}>
                <strong style={{ color: 'var(--text)' }}>This is paper trading.</strong> Real money never moves —
                you started with a simulated ${seed}. The bot uses real market data and real strategies, so
                results approximate what would happen with the same plays on a real account.
              </p>
              <p>
                <strong style={{ color: 'var(--text)' }}>Why paper?</strong> To learn the patterns without risking
                your savings. Watch which strategies actually work for you, see how the math plays out, internalize
                the discipline. The trades you see, the reasoning, the wins and losses — all real signals from real markets.
              </p>
              <p>
                <strong style={{ color: 'var(--text)' }}>What\'s missing in paper?</strong> No slippage (in real life
                prices move while your order fills), no real fees beyond what we simulate (~0.2%), no emotional pressure
                of real money on the line. These DO matter when you switch to real. Plan for them.
              </p>
              <p style={{ marginBottom: 0 }}>
                <strong style={{ color: 'var(--text)' }}>The point:</strong> Build intuition for free. Then start
                small with real money — $50 you can afford to lose — and apply what you&apos;ve learned.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Strategy glossary — bite-sized lessons on key trading concepts.
 * Renders below the trade stories.
 */
export function LearningPanel() {
  const [openId, setOpenId] = useState<string | null>(null)

  const lessons = [
    {
      id: 'rsi',
      title: 'RSI (Relative Strength Index)',
      tldr: 'A 0-100 score of how overbought or oversold an asset is.',
      detail: 'Calculated from recent price changes. Above 70 = overbought (might fall). Below 30 = oversold (might bounce). It\'s not perfect — strong trends keep RSI extreme for hours. Best used WITH other signals, never alone.',
    },
    {
      id: 'vwap',
      title: 'VWAP (Volume-Weighted Avg Price)',
      tldr: 'The "fair price" for today, weighted by trading volume.',
      detail: 'Big institutions use VWAP as a benchmark. Buying below VWAP = getting "value." Selling above = getting a premium. Most professional algorithms reference VWAP because that\'s where the big money lives. When you see price snap back to VWAP, smart money is at work.',
    },
    {
      id: 'ema',
      title: 'EMA (Exponential Moving Average)',
      tldr: 'A trend-following smoothed average — recent prices weigh more.',
      detail: 'EMA9 (fast) above EMA21 (slow) = uptrend. The opposite = downtrend. When they cross, the trend is changing. Trading WITH the trend (long when EMA9 > EMA21) wins more often than fighting it.',
    },
    {
      id: 'stop',
      title: 'Stop loss & take profit',
      tldr: 'Pre-set exit prices that protect your downside and lock in wins.',
      detail: 'Every trade has a stop loss (max acceptable loss, usually 0.4-1%) and a take profit (target, usually 1-2%). The math: even with a 50% win rate, if your average win is 2× your average loss, you make money. Discipline > picking direction.',
    },
    {
      id: 'risk',
      title: 'Position sizing',
      tldr: 'How much capital to put into each trade.',
      detail: 'Pros risk 0.5-2% of total capital per trade. Why so small? Because a 10-trade losing streak (yes, it happens) at 5% per trade wipes out 40% of your money. At 1% per trade you\'d only be down 10%. Survival matters more than max-bet.',
    },
    {
      id: 'fees',
      title: 'Fees & the real cost of trading',
      tldr: 'Every trade costs ~0.1-0.5% just in fees.',
      detail: 'A typical round-trip is 0.2-0.4%. If you do 100 trades on $500, that\'s $100-200 in fees alone. To make money, your average win MINUS your average loss MINUS fees must be positive. This is why most retail day traders lose — fees eat the edge.',
    },
  ]

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <GraduationCap size={16} color="var(--accent)" />
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Trading 101 — concepts your bot uses
        </h3>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
        Click each one. Knowing these gives you intuition for why a trade works (or doesn&apos;t).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        {lessons.map((l) => {
          const open = openId === l.id
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setOpenId(open ? null : l.id)}
              style={{
                textAlign: 'left',
                padding: 12,
                background: open ? 'var(--morning)' : 'var(--surface-2, var(--surface))',
                border: open ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 10,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                {l.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3 }}>
                {l.tldr}
              </div>
              {open && (
                <div style={{
                  fontSize: 11, color: 'var(--text-2)', marginTop: 8,
                  paddingTop: 8, borderTop: '0.5px solid var(--border)',
                  lineHeight: 1.6,
                }}>
                  {l.detail}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Honest "ready for real money?" call-to-action at the bottom of the page.
 *
 * Avoids hype. Frames real trading as a graduated step with concrete prep
 * (small starting amount, understand fees, real broker recommendations).
 */
export function RealMoneyCTA({ totalTrades, pnl }: { totalTrades: number; pnl: number }) {
  const ready = totalTrades >= 50  // enough trades to have seen patterns

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)',
      borderRadius: 16, padding: 22,
      color: '#fff',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -50, right: -40,
        width: 200, height: 200, borderRadius: '50%',
        background: 'rgba(99,102,241,0.3)', filter: 'blur(60px)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, opacity: 0.85 }}>
          <ShieldCheck size={13} />
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            When you&apos;re ready for real money
          </span>
        </div>

        {ready ? (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
              You&apos;ve seen {totalTrades} trades. You&apos;re building real intuition.
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: '0 0 14px', maxWidth: 600 }}>
              When you&apos;re ready to apply this with real money, here&apos;s how to graduate
              without blowing up your savings:
            </p>
          </>
        ) : (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
              Keep watching. Real money comes later.
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: '0 0 14px', maxWidth: 600 }}>
              You&apos;ve made {totalTrades} trades so far. Most people need 100+ before patterns
              click. Read the trade stories above, watch the bot constellation,
              learn the indicators — when you&apos;ve internalized them, you&apos;re ready.
            </p>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 12 }}>
          <RealStep n="1" title="Start with $50–100" body="Money you can lose without affecting rent. Small numbers train the same skills as large ones." />
          <RealStep n="2" title="Use a low-fee broker" body="Crypto: Coinbase Advanced, Kraken (~0.1-0.4% fees). Stocks: Fidelity, Schwab, Robinhood (commission-free)." />
          <RealStep n="3" title="Trade the same setups" body="The strategies you see your bot using are real and work in real markets. Apply them with discipline." />
          <RealStep n="4" title="Track every trade" body="Write down why you entered, what happened, what you learned. The patterns become visible after 20-30 trades." />
        </div>

        <div style={{
          padding: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 8,
          fontSize: 11, color: 'rgba(255,255,255,0.8)', lineHeight: 1.55,
        }}>
          <strong style={{ color: '#fff' }}>Honest reality:</strong> Even a great strategy returns
          1-3% per month for retail. Annualized that&apos;s 12-43% — beats every savings account
          and most index funds. But it requires patience, discipline, and the willingness to lose
          on individual trades. Anyone promising more (or "every second" trading magic) is
          selling something.
        </div>
      </div>
    </div>
  )
}

function RealStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div style={{
      padding: 10, background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          background: 'rgba(255,255,255,0.18)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
        }}>{n}</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
      </div>
      <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.8)', margin: 0, lineHeight: 1.5 }}>
        {body}
      </p>
    </div>
  )
}

// Suppress unused-import warning while keeping the icon available for future
void TrendingUp
