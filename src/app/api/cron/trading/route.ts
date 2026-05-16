import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getAllAssets } from '@/lib/market-data'
import { rankSignals } from '@/lib/trading-signals'

const TAKE_PROFIT_PCT = 0.015  // +1.5%
const STOP_LOSS_PCT   = 0.010  // -1.0%
const POSITION_SIZE_PCT = 0.20 // 20% of cash per trade
const MIN_TRADE_USD = 5

function verifyCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

interface PortfolioRow {
  user_id: string
  cash: number
  total_trades_run?: number
}

interface PositionRow {
  id: string
  symbol: string
  name: string | null
  shares: number
  avg_buy_price: number
  take_profit_price: number | null
  stop_loss_price: number | null
}

interface PositionSymbolRow {
  symbol: string
}

export async function GET(req: Request) {
  if (!verifyCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 })

  // Fetch all market data once, reuse for all users
  const assets = await getAllAssets()
  const signals = rankSignals(assets)
  const assetPriceMap = new Map(assets.map((a) => [a.symbol, a.price]))

  // Get all users with portfolios
  const { data: portfolios } = await supabase.from('paper_portfolio').select('user_id, cash, total_trades_run')
  if (!portfolios || portfolios.length === 0) return NextResponse.json({ processed: 0 })

  let totalTrades = 0

  for (const portfolioRaw of portfolios) {
    const portfolio = portfolioRaw as PortfolioRow
    const userId: string = portfolio.user_id
    let cash: number = Number(portfolio.cash)

    try {
      // Get open positions
      const { data: positionsRaw } = await supabase
        .from('paper_positions')
        .select('*')
        .eq('user_id', userId)

      const positions = (positionsRaw ?? []) as PositionRow[]

      let tradesThisRun = 0

      // ── STEP 1: Check take-profit and stop-loss on open positions ──
      for (const pos of positions) {
        const currentPrice = assetPriceMap.get(pos.symbol)
        if (!currentPrice) continue

        const tp = Number(pos.take_profit_price)
        const sl = Number(pos.stop_loss_price)
        const shares = Number(pos.shares)
        let shouldSell = false
        let sellReason = ''

        if (tp && currentPrice >= tp) {
          shouldSell = true
          sellReason = `Take profit: price $${currentPrice.toFixed(4)} hit target $${tp.toFixed(4)}`
        } else if (sl && currentPrice <= sl) {
          shouldSell = true
          sellReason = `Stop loss: price $${currentPrice.toFixed(4)} hit floor $${sl.toFixed(4)}`
        }

        if (shouldSell) {
          const total = parseFloat((currentPrice * shares).toFixed(2))
          const pnl = parseFloat(((currentPrice - Number(pos.avg_buy_price)) * shares).toFixed(2))

          const { error } = await supabase.from('paper_trades').insert({
            user_id: userId, symbol: pos.symbol, name: pos.name,
            action: 'SELL', shares, price: currentPrice, total, pnl,
            reason: sellReason, auto: true,
          })

          if (!error) {
            await supabase.from('paper_positions').delete().eq('id', pos.id)
            cash = parseFloat((cash + total).toFixed(2))
            tradesThisRun++
          }
        }
      }

      // ── STEP 2: Find best BUY opportunities ──
      // Get updated positions after sells
      const { data: currentPositionsRaw } = await supabase
        .from('paper_positions').select('symbol').eq('user_id', userId)
      const currentPositions = (currentPositionsRaw ?? []) as PositionSymbolRow[]
      const heldSymbols = new Set(currentPositions.map((p) => p.symbol))

      // Top 2 buy signals we don't already hold
      const buySignals = signals
        .filter((s) => s.action === 'BUY_LONG' && !heldSymbols.has(s.asset.symbol))
        .slice(0, 2)

      for (const signal of buySignals) {
        const budget = cash * POSITION_SIZE_PCT
        if (budget < MIN_TRADE_USD) continue

        const price = signal.asset.price
        const shares = parseFloat((budget / price).toFixed(8))
        const total = parseFloat((price * shares).toFixed(2))
        const tpPrice = parseFloat((price * (1 + TAKE_PROFIT_PCT)).toFixed(6))
        const slPrice = parseFloat((price * (1 - STOP_LOSS_PCT)).toFixed(6))
        const reason = `Buy signal — ${signal.reason} (score: ${signal.score.toFixed(1)})`

        const { error: tradeError } = await supabase.from('paper_trades').insert({
          user_id: userId, symbol: signal.asset.symbol, name: signal.asset.name,
          action: 'BUY', shares, price, total, pnl: null, reason, auto: true,
        })

        if (!tradeError) {
          await supabase.from('paper_positions').insert({
            user_id: userId, symbol: signal.asset.symbol, name: signal.asset.name,
            shares, avg_buy_price: price, asset_type: signal.asset.assetType,
            take_profit_price: tpPrice, stop_loss_price: slPrice,
          })
          cash = parseFloat((cash - total).toFixed(2))
          heldSymbols.add(signal.asset.symbol)
          tradesThisRun++
        }
      }

      // Update portfolio cash + last_run_at
      await supabase.from('paper_portfolio').update({
        cash,
        last_run_at: new Date().toISOString(),
        total_trades_run: (portfolio.total_trades_run ?? 0) + tradesThisRun,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId)

      totalTrades += tradesThisRun
    } catch (err) {
      console.error(`[cron/trading] user ${userId} error:`, err)
    }
  }

  return NextResponse.json({ processed: portfolios.length, totalTrades, assetsScanned: assets.length })
}
