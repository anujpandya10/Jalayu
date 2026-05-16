import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getOHLC } from '@/lib/yahoo-finance'

interface AutoTradeResult {
  symbol: string
  action: 'BUY' | 'SELL'
  shares: number
  price: number
  reason: string
}

function sma(arr: number[], period: number): number {
  const slice = arr.slice(-period)
  if (slice.length < period) return 0
  return slice.reduce((a, b) => a + b, 0) / period
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get watchlist
  const { data: watchlist } = await supabase
    .from('trading_watchlist')
    .select('*')
    .eq('user_id', user.id)

  if (!watchlist || watchlist.length === 0) {
    return NextResponse.json({ executed: [], message: 'Watchlist is empty' })
  }

  // Get portfolio
  let { data: portfolio } = await supabase
    .from('paper_portfolio')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!portfolio) {
    const { data: created } = await supabase
      .from('paper_portfolio')
      .insert({ user_id: user.id, cash: 500.00 })
      .select()
      .single()
    portfolio = created
  }

  if (!portfolio) {
    return NextResponse.json({ error: 'Portfolio not found' }, { status: 500 })
  }

  // Get current positions
  const { data: positions } = await supabase
    .from('paper_positions')
    .select('*')
    .eq('user_id', user.id)

  const positionMap = new Map<string, { shares: number; avg_buy_price: number }>()
  for (const pos of positions ?? []) {
    positionMap.set(pos.symbol, { shares: pos.shares, avg_buy_price: pos.avg_buy_price })
  }

  const executed: AutoTradeResult[] = []
  let currentCash: number = portfolio.cash

  for (const item of watchlist) {
    const symbol: string = item.symbol
    try {
      const ohlc = await getOHLC(symbol, '2mo')
      const closes = ohlc.closes
      if (closes.length < 20) continue

      const s5 = sma(closes, 5)
      const s20 = sma(closes, 20)
      const price = ohlc.price
      const name = ohlc.name

      const hasPosition = positionMap.has(symbol)

      if (s5 > s20 && !hasPosition) {
        // BUY signal
        const budget = currentCash * 0.15
        if (budget < 10) continue
        const shares = parseFloat((budget / price).toFixed(6))
        if (shares <= 0) continue
        const total = parseFloat((price * shares).toFixed(2))

        const reason = `SMA5 ($${s5.toFixed(2)}) crossed above SMA20 ($${s20.toFixed(2)}) — upward momentum`

        const { error } = await supabase.from('paper_trades').insert({
          user_id: user.id,
          symbol,
          name,
          action: 'BUY',
          shares,
          price: parseFloat(price.toFixed(4)),
          total,
          pnl: null,
          reason,
          auto: true,
        })

        if (!error) {
          currentCash = parseFloat((currentCash - total).toFixed(2))

          // Upsert position
          const existing = positionMap.get(symbol)
          if (existing) {
            const newShares = existing.shares + shares
            const newAvg = parseFloat(((existing.avg_buy_price * existing.shares + price * shares) / newShares).toFixed(4))
            await supabase
              .from('paper_positions')
              .update({ shares: newShares, avg_buy_price: newAvg, updated_at: new Date().toISOString() })
              .eq('user_id', user.id)
              .eq('symbol', symbol)
            positionMap.set(symbol, { shares: newShares, avg_buy_price: newAvg })
          } else {
            await supabase.from('paper_positions').insert({
              user_id: user.id,
              symbol,
              name,
              shares,
              avg_buy_price: parseFloat(price.toFixed(4)),
            })
            positionMap.set(symbol, { shares, avg_buy_price: price })
          }

          executed.push({ symbol, action: 'BUY', shares, price, reason })
        }
      } else if (s5 < s20 && hasPosition) {
        // SELL signal
        const position = positionMap.get(symbol)!
        const shares = position.shares
        const total = parseFloat((price * shares).toFixed(2))
        const pnl = parseFloat(((price - position.avg_buy_price) * shares).toFixed(2))
        const reason = `SMA5 ($${s5.toFixed(2)}) dropped below SMA20 ($${s20.toFixed(2)}) — momentum reversal`

        const { error } = await supabase.from('paper_trades').insert({
          user_id: user.id,
          symbol,
          name,
          action: 'SELL',
          shares,
          price: parseFloat(price.toFixed(4)),
          total,
          pnl,
          reason,
          auto: true,
        })

        if (!error) {
          currentCash = parseFloat((currentCash + total).toFixed(2))
          await supabase.from('paper_positions').delete().eq('user_id', user.id).eq('symbol', symbol)
          positionMap.delete(symbol)
          executed.push({ symbol, action: 'SELL', shares, price, reason })
        }
      }
    } catch {
      // Skip symbols that fail to fetch
      continue
    }
  }

  // Update cash in portfolio
  if (executed.length > 0) {
    await supabase
      .from('paper_portfolio')
      .update({ cash: currentCash, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
  }

  return NextResponse.json({ executed })
}
