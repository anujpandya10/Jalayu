import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getQuote } from '@/lib/yahoo-finance'

interface PositionRow {
  symbol: string
  name: string | null
  shares: number
  avg_buy_price: number
  asset_type: string | null
  take_profit_price: number | null
  stop_loss_price: number | null
  direction?: string | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Auto-create portfolio if missing
  let { data: portfolio, error: pfError } = await supabase
    .from('paper_portfolio')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (pfError || !portfolio) {
    const { data: created, error: createError } = await supabase
      .from('paper_portfolio')
      .insert({ user_id: user.id, cash: 500.00 })
      .select()
      .single()
    if (createError) {
      return NextResponse.json({ error: 'Failed to create portfolio' }, { status: 500 })
    }
    portfolio = created
  }

  const { data: positionsRaw } = await supabase
    .from('paper_positions')
    .select('*')
    .eq('user_id', user.id)

  const positions = (positionsRaw ?? []) as PositionRow[]
  const cash: number = portfolio.cash

  const enrichedPositions = await Promise.all(
    positions.map(async (pos) => {
      try {
        const quote = await getQuote(pos.symbol)
        const currentPrice = quote.price
        const isShort = pos.direction === 'SHORT'
        const value = currentPrice * pos.shares
        const cost = pos.avg_buy_price * pos.shares
        // For SHORT: profit = price fell below entry
        const pnl = isShort
          ? (pos.avg_buy_price - currentPrice) * pos.shares
          : value - cost
        const pnlPct = cost !== 0 ? (pnl / cost) * 100 : 0
        return {
          symbol: pos.symbol,
          name: pos.name ?? quote.name,
          shares: pos.shares,
          avgBuyPrice: pos.avg_buy_price,
          currentPrice,
          value,
          pnl,
          pnlPct,
          assetType: pos.asset_type ?? 'stock',
          direction: pos.direction ?? 'LONG',
          takeProfitPrice: pos.take_profit_price ?? null,
          stopLossPrice: pos.stop_loss_price ?? null,
        }
      } catch {
        return {
          symbol: pos.symbol,
          name: pos.name ?? pos.symbol,
          shares: pos.shares,
          avgBuyPrice: pos.avg_buy_price,
          currentPrice: pos.avg_buy_price,
          value: pos.avg_buy_price * pos.shares,
          pnl: 0,
          pnlPct: 0,
          assetType: pos.asset_type ?? 'stock',
          direction: pos.direction ?? 'LONG',
          takeProfitPrice: pos.take_profit_price ?? null,
          stopLossPrice: pos.stop_loss_price ?? null,
        }
      }
    }),
  )

  const positionsValue = enrichedPositions.reduce((sum, p) => sum + p.value, 0)
  const totalValue = cash + positionsValue
  const totalPnL = totalValue - 500
  const totalPnLPct = (totalPnL / 500) * 100

  return NextResponse.json({
    cash,
    positions: enrichedPositions,
    totalValue,
    totalPnL,
    totalPnLPct,
  })
}
