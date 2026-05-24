/**
 * Apex Veto Layer — categorical gate before engine entries.
 * Uses apex_decisions as an async lookup (no inline Claude calls).
 *
 * Cache validity: decision within 3 minutes AND price within ±0.5% of
 * the price at Apex evaluation time. Stale regime → engine acts alone.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Max age of an Apex row before the engine ignores it */
export const APEX_VETO_TTL_SECS = 180

/** Price drift beyond this invalidates the cached Apex read */
export const APEX_PRICE_DRIFT_PCT = 0.005

export type ApexVetoType =
  | 'apex_vetoed_hold'
  | 'apex_vetoed_opposite'
  | 'apex_low_conviction'
  | 'apex_confirmed'
  | 'apex_strong'
  | 'no_apex_cache'

export interface ApexDecisionRow {
  id: string
  symbol: string
  decision: 'BUY' | 'SELL' | 'HOLD'
  conviction_score: number
  current_price: number
  created_at: string
}

export interface ApexVetoResult {
  /** false = skip trade entirely */
  proceed: boolean
  positionMultiplier: number
  vetoType: ApexVetoType
  apex: ApexDecisionRow | null
  reason: string
}

function priceWithinDrift(currentPrice: number, apexPrice: number): boolean {
  if (apexPrice <= 0) return false
  const drift = Math.abs(currentPrice - apexPrice) / apexPrice
  return drift <= APEX_PRICE_DRIFT_PCT
}

function apexAgreesWithDirection(
  apexDecision: 'BUY' | 'SELL' | 'HOLD',
  direction: 'LONG' | 'SHORT',
): boolean {
  if (apexDecision === 'HOLD') return false
  return (direction === 'LONG' && apexDecision === 'BUY')
    || (direction === 'SHORT' && apexDecision === 'SELL')
}

function apexOppositeDirection(
  apexDecision: 'BUY' | 'SELL' | 'HOLD',
  direction: 'LONG' | 'SHORT',
): boolean {
  if (apexDecision === 'HOLD') return false
  return (direction === 'LONG' && apexDecision === 'SELL')
    || (direction === 'SHORT' && apexDecision === 'BUY')
}

/**
 * Evaluate how Apex should gate a proposed engine entry.
 * When apex is null (no valid cache), engine acts alone at full size.
 */
export function evaluateApexVeto(
  apex: ApexDecisionRow | null,
  direction: 'LONG' | 'SHORT',
): ApexVetoResult {
  if (!apex) {
    return {
      proceed: true,
      positionMultiplier: 1,
      vetoType: 'no_apex_cache',
      apex: null,
      reason: 'No fresh Apex read — engine acts alone',
    }
  }

  const conv = Number(apex.conviction_score)

  if (apex.decision === 'HOLD') {
    return {
      proceed: false,
      positionMultiplier: 0,
      vetoType: 'apex_vetoed_hold',
      apex,
      reason: `Apex HOLD (conv ${conv.toFixed(1)}) — trade blocked`,
    }
  }

  if (apexOppositeDirection(apex.decision, direction)) {
    return {
      proceed: false,
      positionMultiplier: 0,
      vetoType: 'apex_vetoed_opposite',
      apex,
      reason: `Apex ${apex.decision} vs engine ${direction} — trade blocked`,
    }
  }

  if (!apexAgreesWithDirection(apex.decision, direction)) {
    return {
      proceed: true,
      positionMultiplier: 1,
      vetoType: 'no_apex_cache',
      apex,
      reason: 'Apex neutral — engine acts alone',
    }
  }

  if (conv < 6) {
    return {
      proceed: true,
      positionMultiplier: 0.5,
      vetoType: 'apex_low_conviction',
      apex,
      reason: `Apex agrees (${conv.toFixed(1)}) — 50% size`,
    }
  }

  if (conv >= 8.5) {
    return {
      proceed: true,
      positionMultiplier: 1.2,
      vetoType: 'apex_strong',
      apex,
      reason: `Apex strong confirm (${conv.toFixed(1)}) — 1.2× size`,
    }
  }

  if (conv >= 7) {
    return {
      proceed: true,
      positionMultiplier: 1,
      vetoType: 'apex_confirmed',
      apex,
      reason: `Apex confirmed (${conv.toFixed(1)}) — full size`,
    }
  }

  // Agrees, conviction 6–6.9: proceed full size (between low-conviction and confirmed)
  return {
    proceed: true,
    positionMultiplier: 1,
    vetoType: 'apex_confirmed',
    apex,
    reason: `Apex agrees (${conv.toFixed(1)}) — full size`,
  }
}

/**
 * Load the most recent Apex decision per symbol, filtered by TTL + price drift.
 */
export async function loadValidApexDecisions(
  supabase: SupabaseClient,
  userId: string,
  symbols: string[],
  priceBySymbol: Map<string, number>,
): Promise<Map<string, ApexDecisionRow>> {
  const out = new Map<string, ApexDecisionRow>()
  if (symbols.length === 0) return out

  const cutoff = new Date(Date.now() - APEX_VETO_TTL_SECS * 1000).toISOString()

  const { data, error } = await supabase
    .from('apex_decisions')
    .select('id, symbol, decision, conviction_score, current_price, created_at')
    .eq('user_id', userId)
    .in('symbol', symbols)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })

  if (error || !data) return out

  for (const row of data as ApexDecisionRow[]) {
    if (out.has(row.symbol)) continue
    const currentPrice = priceBySymbol.get(row.symbol)
    if (currentPrice == null) continue
    const apexPrice = Number(row.current_price)
    if (!priceWithinDrift(currentPrice, apexPrice)) continue
    out.set(row.symbol, {
      ...row,
      conviction_score: Number(row.conviction_score),
      current_price: apexPrice,
    })
  }

  return out
}

export async function logEngineApexVeto(
  supabase: SupabaseClient,
  params: {
    userId: string
    symbol: string
    assetType: string
    direction: 'LONG' | 'SHORT'
    engineScore: number
    engineSetup: string
    entryPrice: number
    veto: ApexVetoResult
    wouldHaveBudgetUsd: number
    executed: boolean
  },
): Promise<void> {
  const { veto } = params
  const { error } = await supabase.from('engine_apex_vetoes').insert({
    user_id: params.userId,
    symbol: params.symbol,
    asset_type: params.assetType,
    direction: params.direction,
    engine_score: params.engineScore,
    engine_setup: params.engineSetup,
    entry_price: params.entryPrice,
    apex_decision_id: veto.apex?.id ?? null,
    apex_decision: veto.apex?.decision ?? null,
    apex_conviction: veto.apex?.conviction_score ?? null,
    apex_price_at_decision: veto.apex?.current_price ?? null,
    veto_type: veto.vetoType,
    position_multiplier: veto.positionMultiplier,
    would_have_budget_usd: params.wouldHaveBudgetUsd,
    executed: params.executed,
  })
  if (error) {
    console.warn('[apex-veto] log failed (table may not exist yet):', error.message)
  }
}
