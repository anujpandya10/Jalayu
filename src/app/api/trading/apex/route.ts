/**
 * Apex — institutional-grade quantitative trading intelligence.
 *
 *   POST /api/trading/apex  body: { symbol: 'BTC' }
 *
 * Pulls fresh market data (price, indicators, 24h change) for the symbol
 * and asks Claude (acting as Apex) to evaluate using the rigorous framework
 * defined in the system prompt:
 *   • 1:2 R/R minimum
 *   • Conviction score 1-10
 *   • Indicator confluence required
 *   • Drawdown protocol active when portfolio is in drawdown
 *
 * Returns Apex's JSON decision exactly as specified by the framework, so
 * callers can render it directly without reshaping.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { getAllAssets } from '@/lib/market-data'
import { fetchCandles } from '@/lib/candle-data'
import { computeIndicators } from '@/lib/indicators'
import { SEED_CAPITAL } from '@/lib/trading-config'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface ApexDecision {
  decision: 'BUY' | 'SELL' | 'HOLD'
  conviction_score: number
  rationale: string
  risk_parameters: {
    suggested_position_size_pct: number
    stop_loss_target: number
    take_profit_target: number
  }
}

const APEX_SYSTEM_PROMPT = `You are "Apex," an elite, institutional-grade quantitative trading intelligence. Your philosophy is built on the foundational principles of modern market making and algorithmic trading. You do not gamble; you exploit statistical inefficiencies. Your primary directive is capital preservation. Your secondary directive is compounding risk-adjusted returns.

[CORE PHILOSOPHY]
1. Rule Number One: Never lose money.
2. Rule Number Two: Never forget Rule Number One.
3. You view the market probabilistically. Every trade is a calculation of Risk vs. Reward. You require a minimum of a 1:2 Risk/Reward ratio for any entry.
4. You ignore market noise and emotion. You only act on quantifiable data, indicator confluence, and volume confirmation.

[TRADE EVALUATION FRAMEWORK]
Before issuing a BUY, SELL, or HOLD signal, you must silently process the following:
- Trend Alignment: Are we trading with the macro trend (EMA/SMA alignment) or attempting a mean-reversion counter-trend scalp?
- Confluence: Do multiple indicators (e.g., RSI, MACD, Bollinger Bands, Volume) agree?
- Invalidation: Where is the strict Stop Loss? If the technical invalidation point is too far away, reject the trade.

[OUTPUT FORMAT]
You must output your decision strictly in the following JSON structure (no prose, no markdown fences — just the raw JSON object):
{
  "decision": "BUY" | "SELL" | "HOLD",
  "conviction_score": 1-10,
  "rationale": "A concise, 2-sentence explanation of the statistical edge driving this decision.",
  "risk_parameters": {
    "suggested_position_size_pct": 0.0,
    "stop_loss_target": 0.0,
    "take_profit_target": 0.0
  }
}

Position size is expressed as a fraction of total portfolio equity (e.g., 0.05 = 5%). Stop loss and take profit are ABSOLUTE PRICES (not percentages). If the trade fails any of the framework checks, output HOLD with conviction_score reflecting the reason.`

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as { symbol?: string }
    const symbol = (body.symbol || 'BTC').toUpperCase()

    // Find the asset
    const assets = await getAllAssets()
    const asset = assets.find((a) => a.symbol === symbol)
    if (!asset) {
      return NextResponse.json({ error: `Symbol ${symbol} not in scan universe` }, { status: 404 })
    }

    // Pull candles + compute indicators
    const candles = await fetchCandles(asset.symbol, asset.assetType, 50)
    let indBlock = '(no candle data available)'
    if (candles.length >= 15) {
      const ind = computeIndicators(candles)
      indBlock = `
  Price: $${asset.price}
  24h Change: ${asset.change24h.toFixed(2)}%
  RSI(14): ${ind.rsi.toFixed(1)}
  EMA9: ${ind.ema9.toFixed(6)}
  EMA21: ${ind.ema21.toFixed(6)}
  EMA9 vs EMA21: ${ind.ema9 > ind.ema21 ? 'BULLISH (fast > slow)' : 'BEARISH (fast < slow)'}
  VWAP: ${ind.vwap.toFixed(6)}
  VWAP deviation: ${ind.vwapDevPct.toFixed(3)}% (${ind.vwapDevPct < 0 ? 'BELOW' : 'ABOVE'} fair value)
  ATR: ${ind.atr.toFixed(6)} (${ind.atrPct.toFixed(2)}% of price)
  Volume spike: ${ind.volSpike.toFixed(2)}× vs 20-period avg
  Regime: ${ind.regime}`
    }

    // Check the user's portfolio status for drawdown protocol
    const { data: portfolio } = await supabase
      .from('paper_portfolio')
      .select('cash')
      .eq('user_id', user.id)
      .single()
    const { data: openPositions } = await supabase
      .from('paper_positions')
      .select('shares, avg_buy_price')
      .eq('user_id', user.id)
    const cash = Number(portfolio?.cash ?? SEED_CAPITAL)
    const positionsValue = (openPositions ?? []).reduce((s, p) =>
      s + Number(p.shares) * Number(p.avg_buy_price), 0)
    const equity = cash + positionsValue
    const drawdownPct = ((equity - SEED_CAPITAL) / SEED_CAPITAL) * 100

    // Drawdown protocol injection
    let drawdownNote = ''
    if (drawdownPct < -3) {
      drawdownNote = `

[CURRENT STATE: DRAWDOWN & RECOVERY PROTOCOL]
- System Status: We are currently in a drawdown state. Equity = $${equity.toFixed(2)} (${drawdownPct.toFixed(2)}% from seed).
- Action: Defensive posturing is activated.
- Position Sizing: Reduce base position sizes by 50%.
- Signal Threshold: You must reject mediocre setups. Only execute trades with a Conviction Score of 8.5/10 or higher. Demand extreme oversold/overbought conditions (e.g., RSI < 25 or > 75) combined with clear divergence and volume spikes.`
    }

    const userMessage = `Evaluate ${asset.symbol} (${asset.name}) for an entry.

[CURRENT MARKET DATA]
${indBlock}

[PORTFOLIO STATE]
  Equity: $${equity.toFixed(2)}
  Cash available: $${cash.toFixed(2)}
  Open positions: ${(openPositions ?? []).length}
  P&L from seed: ${drawdownPct >= 0 ? '+' : ''}${drawdownPct.toFixed(2)}%${drawdownNote}

Now produce your decision as the specified JSON object. Stop loss and take profit must be absolute price values (compute from current price, ensure 1:2 R/R minimum).`

    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: APEX_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const raw = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim()

    // Extract JSON (model occasionally wraps in ```json fences despite instructions)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({
        error: 'Apex response did not contain valid JSON',
        raw,
      }, { status: 500 })
    }
    let decision: ApexDecision
    try {
      decision = JSON.parse(jsonMatch[0]) as ApexDecision
    } catch {
      return NextResponse.json({
        error: 'Apex JSON malformed',
        raw,
      }, { status: 500 })
    }

    // Validate the R/R ratio if BUY/SELL
    let rrRatio: number | null = null
    if (decision.decision !== 'HOLD') {
      const entry = asset.price
      const sl = decision.risk_parameters.stop_loss_target
      const tp = decision.risk_parameters.take_profit_target
      const risk = decision.decision === 'BUY' ? entry - sl : sl - entry
      const reward = decision.decision === 'BUY' ? tp - entry : entry - tp
      if (risk > 0 && reward > 0) {
        rrRatio = reward / risk
      }
    }

    return NextResponse.json({
      symbol: asset.symbol,
      name: asset.name,
      assetType: asset.assetType,
      currentPrice: asset.price,
      decision,
      rrRatio,
      drawdownActive: drawdownPct < -3,
      drawdownPct,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[apex] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
