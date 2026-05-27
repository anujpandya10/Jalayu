/**
 * Apex — institutional-grade quantitative trading intelligence.
 *
 *   POST /api/trading/apex  body: { symbol: 'BTC' }
 *
 * Thin wrapper around runApexEvaluation() so the same code path is used
 * by manual UI triggers and by the engine's JIT veto layer.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { runApexEvaluation, ApexEvaluationError } from '@/lib/apex-evaluate'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as { symbol?: string }
    const symbol = (body.symbol || 'BTC').toUpperCase()

    const result = await runApexEvaluation(supabase, user.id, symbol)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof ApexEvaluationError) {
      return NextResponse.json(
        { error: err.message, raw: err.raw },
        { status: err.status },
      )
    }
    console.error('[apex] unexpected', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
