import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getAllAssets, isUsMarketOpen } from '@/lib/market-data'
import { rankSignals } from '@/lib/trading-signals'

interface PortfolioRow {
  last_run_at: string | null
  total_trades_run: number | null
  cash: number
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: portfolioRaw } = await supabase
    .from('paper_portfolio')
    .select('last_run_at, total_trades_run, cash')
    .eq('user_id', user.id)
    .single()

  const portfolio = portfolioRaw as PortfolioRow | null

  // Get current signals (lightweight — used to show "scanning X assets")
  const assets = await getAllAssets()
  const signals = rankSignals(assets)
  const topBuys = signals.filter((s) => s.action === 'BUY').slice(0, 3)
  const topSells = signals.filter((s) => s.action === 'SELL').slice(0, 3)

  return NextResponse.json({
    lastRunAt: portfolio?.last_run_at ?? null,
    totalTradesRun: portfolio?.total_trades_run ?? 0,
    assetsScanned: assets.length,
    marketOpen: isUsMarketOpen(),
    topBuys: topBuys.map((s) => ({ symbol: s.asset.symbol, name: s.asset.name, price: s.asset.price, score: s.score, reason: s.reason })),
    topSells: topSells.map((s) => ({ symbol: s.asset.symbol, name: s.asset.name, price: s.asset.price, score: s.score, reason: s.reason })),
  })
}
