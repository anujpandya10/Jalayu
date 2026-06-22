/**
 *   GET /api/academy/hindsight
 *
 * Best-effort, not guaranteed-instant: processes up to 5 exit reviews that
 * are past HINDSIGHT_DELAY_SECS and haven't been checked yet. Called
 * opportunistically while the practice desk is mounted — no cron required
 * for v1.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { checkHindsight, HINDSIGHT_DELAY_SECS } from '@/lib/academy-coach'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - HINDSIGHT_DELAY_SECS * 1000).toISOString()
  const { data: due } = await supabase
    .from('academy_trade_reviews')
    .select('id')
    .eq('user_id', user.id)
    .eq('review_type', 'EXIT')
    .is('hindsight_checked_at', null)
    .lte('created_at', cutoff)
    .limit(5)

  const results: ({ reviewId: string } & { hindsightVerdict: string; pctMove: number; price: number })[] = []
  for (const row of due ?? []) {
    try {
      const result = await checkHindsight(supabase, user.id, row.id)
      if (result) results.push({ reviewId: row.id, ...result })
    } catch (err) {
      console.warn('[academy/hindsight] check failed for', row.id, err)
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
