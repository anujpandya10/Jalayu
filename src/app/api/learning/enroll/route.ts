import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { todayString } from '@/lib/utils'

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trackId } = await req.json()
  if (!trackId || typeof trackId !== 'string') {
    return NextResponse.json({ error: 'trackId required' }, { status: 400 })
  }

  const { error: e1 } = await supabase.from('learning_enrollments').insert({
    user_id: user.id,
    track_id: trackId,
    day_index: 0,
    started_at: new Date().toISOString(),
  })
  if (e1?.code === '23505') {
    await supabase.from('learning_enrollments').update({ day_index: 0 }).eq('user_id', user.id).eq('track_id', trackId)
  } else if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 })
  }

  const today = todayString()
  const seeds: Record<string, { title: string; desc?: string }[]> = {
    focus_foundation: [
      { title: 'Block 25 minutes for one deep task' },
      { title: 'Write tomorrow\'s single priority' },
    ],
    sleep_winddown: [
      { title: 'Set a non-negotiable screens-off time' },
      { title: 'List 3 wins from today (any size)' },
    ],
    energy_rhythm: [
      { title: 'Log mood once before noon' },
      { title: 'Schedule one break before 3pm' },
    ],
  }

  const tasks = seeds[trackId] || [{ title: `Start track: ${trackId}` }]

  for (const t of tasks) {
    await supabase.from('tasks').insert({
      user_id: user.id,
      title: t.title,
      description: t.desc || null,
      due_date: today,
      priority: 'medium',
    })
  }

  return NextResponse.json({ ok: true, tasksCreated: tasks.length })
}
