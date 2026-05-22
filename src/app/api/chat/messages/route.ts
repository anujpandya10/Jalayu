import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '40', 10), 100)

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data || [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const rows = body?.messages as { role: string; content: string }[]
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }

  const insert = rows
    .filter((m) => m.content?.trim() && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      user_id: user.id,
      role: m.role,
      content: m.content.trim().slice(0, 32000),
    }))

  if (!insert.length) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const { error } = await supabase.from('chat_messages').insert(insert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, saved: insert.length })
}

/**
 * Clear chat history. Optionally also clear saved memory facts.
 *   DELETE /api/chat/messages           → just messages
 *   DELETE /api/chat/messages?facts=1   → messages + saved facts (full reset)
 */
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const wipeFacts = url.searchParams.get('facts') === '1'

  const { error: msgErr } = await supabase
    .from('chat_messages')
    .delete()
    .eq('user_id', user.id)

  if (msgErr) {
    console.error('[chat/messages DELETE]', msgErr)
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  let factsDeleted = 0
  if (wipeFacts) {
    const { error: factErr, count } = await supabase
      .from('chat_memory_facts')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
    if (factErr) {
      console.warn('[chat/messages DELETE] facts cleanup failed', factErr)
    } else {
      factsDeleted = count ?? 0
    }
  }

  return NextResponse.json({ ok: true, facts_deleted: factsDeleted })
}
