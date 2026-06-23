/**
 * Apex evaluation core — extracted so it can be called both from
 * the API route (manual UI trigger) and from the engine tick (JIT veto).
 *
 * Architecture: the engine doesn't poll Apex on a schedule. When a
 * deterministic candidate crosses the entry threshold AND no fresh
 * apex_decisions row exists in cache (TTL + price drift), the engine
 * synchronously calls this function. The 4s latency is paid once per
 * actual entry candidate, not per tick.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAllAssets, type AssetData } from '@/lib/market-data'
import { fetchCandles } from '@/lib/candle-data'
import { computeIndicators, calculateRSI } from '@/lib/indicators'
import { scoreAssetFull } from '@/lib/trading-signals'
import { SEED_CAPITAL } from '@/lib/trading-config'
import { getUserAnthropic } from '@/lib/user-ai'

export interface ApexDecisionPayload {
  decision: 'BUY' | 'SELL' | 'HOLD'
  conviction_score: number
  rationale: string
  risk_parameters: {
    suggested_position_size_pct: number
    stop_loss_target: number
    take_profit_target: number
  }
}

export interface ApexEvalResult {
  /** ID of the persisted apex_decisions row, or null if persistence failed */
  id: string | null
  symbol: string
  name: string
  assetType: string
  currentPrice: number
  decision: ApexDecisionPayload
  rrRatio: number | null
  drawdownActive: boolean
  drawdownPct: number
  engineScore: number
  engineSetup: string
  generatedAt: string
}

const APEX_SYSTEM_PROMPT = `You are "Apex," an elite, institutional-grade quantitative trading intelligence. Your philosophy is built on the foundational principles of modern market making and algorithmic trading. You do not gamble; you exploit statistical inefficiencies. Your primary directive is capital preservation. Your secondary directive is compounding risk-adjusted returns.

[CORE PHILOSOPHY]
1. Rule Number One: Never lose money.
2. Rule Number Two: Never forget Rule Number One.
3. You view the market probabilistically. Every trade is a calculation of Risk vs. Reward. You require a minimum of a 1:2 Risk/Reward ratio for any entry.
4. You ignore market noise and emotion. You only act on quantifiable data, indicator confluence, and volume confirmation.

[AVAILABLE DATA FEED]
You are operating on a 1-minute timeframe. You ONLY have the following metrics. Do not assume or request order book depth, social sentiment, or macro news.
- Price & Trend: [Price], [EMA9], [EMA21], [VWAP Deviation]
- Volatility: [ATR%], [Regime: LOW/NORMAL/HIGH]
- Momentum: [RSI-1m], [RSI-15m], [Volume Spike vs 20MA]

[TRADE EVALUATION FRAMEWORK]
Before issuing a BUY, SELL, or HOLD signal, you must silently process the following:
- Trend Alignment: Are we trading with the macro trend (EMA9 vs EMA21 alignment) or attempting a mean-reversion counter-trend scalp?
- Confluence: Do multiple indicators agree (RSI-1m vs RSI-15m alignment, VWAP deviation, volume confirmation)?
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

export class ApexEvaluationError extends Error {
  constructor(message: string, public readonly status: number = 500, public readonly raw?: string) {
    super(message)
    this.name = 'ApexEvaluationError'
  }
}

/**
 * Run a full Apex evaluation for a single symbol on behalf of `userId`.
 * Persists the decision to apex_decisions and returns the parsed result.
 *
 * Throws ApexEvaluationError on validation / parsing failures so callers
 * (route + engine) can decide whether to surface the error or fall back.
 */
export async function runApexEvaluation(
  supabase: SupabaseClient,
  userId: string,
  symbolInput: string,
  prefetchedAsset?: AssetData,
): Promise<ApexEvalResult> {
  const symbol = symbolInput.toUpperCase()

  // Resolve asset (skip the universe scan if caller already has it)
  let asset = prefetchedAsset
  if (!asset || asset.symbol !== symbol) {
    const assets = await getAllAssets()
    const found = assets.find((a) => a.symbol === symbol)
    if (!found) throw new ApexEvaluationError(`Symbol ${symbol} not in scan universe`, 404)
    asset = found
  }

  // Pull candles + engine score in parallel (for disagreement-as-signal logging)
  const [candles1m, candles15m, engineSignal] = await Promise.all([
    fetchCandles(asset.symbol, asset.assetType, 50, '1m'),
    asset.assetType === 'forex'
      ? Promise.resolve([])
      : fetchCandles(asset.symbol, asset.assetType, 50, '15m'),
    scoreAssetFull(asset),
  ])

  let indBlock = '(no candle data available)'
  let ind: ReturnType<typeof computeIndicators> | null = null
  let rsi15m: number | null = null
  if (candles1m.length >= 15) {
    ind = computeIndicators(candles1m)
    rsi15m = candles15m.length >= 15 ? calculateRSI(candles15m.map((c) => c.close), 14) : null

    const priceFmt = asset.price < 1 ? asset.price.toFixed(6) : asset.price.toFixed(2)
    const emaFmt = (n: number) => n < 1 ? n.toFixed(6) : n.toFixed(4)
    const rsi15mLabel = rsi15m != null ? rsi15m.toFixed(1) : 'N/A'

    indBlock = `
