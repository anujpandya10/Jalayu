import { createClient } from '@/lib/supabase-server'

interface AppointmentBody {
  title: string
  provider_name?: string
  appointment_date: string
  location?: string
  reason?: string
  notes?: string
  follow_up_needed?: boolean
}

interface AppointmentPatchBody {
  id: string
  title?: string
  provider_name?: string
  appointment_date?: string
  location?: string
  reason?: string
  notes?: string
  follow_up_needed?: boolean
}

interface AppointmentDeleteBody {
  id: string
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('health_appointments')
      .select('*')
      .eq('user_id', user.id)
      .order('appointment_date', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Appointments GET error:', error)
      return Response.json({ error: 'Failed to fetch appointments' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Appointments GET error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: AppointmentBody = await request.json()

    if (!body.title || !body.appointment_date) {
      return Response.json({ error: 'title and appointment_date are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('health_appointments')
      .insert({ ...body, user_id: user.id })
      .select()
      .single()

    if (error) {
      console.error('Appointments POST error:', error)
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Appointments POST error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: AppointmentPatchBody = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return Response.json({ error: 'id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('health_appointments')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Appointments PATCH error:', error)
      return Response.json({ error: 'Failed to update appointment' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Appointments PATCH error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: AppointmentDeleteBody = await request.json()
    const { id } = body

    if (!id) {
      return Response.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('health_appointments')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Appointments DELETE error:', error)
      return Response.json({ error: 'Failed to delete appointment' }, { status: 500 })
    }

    return Response.json({ data: { id } })
  } catch (err) {
    console.error('Appointments DELETE error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
