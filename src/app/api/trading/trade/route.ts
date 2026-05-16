import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getQuote } from '@/lib/yahoo-finance'

interface TradeBody {
  symbol: string
  action: 'BUY' | 'SELL'
  shares: number
  reason?: string
  auto?: boolean
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: TradeBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { symbol, action, shares, reason, auto = false } = body
  if (!symbol || !action || !shares || shares <= 0) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }
  if (action !== 'BUY' && action !== 'SELL') {
    return NextResponse.json({ error: 'action must be BUY or SELL' }, { status: 400 })
  }

  // Fetch current price
  let price: number
  let name: string
  try {
    const quote = await getQuote(symbol.toUpperCase())
    price = quote.price
    name = quote.name
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Price fetch failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const total = parseFloat((price * shares).toFixed(2))

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

  if (action === 'BUY') {
    if (portfolio.cash < total) {
      return NextResponse.json({ error: `Insufficient cash. Have $${portfolio.cash.toFixed(2)}, need $${total.toFixed(2)}` }, { status: 400 })
    }

    // Update cash
    const { error: cashError } = await supabase
      .from('paper_portfolio')
      .update({ cash: parseFloat((portfolio.cash - total).toFixed(2)), updated_at: new Date().toISOString() })
      .eq('user_id', user.id)

    if (cashError) return NextResponse.json({ error: 'Failed to update cash' }, { status: 500 })

    // Upsert position (weighted average cost)
    const { data: existing } = await supabase
      .from('paper_positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('symbol', symbol.toUpperCase())
      .single()

    if (existing) {
      const newShares = existing.shares + shares
      const newAvg = parseFloat(((existing.avg_buy_price * existing.shares + price * shares) / newShares).toFixed(4))
      await supabase
        .from('paper_positions')
        .update({ shares: newShares, avg_buy_price: newAvg, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('paper_positions').insert({
        user_id: user.id,
        symbol: symbol.toUpperCase(),
        name,
        shares,
        avg_buy_price: parseFloat(price.toFixed(4)),
      })
    }

    // Record trade
    await supabase.from('paper_trades').insert({
      user_id: user.id,
      symbol: symbol.toUpperCase(),
      name,
      action: 'BUY',
      shares,
      price: parseFloat(price.toFixed(4)),
      total,
      pnl: null,
      reason: reason ?? null,
      auto,
    })
  } else {
    // SELL
    const { data: position } = await supabase
      .from('paper_positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('symbol', symbol.toUpperCase())
      .single()

    if (!position || position.shares < shares) {
      return NextResponse.json({
        error: `Insufficient shares. Have ${position?.shares ?? 0}, trying to sell ${shares}`,
      }, { status: 400 })
    }

    const pnl = parseFloat(((price - position.avg_buy_price) * shares).toFixed(2))
    const newCash = parseFloat((portfolio.cash + total).toFixed(2))

    await supabase
      .from('paper_portfolio')
      .update({ cash: newCash, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)

    const remainingShares = parseFloat((position.shares - shares).toFixed(6))
    if (remainingShares < 0.000001) {
      await supabase.from('paper_positions').delete().eq('id', position.id)
    } else {
      await supabase
        .from('paper_positions')
        .update({ shares: remainingShares, updated_at: new Date().toISOString() })
        .eq('id', position.id)
    }

    await supabase.from('paper_trades').insert({
      user_id: user.id,
      symbol: symbol.toUpperCase(),
      name,
      action: 'SELL',
      shares,
      price: parseFloat(price.toFixed(4)),
      total,
      pnl,
      reason: reason ?? null,
      auto,
    })
  }

  return NextResponse.json({ success: true, symbol: symbol.toUpperCase(), action, shares, price, total })
}
