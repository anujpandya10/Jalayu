/**
 * Academy coach — live, per-trade verdicts for the manual practice desk.
 *
 * Same shape as apex-evaluate.ts (fetch live read → build context → call
 * Claude → parse strict JSON → persist) with three differences:
 *   1. No getAllAssets() universe gate — works for any ticker, built directly
 *      from getQuote(), since real day traders aren't limited to a watchlist.
 *   2. Two entry points (entry vs exit) instead of one, because exits need
 *      the original entry's plan for context.
 *   3. Verdict-shaped output (GOOD/QUESTIONABLE/BAD + why) instead of a
 *      decision-shaped one (BUY/SELL/HOLD) — this coach never trades, it
 *      only judges what the student already did.
 */
import Anthropic from '@anthropic-ai/sdk'
import { getUserAnthropic } from '@/lib/user-ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssetData } from '@/lib/market-data'
import { getQuote } from '@/lib/yahoo-finance'
import { scoreAssetFull, type Signal } from '@/lib/trading-signals'
import { REAL_SETUP_TAGS } from '@/lib/academy-config'


/** How long to wait after an exit before checking what price actually did next. */
export const HINDSIGHT_DELAY_SECS = 600

export class CoachEvaluationError extends Error {
  constructor(message: string, public readonly status: number = 500, public readonly raw?: string) {
    super(message)
    this.name = 'CoachEvaluationError'
  }
}

export interface CoachVerdictPayload {
  verdict: 'GOOD' | 'QUESTIONABLE' | 'BAD'
  matched_setup_tag: string
  setup_match: boolean
  headline: string
  rationale: string
  better_action: string | null
  risk_note: string
}

export interface CoachReviewResult {
  reviewId: string | null
  verdict: CoachVerdictPayload
  engineScore: number
  engineSetup: string
  generatedAt: string
}

const COACH_SYSTEM_PROMPT = `You are the lead instructor at an intensive day-trading academy. A student just placed a real (paper) order and you owe them an honest, specific, immediate verdict — never vague, never "good job."

You judge every trade only against these real, named setups — nothing else counts as an edge:
  ${REAL_SETUP_TAGS.join(', ')}
If none of these genuinely match the data, matched_setup_tag is "NO_SETUP" — never invent a softer label.

[WHAT YOU'RE GIVEN]
- The exact indicator readout (RSI, EMA9/21/50, VWAP deviation, volume spike, ATR regime, MACD, Bollinger bands) at the moment of the trade.
- The engine's own automated score and setup classification for the same data — agree or disagree with it explicitly, and say why when you disagree.
- What the student DECLARED before the trade (their stated setup, stop, target, thesis) — may be entirely absent if they skipped it; that absence is itself worth a comment.
- For EXIT reviews only: the original entry context (so you judge the full trade, not just the exit in isolation) and the realized P&L and hold time.
- Real win-rate history for the matched setup, if the auto-trading bot has run it before — use this to calibrate confidence, not to override the technical read.

[VERDICT RULES]
- GOOD: the trade matches a real setup with reasonable risk sizing, and (for exits) was closed for a defensible reason.
- QUESTIONABLE: some genuine edge is present but something is off — wrong setup label, no stop declared, chasing an already-extended move, exiting clearly too early or too late relative to the stated plan.
- BAD: no identifiable setup, fighting the trend, no risk plan at all, or a clear emotional/FOMO decision with no technical justification.
- Always be specific with real numbers (the actual RSI level, the % distance from VWAP, etc.) — never a generic compliment or generic warning.
- If the student declared a setup that doesn't match what the indicators actually show, call out the mismatch directly and explain the gap.
- better_action is one concrete, actionable change — null only if there's truly nothing to improve.

[OUTPUT — strict JSON only, no prose, no markdown fences]
{
  "verdict": "GOOD" | "QUESTIONABLE" | "BAD",
  "matched_setup_tag": "<one of the tags above, or NO_SETUP>",
  "setup_match": true | false,
  "headline": "<one sentence, under 100 characters, shown immediately on the trade card>",
  "rationale": "<2-4 sentences, the technical why>",
  "better_action": "<one specific improvement, or null>",
  "risk_note": "<one sentence on stop/target/position-sizing quality>"
}`

async function quoteToAssetData(symbol: string): Promise<AssetData> {
  const q = await getQuote(symbol.toUpperCase())
  return {
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    change24h: q.changePct,
    change7d: 0,
    assetType: 'stock',
  }
}

