/**
 *   GET /api/academy/review/:tradeId
 *
 * Fetches the coach verdict for a single trade. The trade route returns the
 * review inline in the common case — this exists for the trade card to
 * refresh after a hindsight check, or as a fallback if the inline response
 * was dropped client-side.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('academy_trade_reviews')
    .select('*')
    .eq('user_id', user.id)
    .eq('trade_id', tradeId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ pending: true })
  }
  return NextResponse.json({ pending: false, review: data })
}
