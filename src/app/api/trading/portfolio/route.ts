import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getAllAssets, enrichPriceMapForPositions } from '@/lib/market-data'
import { SEED_CAPITAL } from '@/lib/trading-config'

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

  let { data: portfolio, error: pfError } = await supabase
    .from('paper_portfolio')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (pfError || !portfolio) {
    const { data: created, error: createError } = await supabase
      .from('paper_portfolio')
      .insert({ user_id: user.id, cash: SEED_CAPITAL })
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
  const cash: number = Number(portfolio.cash)

  // Same price source as /api/trading/tick (CoinGecko + Frankfurter + Yahoo)
  const assets = await getAllAssets()
  let priceMap = new Map(assets.map((a) => [a.symbol, a.price]))
  priceMap = await enrichPriceMapForPositions(priceMap, positions)
  const nameMap = new Map(assets.map((a) => [a.symbol, a.name]))

  let positionsEquity = 0

  const enrichedPositions = positions.map((pos) => {
    const shares = Number(pos.shares)
    const avgBuyPrice = Number(pos.avg_buy_price)
    const cost = avgBuyPrice * shares
    const currentPrice = priceMap.get(pos.symbol) ?? avgBuyPrice
    const isShort = pos.direction === 'SHORT'

    const pnl = isShort
      ? (avgBuyPrice - currentPrice) * shares
      : (currentPrice - avgBuyPrice) * shares
    const pnlPct = cost !== 0 ? (pnl / cost) * 100 : 0

    // Long: market value of shares. Short: collateral + unrealized P&L
    const equity = isShort ? cost + pnl : currentPrice * shares
    positionsEquity += equity

    return {
      symbol: pos.symbol,
      name: pos.name ?? nameMap.get(pos.symbol) ?? pos.symbol,
      shares,
      avgBuyPrice,
      currentPrice,
      value: equity,
      pnl,
      pnlPct,
      assetType: pos.asset_type ?? 'crypto',
      direction: pos.direction ?? 'LONG',
      takeProfitPrice: pos.take_profit_price ?? null,
      stopLossPrice: pos.stop_loss_price ?? null,
    }
  })

  const totalValue = cash + positionsEquity
  const totalPnL = totalValue - SEED_CAPITAL
  const totalPnLPct = (totalPnL / SEED_CAPITAL) * 100

  return NextResponse.json({
    cash,
    positions: enrichedPositions,
    totalValue,
    totalPnL,
    totalPnLPct,
    seedCapital: SEED_CAPITAL,
  })
}
