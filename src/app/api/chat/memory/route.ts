import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '20', 10), 50)
  const { data, error } = await supabase
    .from('chat_memory_facts')
    .select('fact, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ facts: (data || []).map((d) => d.fact) })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { fact } = await req.json()
  if (!fact || typeof fact !== 'string' || !fact.trim()) {
    return NextResponse.json({ error: 'fact required' }, { status: 400 })
  }

  const { error } = await supabase.from('chat_memory_facts').insert({
    user_id: user.id,
    fact: fact.trim().slice(0, 2000),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
