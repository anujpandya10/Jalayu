import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('academy_chapter_progress')
    .select('*')
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { chapterId?: string; completed?: boolean; scenarioCorrect?: boolean }
  if (!body.chapterId) {
    return NextResponse.json({ error: 'Missing chapterId' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('academy_chapter_progress')
    .upsert({
      user_id: user.id,
      chapter_id: body.chapterId,
      completed: body.completed ?? true,
      scenario_correct: body.scenarioCorrect ?? null,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,chapter_id' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
