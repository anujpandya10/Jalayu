import { createClient } from '@/lib/supabase-server'

interface RecordBody {
  title: string
  record_type: string
  record_date?: string
  file_url?: string
  file_name?: string
  notes?: string
}

interface RecordPatchBody {
  id: string
  title?: string
  record_type?: string
  record_date?: string | null
  file_url?: string | null
  file_name?: string | null
  notes?: string | null
}

interface RecordDeleteBody {
  id: string
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('user_id', user.id)
      .order('record_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Medical records GET error:', error)
      return Response.json({ error: 'Failed to fetch medical records' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Medical records GET error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: RecordBody = await request.json()

    if (!body.title || !body.record_type) {
      return Response.json({ error: 'title and record_type are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('medical_records')
      .insert({ ...body, user_id: user.id })
      .select()
      .single()

    if (error) {
      console.error('Medical records POST error:', error)
      return Response.json({ error: 'Failed to create medical record' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Medical records POST error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: RecordPatchBody = await request.json()
    const { id, ...updates } = body

    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('medical_records')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Medical records PATCH error:', error)
      return Response.json({ error: 'Failed to update medical record' }, { status: 500 })
    }

    return Response.json({ data })
  } catch (err) {
    console.error('Medical records PATCH error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: RecordDeleteBody = await request.json()
    const { id } = body

    if (!id) {
      return Response.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('medical_records')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Medical records DELETE error:', error)
      return Response.json({ error: 'Failed to delete medical record' }, { status: 500 })
    }

    return Response.json({ data: { id } })
  } catch (err) {
    console.error('Medical records DELETE error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
