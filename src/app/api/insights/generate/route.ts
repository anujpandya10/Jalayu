import { createClient } from '@/lib/supabase-server'
import { getUserAnthropic } from '@/lib/user-ai'

export async function POST(request: Request) {
  try {
    const { trigger } = await request.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const today = new Date().toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [profileRes, moodsRes, tasksRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('moods').select('*').eq('user_id', user.id).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('user_id', user.id).gte('due_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
    ])

    const profile = profileRes.data
    const moods = moodsRes.data || []
    const tasks = tasksRes.data || []

    const completedTasks = tasks.filter((t) => t.completed).length
    const avgMood = moods.length
      ? (moods.reduce((s, m) => s + m.score, 0) / moods.length).toFixed(1)
      : null

    const prompt = `You are Jalayu, a personal AI life companion. Generate a short, specific insight (2-3 sentences) for ${profile?.nickname || profile?.full_name || 'this person'} based on their recent data.

Context:
- Trigger: ${trigger || 'daily check-in'}
- Peak hours: ${profile?.peak_hours || 'unknown'}
- Biggest goal: "${profile?.biggest_goal || 'not shared'}"
- Struggles: ${profile?.struggles?.join(', ') || 'not specified'}
- Last 7 days: ${moods.length} mood logs, avg mood ${avgMood}/5
- Tasks this week: ${completedTasks} of ${tasks.length} completed

Write a single insight that is honest, specific, and actionable. Do not be generic. Reference actual patterns if available. Max 3 sentences.`

    const anthropic = await getUserAnthropic(user.id)
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const insightContent = message.content[0].type === 'text' ? message.content[0].text : ''

    const { data: insight, error } = await supabase.from('insights').insert({
      user_id: user.id,
      type: trigger || 'daily',
      title: 'New insight',
      content: insightContent,
      is_read: false,
      priority: 'medium',
    }).select().single()

    if (error) throw error

    return new Response(JSON.stringify({ insight }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Insights generate error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
