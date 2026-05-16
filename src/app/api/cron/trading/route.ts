import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getAllAssets } from '@/lib/market-data'
import { runTradingTick } from '@/lib/trading-engine'

function verifyCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

interface PortfolioRow {
  user_id: string
  auto_trading_enabled?: boolean | null
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 500 })
  }

  const assets = await getAllAssets()

  const { data: portfolios } = await supabase
    .from('paper_portfolio')
    .select('user_id, auto_trading_enabled')

  if (!portfolios?.length) {
    return NextResponse.json({ processed: 0, message: 'No portfolios' })
  }

  let totalTrades = 0
  let processed = 0
  const errors: string[] = []

  for (const row of portfolios as PortfolioRow[]) {
    if (row.auto_trading_enabled === false) continue

    try {
      const result = await runTradingTick(supabase, row.user_id, {
        assets,
        force: true,
      })
      totalTrades += result.tradesExecuted
      processed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${row.user_id}: ${msg}`)
      console.error(`[cron/trading] user ${row.user_id}:`, err)
    }
  }

  return NextResponse.json({
    processed,
    totalTrades,
    assetsScanned: assets.length,
    errors: errors.length ? errors : undefined,
  })
}
