/**
 *   POST /api/academy/trade
 *   body (open):  { symbol, intent: 'OPEN', direction, dollarAmount, declaredSetupTag?, declaredStopLoss?, declaredTakeProfit?, thesis? }
 *   body (close): { symbol, intent: 'CLOSE' }
 *
 * Executes immediately at the live quote price against academy_* tables
 * (fully isolated from the auto-bot's paper_* tables), then runs the
 * matching coach review inline. If the coach call fails, the trade still
 * stands — only the commentary is missing — since the trade itself already
 * committed cash/position/history changes.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getQuote } from '@/lib/yahoo-finance'
import { scoreAssetFull } from '@/lib/trading-signals'
import type { AssetData } from '@/lib/market-data'
import { runEntryReview, runExitReview, CoachEvaluationError } from '@/lib/academy-coach'
import { ACADEMY_SEED_CAPITAL, ACADEMY_MIN_TRADE_USD } from '@/lib/academy-config'

interface TradeBody {
  symbol?: string
  intent?: 'OPEN' | 'CLOSE'
  direction?: 'LONG' | 'SHORT'
  dollarAmount?: number
  declaredSetupTag?: string | null
  declaredStopLoss?: number | null
  declaredTakeProfit?: number | null
  thesis?: string | null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as TradeBody
  const symbol = (body.symbol ?? '').toUpperCase().trim()
  if (!/^[A-Z]{1,10}$/.test(symbol)) {
    return NextResponse.json({ error: 'Enter a valid ticker symbol' }, { status: 400 })
  }
  if (body.intent !== 'OPEN' && body.intent !== 'CLOSE') {
    return NextResponse.json({ error: 'intent must be OPEN or CLOSE' }, { status: 400 })
  }

  let quote
  try {
    quote = await getQuote(symbol)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch quote'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const { data: existingPosition } = await supabase
    .from('academy_positions')
    .select('*')
    .eq('user_id', user.id)
    .eq('symbol', symbol)
    .maybeSingle()

  let { data: portfolio } = await supabase
    .from('academy_portfolio')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (!portfolio) {
    const { data: created } = await supabase
      .from('academy_portfolio')
      .insert({ user_id: user.id, cash: ACADEMY_SEED_CAPITAL })
      .select()
      .single()
    portfolio = created
  }
  if (!portfolio) {
    return NextResponse.json({ error: 'Failed to load portfolio' }, { status: 500 })
  }
  let cash = Number(portfolio.cash)

  const asset: AssetData = {
    symbol: quote.symbol, name: quote.name, price: quote.price,
    change24h: quote.changePct, change7d: 0, assetType: 'stock',
  }
  const signal = await scoreAssetFull(asset)

  // ── OPEN ──────────────────────────────────────────────────────────────────
  if (body.intent === 'OPEN') {
    if (existingPosition) {
      return NextResponse.json(
        { error: `Already have an open ${existingPosition.direction} position in ${symbol} — close it first.` },
        { status: 409 },
      )
    }
    const direction: 'LONG' | 'SHORT' = body.direction === 'SHORT' ? 'SHORT' : 'LONG'
    const dollarAmount = Number(body.dollarAmount)
    if (!Number.isFinite(dollarAmount) || dollarAmount < ACADEMY_MIN_TRADE_USD) {
      return NextResponse.json({ error: `Minimum trade size is $${ACADEMY_MIN_TRADE_USD}` }, { status: 400 })
    }
    if (dollarAmount > cash) {
      return NextResponse.json({ error: 'Not enough cash for that trade size' }, { status: 400 })
    }

    const price = quote.price
    const shares = parseFloat((dollarAmount / price).toFixed(6))
    const total = parseFloat((price * shares).toFixed(2))

    const { data: trade, error: tradeError } = await supabase
      .from('academy_trades')
      .insert({
        user_id: user.id,
        symbol, name: quote.name,
        action: 'BUY',
        direction,
        shares, price, total, pnl: null,
        declared_setup_tag: body.declaredSetupTag ?? null,
        declared_stop_loss: body.declaredStopLoss ?? null,
        declared_take_profit: body.declaredTakeProfit ?? null,
        thesis: body.thesis ?? null,
        engine_score_at_trade: signal.score,
        engine_setup_at_trade: signal.setupTag,
      })
      .select()
      .single()
    if (tradeError || !trade) {
      return NextResponse.json({ error: tradeError?.message ?? 'Failed to record trade' }, { status: 500 })
    }

    const { error: posError } = await supabase.from('academy_positions').insert({
      user_id: user.id,
      symbol, name: quote.name, direction,
      shares, avg_entry_price: price,
      declared_setup_tag: body.declaredSetupTag ?? null,
      declared_stop_loss: body.declaredStopLoss ?? null,
      declared_take_profit: body.declaredTakeProfit ?? null,
      thesis: body.thesis ?? null,
      entry_trade_id: trade.id,
    })
    if (posError) {
      return NextResponse.json({ error: posError.message }, { status: 500 })
    }

    cash = parseFloat((cash - total).toFixed(2))
    await supabase.from('academy_portfolio')
      .update({ cash, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)

    let review = null
    let reviewError: string | null = null
    try {
      review = await runEntryReview(supabase, user.id, {
        tradeId: trade.id, symbol, name: quote.name, direction,
        entryPrice: price, shares,
        declaredSetupTag: body.declaredSetupTag,
        declaredStopLoss: body.declaredStopLoss,
        declaredTakeProfit: body.declaredTakeProfit,
        thesis: body.thesis,
      })
    } catch (err) {
      reviewError = err instanceof CoachEvaluationError ? err.message : 'Coach feedback unavailable for this trade'
      console.warn('[academy/trade] entry review failed:', err)
    }

    return NextResponse.json({ trade, review, reviewError, cash })
  }

  // ── CLOSE ─────────────────────────────────────────────────────────────────
  if (!existingPosition) {
    return NextResponse.json({ error: `No open position in ${symbol}` }, { status: 404 })
  }

  const direction: 'LONG' | 'SHORT' = existingPosition.direction === 'SHORT' ? 'SHORT' : 'LONG'
  const shares = Number(existingPosition.shares)
  const entryPrice = Number(existingPosition.avg_entry_price)
  const exitPrice = quote.price
  const pnlFinal = parseFloat((
    direction === 'LONG'
      ? (exitPrice - entryPrice) * shares
      : (entryPrice - exitPrice) * shares
  ).toFixed(2))
  const total = parseFloat((exitPrice * shares).toFixed(2))
  const holdSecs = (Date.now() - new Date(existingPosition.created_at).getTime()) / 1000

  const { data: trade, error: tradeError } = await supabase
    .from('academy_trades')
    .insert({
      user_id: user.id,
      symbol, name: existingPosition.name ?? quote.name,
      action: direction === 'SHORT' ? 'BUY' : 'SELL',
      direction,
      shares, price: exitPrice, total, pnl: pnlFinal,
      declared_setup_tag: existingPosition.declared_setup_tag,
      declared_stop_loss: existingPosition.declared_stop_loss,
      declared_take_profit: existingPosition.declared_take_profit,
      thesis: existingPosition.thesis,
      engine_score_at_trade: signal.score,
      engine_setup_at_trade: signal.setupTag,
      entry_trade_id: existingPosition.entry_trade_id,
    })
    .select()
    .single()
  if (tradeError || !trade) {
    return NextResponse.json({ error: tradeError?.message ?? 'Failed to record trade' }, { status: 500 })
  }

  await supabase.from('academy_positions').delete().eq('id', existingPosition.id)

  cash = direction === 'SHORT'
    ? parseFloat((cash + entryPrice * shares + pnlFinal).toFixed(2))
    : parseFloat((cash + total).toFixed(2))
  await supabase.from('academy_portfolio')
    .update({ cash, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  let review = null
  let reviewError: string | null = null
  try {
    review = await runExitReview(supabase, user.id, {
      tradeId: trade.id, symbol, name: existingPosition.name ?? quote.name, direction,
      entryPrice, exitPrice, shares, realizedPnl: pnlFinal, holdSecs,
      declaredSetupTag: existingPosition.declared_setup_tag,
      declaredStopLoss: existingPosition.declared_stop_loss,
      declaredTakeProfit: existingPosition.declared_take_profit,
      thesis: existingPosition.thesis,
    })
  } catch (err) {
    reviewError = err instanceof CoachEvaluationError ? err.message : 'Coach feedback unavailable for this trade'
    console.warn('[academy/trade] exit review failed:', err)
  }

  return NextResponse.json({ trade, review, reviewError, cash })
}