function formatIndicatorBlock(asset: AssetData, signal: Signal): string {
  const ind = signal.indicators
  if (!ind) {
    return `(insufficient 1m candle data for ${asset.symbol} — engine fell back to a 24h-change-only read: ${asset.change24h.toFixed(2)}%)`
  }
  const fmt = (n: number) => (asset.price < 1 ? n.toFixed(6) : n.toFixed(4))
  return `
  Price: $${asset.price.toFixed(2)}   EMA9: ${fmt(ind.ema9)}   EMA21: ${fmt(ind.ema21)}   EMA50: ${fmt(ind.ema50)}
  VWAP deviation: ${ind.vwapDevPct.toFixed(3)}%   ATR%: ${ind.atrPct.toFixed(2)}%   Regime: ${ind.regime}
  RSI-1m: ${ind.rsi.toFixed(1)}   Volume spike: ${ind.volSpike.toFixed(2)}x vs 20MA
  Bollinger lower band: ${fmt(ind.bb.lower)} (width ${ind.bb.width.toFixed(1)}%)   MACD histogram: ${ind.macd.histogram.toFixed(5)} (bullish=${ind.macd.bullish})
  Engine read: score ${signal.score.toFixed(1)}, setup ${signal.setupTag}, action ${signal.action}
  Engine reasoning: ${signal.reason}`
}

async function formatSetupStatsLine(supabase: SupabaseClient, userId: string, setupTag: string): Promise<string> {
  if (!setupTag || setupTag === 'UNTAGGED' || setupTag === 'NO_SETUP') return ''
  const { data } = await supabase
    .from('setup_stats')
    .select('total_trades, wins, avg_pnl')
    .eq('user_id', userId)
    .eq('setup_tag', setupTag)
  if (!data || data.length === 0) return ''
  const totalTrades = data.reduce((s, r) => s + Number(r.total_trades), 0)
  if (totalTrades === 0) return ''
  const totalWins = data.reduce((s, r) => s + Number(r.wins), 0)
  const winRate = (totalWins / totalTrades) * 100
  const avgPnl = data.reduce((s, r) => s + Number(r.avg_pnl) * Number(r.total_trades), 0) / totalTrades
  return `\nReal history: the auto-trading bot has run ${setupTag} ${totalTrades} time(s) with a ${winRate.toFixed(0)}% win rate (avg ${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}% per trade).`
}

function formatDeclaredBlock(params: {
  declaredSetupTag?: string | null
  declaredStopLoss?: number | null
  declaredTakeProfit?: number | null
  thesis?: string | null
}): string {
  const { declaredSetupTag, declaredStopLoss, declaredTakeProfit, thesis } = params
  if (!declaredSetupTag && declaredStopLoss == null && declaredTakeProfit == null && !thesis) {
    return '\nThe student declared no setup, stop, target, or thesis before placing this trade.'
  }
  return `
The student declared BEFORE placing this trade:
  Setup they think this is: ${declaredSetupTag ?? '(not stated)'}
  Stop loss:   ${declaredStopLoss != null ? `$${declaredStopLoss.toFixed(2)}` : '(not stated)'}
  Take profit: ${declaredTakeProfit != null ? `$${declaredTakeProfit.toFixed(2)}` : '(not stated)'}
  Thesis: ${thesis ?? '(not stated)'}`
}

function parseVerdict(resp: Anthropic.Message): CoachVerdictPayload {
  const raw = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim()
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new CoachEvaluationError('Coach response did not contain valid JSON', 500, raw)
  try {
    return JSON.parse(match[0]) as CoachVerdictPayload
  } catch {
    throw new CoachEvaluationError('Coach JSON malformed', 500, raw)
  }
}

async function persistReview(
  supabase: SupabaseClient,
  userId: string,
  reviewType: 'ENTRY' | 'EXIT',
  tradeId: string,
  verdict: CoachVerdictPayload,
  signal: Signal,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('academy_trade_reviews')
    .insert({
      user_id: userId,
      trade_id: tradeId,
      review_type: reviewType,
      verdict: verdict.verdict,
      matched_setup_tag: verdict.matched_setup_tag,
      setup_match: verdict.setup_match,
      headline: verdict.headline,
      rationale: verdict.rationale,
      better_action: verdict.better_action,
      risk_note: verdict.risk_note,
      rsi_1m: signal.indicators?.rsi ?? null,
      vwap_dev_pct: signal.indicators?.vwapDevPct ?? null,
      atr_pct: signal.indicators?.atrPct ?? null,
      regime: signal.indicators?.regime ?? null,
      vol_spike: signal.indicators?.volSpike ?? null,
      engine_score: signal.score,
      engine_setup: signal.setupTag,
    })
    .select('id')
    .single()
  if (error) {
    console.warn(`[academy-coach] ${reviewType} review persistence failed:`, error.message)
    return null
  }
  return data?.id ?? null
}

/**
 * ENTRY review — called right after an academy_trades opening row is inserted.
 */
