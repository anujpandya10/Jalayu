import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const PROMPT_WINDOW_MS = 10 * 60_000

interface Bucket { yes: number; no: number; missed: number }

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('academy_auto_shadow_feedback').select('event_type, answer, created_at').eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cutoff = Date.now() - PROMPT_WINDOW_MS
  const buckets: Record<'ENTRY' | 'EXIT', Bucket> = { ENTRY: { yes: 0, no: 0, missed: 0 }, EXIT: { yes: 0, no: 0, missed: 0 } }

  for (const row of data ?? []) {
    const b = buckets[row.event_type as 'ENTRY' | 'EXIT']
    if (!b) continue
    if (row.answer === 'YES') b.yes++
    else if (row.answer === 'NO') b.no++
    else if (new Date(row.created_at as string).getTime() < cutoff) b.missed++
    // else: still within the answer window, not resolved yet — excluded from stats
  }

  const summarize = (b: Bucket) => {
    const total = b.yes + b.no + b.missed
    return { ...b, total, keptUpPct: total > 0 ? Math.round((b.yes / total) * 100) : null }
  }

  return NextResponse.json({ entry: summarize(buckets.ENTRY), exit: summarize(buckets.EXIT) })
}
