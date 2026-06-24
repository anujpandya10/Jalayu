/**
 *   GET    /api/intake   → saved answers + completion
 *   POST   /api/intake   → apply answers { answers } → writes module config
 *   DELETE /api/intake   → reset personalization (back to blank land)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { applyIntake, getIntakeAnswers, resetIntake } from '@/lib/user-modules'
import type { IntakeAnswers } from '@/lib/life-intake'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const intake = await getIntakeAnswers(supabase, user.id)
  return NextResponse.json({ answers: intake?.answers ?? {}, completedAt: intake?.completedAt ?? null })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { answers?: IntakeAnswers }
  if (!body.answers || typeof body.answers !== 'object') {
    return NextResponse.json({ error: 'answers required' }, { status: 400 })
  }

  const enabled = await applyIntake(supabase, user.id, body.answers)
  return NextResponse.json({ ok: true, enabled })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await resetIntake(supabase, user.id)
  return NextResponse.json({ ok: true })
}
