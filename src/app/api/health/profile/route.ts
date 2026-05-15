import { createClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('health_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found — not an error we want to surface
      console.error('Health profile GET error:', error)
      return Response.json({ error: 'Failed to fetch health profile' }, { status: 500 })
    }

    return Response.json({ data: data ?? null })
  } catch (err) {
    console.error('Health profile GET error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()

    const { data, error } = await supabase
      .from('health_profiles')
      .upsert(
        { ...body, user_id: user.id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .select()
      .single()

    if (error) {
      console.error('Health profile POST error:', error)
      return Response.json({ error: 'Failed to save health profile' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Health profile POST error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