export async function runEntryReview(
  supabase: SupabaseClient,
  userId: string,
  params: {
    tradeId: string
    symbol: string
    name: string
    direction: 'LONG' | 'SHORT'
    entryPrice: number
    shares: number
    declaredSetupTag?: string | null
    declaredStopLoss?: number | null
    declaredTakeProfit?: number | null
    thesis?: string | null
  },
): Promise<CoachReviewResult> {
  const asset = await quoteToAssetData(params.symbol)
  const signal = await scoreAssetFull(asset)

  const userMessage = `Review this ENTRY. The student just opened a ${params.direction} position in ${params.symbol} (${params.name}) at $${params.entryPrice.toFixed(2)}, ${params.shares} shares.

[LIVE DATA FEED — 1-minute timeframe]
${formatIndicatorBlock(asset, signal)}
${await formatSetupStatsLine(supabase, userId, signal.setupTag)}
${formatDeclaredBlock(params)}

Produce your verdict as the specified JSON object.`

  const anthropic = await getUserAnthropic(userId)
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: COACH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })
  const verdict = parseVerdict(resp)
  const reviewId = await persistReview(supabase, userId, 'ENTRY', params.tradeId, verdict, signal)

  return { reviewId, verdict, engineScore: signal.score, engineSetup: signal.setupTag, generatedAt: new Date().toISOString() }
}

/**
 * EXIT review — called right after an academy_trades closing row is inserted.
 * Entry context is passed in by the caller (it already has the position row
 * on hand right before deleting it) rather than re-derived here.
 */
export async function runExitReview(
  supabase: SupabaseClient,
  userId: string,
  params: {
    tradeId: string
    symbol: string
    name: string
    direction: 'LONG' | 'SHORT'
    entryPrice: number
    exitPrice: number
    shares: number
    realizedPnl: number
    holdSecs: number
    declaredSetupTag?: string | null
    declaredStopLoss?: number | null
    declaredTakeProfit?: number | null
    thesis?: string | null
  },
): Promise<CoachReviewResult> {
  const asset = await quoteToAssetData(params.symbol)
  const signal = await scoreAssetFull(asset)

  const pnlPct = params.entryPrice > 0
    ? (params.direction === 'LONG'
      ? (params.exitPrice - params.entryPrice) / params.entryPrice
      : (params.entryPrice - params.exitPrice) / params.entryPrice) * 100
    : 0

  const userMessage = `Review this EXIT. The student just closed a ${params.direction} position in ${params.symbol} (${params.name}).
  Entry: $${params.entryPrice.toFixed(2)}   Exit: $${params.exitPrice.toFixed(2)}   Shares: ${params.shares}
  Held: ${Math.round(params.holdSecs / 60)} min   Realized P&L: ${params.realizedPnl >= 0 ? '+' : ''}$${params.realizedPnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)

[LIVE DATA FEED AT EXIT — 1-minute timeframe]
${formatIndicatorBlock(asset, signal)}
${await formatSetupStatsLine(supabase, userId, signal.setupTag)}
${formatDeclaredBlock(params)}

Judge the exit specifically: was closing here a reasoned decision (stop/target/thesis invalidated) or premature/late relative to the student's own plan? Produce your verdict as the specified JSON object.`

  const anthropic = await getUserAnthropic(userId)
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: COACH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })
  const verdict = parseVerdict(resp)
  const reviewId = await persistReview(supabase, userId, 'EXIT', params.tradeId, verdict, signal)

  return { reviewId, verdict, engineScore: signal.score, engineSetup: signal.setupTag, generatedAt: new Date().toISOString() }
}

/**
 * Hindsight follow-up — best-effort, not guaranteed-instant. Call this from a
 * lightweight poll while the practice desk is mounted; it only acts on EXIT
 * reviews old enough to check and not already checked.
 */
export async function checkHindsight(
  supabase: SupabaseClient,
  userId: string,
  reviewId: string,
): Promise<{ hindsightVerdict: string; pctMove: number; price: number } | null> {
  const { data: review } = await supabase
    .from('academy_trade_reviews')
    .select('id, trade_id, review_type, hindsight_checked_at, created_at')
    .eq('id', reviewId)
    .eq('user_id', userId)
    .single()
  if (!review || review.review_type !== 'EXIT' || review.hindsight_checked_at) return null

  const ageSecs = (Date.now() - new Date(review.created_at).getTime()) / 1000
  if (ageSecs < HINDSIGHT_DELAY_SECS) return null

  const { data: trade } = await supabase
    .from('academy_trades')
    .select('symbol, direction, price')
    .eq('id', review.trade_id)
    .single()
  if (!trade) return null

  const quote = await getQuote(trade.symbol)
  const exitPrice = Number(trade.price)
  const pctMove = exitPrice > 0 ? ((quote.price - exitPrice) / exitPrice) * 100 : 0
  const isLong = trade.direction === 'LONG'
  const ranFurtherInOurFavor = isLong ? pctMove > 0.2 : pctMove < -0.2

  const hindsightVerdict = Math.abs(pctMove) < 0.2
    ? 'GOOD_EXIT'
    : ranFurtherInOurFavor
      ? 'LEFT_MONEY_ON_TABLE'
      : 'GOOD_EXIT'

  await supabase.from('academy_trade_reviews').update({
    hindsight_checked_at: new Date().toISOString(),
    hindsight_price: quote.price,
    hindsight_pct_move: pctMove,
    hindsight_verdict: hindsightVerdict,
  }).eq('id', reviewId)

  return { hindsightVerdict, pctMove, price: quote.price }
}
