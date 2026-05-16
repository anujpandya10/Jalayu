import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const DEFAULT_WATCHLIST = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust' },
]

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data } = await supabase
    .from('trading_watchlist')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  // Auto-initialize with defaults if empty
  if (!data || data.length === 0) {
    const rows = DEFAULT_WATCHLIST.map((w) => ({ ...w, user_id: user.id }))
    const { data: inserted, error: insertError } = await supabase
      .from('trading_watchlist')
      .insert(rows)
      .select()
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    return NextResponse.json(inserted ?? [])
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { symbol: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { symbol, name } = body
  if (!symbol) return NextResponse.json({ error: 'Missing symbol' }, { status: 400 })

  const { data, error } = await supabase
    .from('trading_watchlist')
    .insert({ user_id: user.id, symbol: symbol.toUpperCase(), name: name ?? symbol.toUpperCase() })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `${symbol.toUpperCase()} is already in your watchlist` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { symbol: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { symbol } = body
  if (!symbol) return NextResponse.json({ error: 'Missing symbol' }, { status: 400 })

  const { error } = await supabase
    .from('trading_watchlist')
    .delete()
    .eq('user_id', user.id)
    .eq('symbol', symbol.toUpperCase())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