PRICE & TREND
  Price:             $${priceFmt}
  EMA9:              ${emaFmt(ind.ema9)}
  EMA21:             ${emaFmt(ind.ema21)}
  VWAP Deviation:    ${ind.vwapDevPct >= 0 ? '+' : ''}${ind.vwapDevPct.toFixed(3)}%

VOLATILITY
  ATR%:              ${ind.atrPct.toFixed(2)}%
  Regime:            ${ind.regime}

MOMENTUM
  RSI-1m:            ${ind.rsi.toFixed(1)}
  RSI-15m:           ${rsi15mLabel}
  Volume Spike:      ${ind.volSpike.toFixed(2)}× vs 20MA`
  }

  // Portfolio context for drawdown protocol
  const { data: portfolio } = await supabase
    .from('paper_portfolio')
    .select('cash')
    .eq('user_id', userId)
    .single()
  const { data: openPositions } = await supabase
    .from('paper_positions')
    .select('shares, avg_buy_price')
    .eq('user_id', userId)
  const cash = Number(portfolio?.cash ?? SEED_CAPITAL)
  const positionsValue = (openPositions ?? []).reduce(
    (s, p) => s + Number(p.shares) * Number(p.avg_buy_price),
    0,
  )
  const equity = cash + positionsValue
  const drawdownPct = ((equity - SEED_CAPITAL) / SEED_CAPITAL) * 100

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

[CURRENT DATA FEED — 1-minute timeframe, exact metrics only]
${indBlock}

[PORTFOLIO STATE]
  Equity:          $${equity.toFixed(2)}
  Cash available:  $${cash.toFixed(2)}
  Open positions:  ${(openPositions ?? []).length}
  P&L from seed:   ${drawdownPct >= 0 ? '+' : ''}${drawdownPct.toFixed(2)}%${drawdownNote}

Produce your decision as the specified JSON object. Stop loss and take profit MUST be absolute price values relative to current price, with at least a 1:2 R/R ratio.`

  const anthropic = await getUserAnthropic(userId)
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

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new ApexEvaluationError('Apex response did not contain valid JSON', 500, raw)

  let decision: ApexDecisionPayload
  try {
    decision = JSON.parse(jsonMatch[0]) as ApexDecisionPayload
  } catch {
    throw new ApexEvaluationError('Apex JSON malformed', 500, raw)
  }

  // Validate R/R for BUY/SELL
  let rrRatio: number | null = null
  if (decision.decision !== 'HOLD') {
    const entry = asset.price
    const sl = decision.risk_parameters.stop_loss_target
    const tp = decision.risk_parameters.take_profit_target
    const risk = decision.decision === 'BUY' ? entry - sl : sl - entry
    const reward = decision.decision === 'BUY' ? tp - entry : entry - tp
    if (risk > 0 && reward > 0) rrRatio = reward / risk
  }

  // Persist for cache + EV analysis. Persistence failure shouldn't blow up the call.
  const { data: persisted, error: persistErr } = await supabase
    .from('apex_decisions')
    .insert({
      user_id: userId,
      symbol: asset.symbol,
      asset_type: asset.assetType,
      current_price: asset.price,
      ema9: ind?.ema9 ?? null,
      ema21: ind?.ema21 ?? null,
      vwap_dev_pct: ind?.vwapDevPct ?? null,
      atr_pct: ind?.atrPct ?? null,
      regime: ind?.regime ?? null,
      rsi_1m: ind?.rsi ?? null,
      rsi_15m: rsi15m,
      vol_spike: ind?.volSpike ?? null,
      equity_at_decision: equity,
      drawdown_pct: drawdownPct,
      drawdown_active: drawdownPct < -3,
      decision: decision.decision,
      conviction_score: decision.conviction_score,
      rationale: decision.rationale,
      suggested_position_size_pct: decision.risk_parameters?.suggested_position_size_pct ?? null,
      stop_loss_target: decision.risk_parameters?.stop_loss_target ?? null,
      take_profit_target: decision.risk_parameters?.take_profit_target ?? null,
      rr_ratio: rrRatio,
      engine_score_at_decision: engineSignal.score,
      engine_setup_at_decision: engineSignal.setupTag,
    })
    .select('id')
    .single()

  if (persistErr) {
    console.warn('[apex-evaluate] persistence failed:', persistErr.message)
  }

  return {
    id: persisted?.id ?? null,
    symbol: asset.symbol,
    name: asset.name,
    assetType: asset.assetType,
    currentPrice: asset.price,
    decision,
    rrRatio,
    drawdownActive: drawdownPct < -3,
    drawdownPct,
    engineScore: engineSignal.score,
    engineSetup: engineSignal.setupTag,
    generatedAt: new Date().toISOString(),
  }
}
