/**
 *   GET   /api/intents/:id  → single intent (for the detail view)
 *   PATCH /api/intents/:id  → mark reviewed / archived
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('intents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ intent: data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, string | null> = {}

  if (body.reviewed === true)  patch.reviewed_at = new Date().toISOString()
  if (body.reviewed === false) patch.reviewed_at = null
  if (body.archived === true)  patch.archived_at = new Date().toISOString()
  if (body.archived === false) patch.archived_at = null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('intents')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'update failed' }, { status: 500 })
  return NextResponse.json({ intent: data })
}
