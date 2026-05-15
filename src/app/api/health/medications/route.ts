import { createClient } from '@/lib/supabase-server'

interface MedicationBody {
  name: string
  dosage_mg?: number
  frequency?: string
  prescriber?: string
  purpose?: string
  start_date?: string
  notes?: string
}

interface MedicationPatchBody {
  id: string
  name?: string
  dosage_mg?: number
  frequency?: string
  prescriber?: string
  purpose?: string
  start_date?: string
  end_date?: string | null
  is_active?: boolean
  notes?: string
}

interface MedicationDeleteBody {
  id: string
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('medications')
      .select('*')
      .eq('user_id', user.id)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Medications GET error:', error)
      return Response.json({ error: 'Failed to fetch medications' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Medications GET error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: MedicationBody = await request.json()

    if (!body.name) {
      return Response.json({ error: 'name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('medications')
      .insert({ ...body, user_id: user.id, is_active: true })
      .select()
      .single()

    if (error) {
      console.error('Medications POST error:', error)
      return Response.json({ error: 'Failed to create medication' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Medications POST error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: MedicationPatchBody = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return Response.json({ error: 'id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('medications')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Medications PATCH error:', error)
      return Response.json({ error: 'Failed to update medication' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Medications PATCH error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: MedicationDeleteBody = await request.json()
    const { id } = body

    if (!id) {
      return Response.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('medications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Medications DELETE error:', error)
      return Response.json({ error: 'Failed to delete medication' }, { status: 500 })
    }

    return Response.json({ data: { id } })
  } catch (err) {
    console.error('Medications DELETE error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
