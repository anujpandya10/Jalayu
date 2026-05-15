import { createClient } from '@/lib/supabase-server'

// GET — return all health profiles for the user
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('health_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Health profiles GET error:', error)
      return Response.json({ error: 'Failed to fetch health profiles' }, { status: 500 })
    }

    return Response.json({ data: data ?? [] })
  } catch (err) {
    console.error('Health profiles GET error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — create a new insurance/coverage profile
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()

    const { data, error } = await supabase
      .from('health_profiles')
      .insert({ ...body, user_id: user.id, updated_at: new Date().toISOString() })
      .select()
      .single()

    if (error) {
      console.error('Health profiles POST error:', error)
      return Response.json({ error: 'Failed to create health profile' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Health profiles POST error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH — update a specific profile by id
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('health_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Health profiles PATCH error:', error)
      return Response.json({ error: 'Failed to update health profile' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Health profiles PATCH error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — delete a specific profile by id
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { id } = body

    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const { error } = await supabase
      .from('health_profiles')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Health profiles DELETE error:', error)
      return Response.json({ error: 'Failed to delete health profile' }, { status: 500 })
    }

    return Response.json({ data: { id } })
  } catch (err) {
    console.error('Health profiles DELETE error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
