import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getOHLC } from '@/lib/yahoo-finance'

function verifyCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

/** US market hours: Mon–Fri 09:30–16:00 ET = 13:30–20:00 UTC */
function isMarketOpen(): boolean {
  const now = new Date()
  const dayUTC = now.getUTCDay() // 0=Sun, 6=Sat
  if (dayUTC === 0 || dayUTC === 6) return false
  const hUTC = now.getUTCHours()
  const mUTC = now.getUTCMinutes()
  const totalMin = hUTC * 60 + mUTC
  return totalMin >= 13 * 60 + 30 && totalMin < 20 * 60
}

function sma(arr: number[], period: number): number {
  const slice = arr.slice(-period)
  if (slice.length < period) return 0
  return slice.reduce((a, b) => a + b, 0) / period
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isMarketOpen()) {
    return NextResponse.json({ skipped: true, reason: 'Market closed' })
  }

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 500 })
  }

  // Get all users with a portfolio
  const { data: portfolios } = await supabase
    .from('paper_portfolio')
    .select('user_id, cash')

  if (!portfolios || portfolios.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  const results: { userId: string; trades: number; error?: string }[] = []

  for (const portfolio of portfolios) {
    const userId: string = portfolio.user_id
    let cash: number = Number(portfolio.cash)

    try {
      // Get this user's watchlist
      const { data: watchlist } = await supabase
        .from('trading_watchlist')
        .select('symbol, name')
        .eq('user_id', userId)

      if (!watchlist || watchlist.length === 0) continue

      // Get current positions
      const { data: positions } = await supabase
        .from('paper_positions')
        .select('symbol, shares, avg_buy_price')
        .eq('user_id', userId)

      const posMap = new Map<string, { shares: number; avg_buy_price: number }>()
      for (const p of positions ?? []) {
        posMap.set(p.symbol, { shares: Number(p.shares), avg_buy_price: Number(p.avg_buy_price) })
      }

      let tradesThisUser = 0

      for (const item of watchlist) {
        const symbol: string = item.symbol
        try {
          const ohlc = await getOHLC(symbol, '2mo')
          const closes = ohlc.closes
          if (closes.length < 20) continue

          const s5 = sma(closes, 5)
          const s20 = sma(closes, 20)
          const price = ohlc.price
          const name: string = ohlc.name || item.name || symbol
          const hasPosition = posMap.has(symbol)

          if (s5 > s20 && !hasPosition) {
            // BUY signal — 15% of available cash
            const budget = cash * 0.15
            if (budget < 10) continue
            const shares = parseFloat((budget / price).toFixed(6))
            const total = parseFloat((price * shares).toFixed(2))
            const reason = `Auto: SMA5 $${s5.toFixed(2)} > SMA20 $${s20.toFixed(2)} — upward momentum`

            const { error } = await supabase.from('paper_trades').insert({
              user_id: userId, symbol, name, action: 'BUY',
              shares, price: parseFloat(price.toFixed(4)), total,
              pnl: null, reason, auto: true,
            })

            if (!error) {
              cash = parseFloat((cash - total).toFixed(2))
              const existing = posMap.get(symbol)
              if (existing) {
                const newShares = existing.shares + shares
                const newAvg = parseFloat(((existing.avg_buy_price * existing.shares + price * shares) / newShares).toFixed(4))
                await supabase.from('paper_positions')
                  .update({ shares: newShares, avg_buy_price: newAvg, updated_at: new Date().toISOString() })
                  .eq('user_id', userId).eq('symbol', symbol)
                posMap.set(symbol, { shares: newShares, avg_buy_price: newAvg })
              } else {
                await supabase.from('paper_positions').insert({
                  user_id: userId, symbol, name,
                  shares, avg_buy_price: parseFloat(price.toFixed(4)),
                })
                posMap.set(symbol, { shares, avg_buy_price: price })
              }
              tradesThisUser++
            }
          } else if (s5 < s20 && hasPosition) {
            // SELL signal — full position
            const position = posMap.get(symbol)!
            const shares = position.shares
            const total = parseFloat((price * shares).toFixed(2))
            const pnl = parseFloat(((price - position.avg_buy_price) * shares).toFixed(2))
            const reason = `Auto: SMA5 $${s5.toFixed(2)} < SMA20 $${s20.toFixed(2)} — momentum reversal`

            const { error } = await supabase.from('paper_trades').insert({
              user_id: userId, symbol, name, action: 'SELL',
              shares, price: parseFloat(price.toFixed(4)), total,
              pnl, reason, auto: true,
            })

            if (!error) {
              cash = parseFloat((cash + total).toFixed(2))
              await supabase.from('paper_positions').delete()
                .eq('user_id', userId).eq('symbol', symbol)
              posMap.delete(symbol)
              tradesThisUser++
            }
          }
        } catch {
          // One symbol failing shouldn't stop others
          continue
        }
      }

      // Update cash if any trades fired
      if (tradesThisUser > 0) {
        await supabase.from('paper_portfolio')
          .update({ cash, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
      }

      results.push({ userId, trades: tradesThisUser })
    } catch (err) {
      results.push({ userId, trades: 0, error: String(err) })
    }
  }

  const totalTrades = results.reduce((s, r) => s + r.trades, 0)
  console.log(`[cron/trading] ${portfolios.length} users, ${totalTrades} trades fired`)

  return NextResponse.json({ processed: portfolios.length, totalTrades, results })
}
