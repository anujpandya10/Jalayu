/**
 *   GET    /api/academy/watchlist            → list + live quotes
 *   POST   /api/academy/watchlist  {symbol}   → add
 *   DELETE /api/academy/watchlist?symbol=AAPL → remove
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getQuote } from '@/lib/yahoo-finance'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rows } = await supabase
    .from('academy_watchlist').select('symbol, name, created_at').eq('user_id', user.id).order('created_at', { ascending: true })

  const items = await Promise.all((rows ?? []).map(async (r) => {
    try {
      const q = await getQuote(r.symbol)
      return { symbol: r.symbol, name: q.name ?? r.name ?? r.symbol, price: q.price, changePct: q.changePct }
    } catch {
      return { symbol: r.symbol, name: r.name ?? r.symbol, price: null, changePct: null }
    }
  }))
  return NextResponse.json(items)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { symbol } = await request.json() as { symbol?: string }
  const sym = (symbol ?? '').toUpperCase().trim()
  if (!/^[A-Z.]{1,10}$/.test(sym)) return NextResponse.json({ error: 'Enter a valid ticker' }, { status: 400 })

  let name = sym
  try { name = (await getQuote(sym)).name ?? sym } catch {
    return NextResponse.json({ error: `Couldn't find ${sym}` }, { status: 404 })
  }

  const { error } = await supabase.from('academy_watchlist')
    .upsert({ user_id: user.id, symbol: sym, name }, { onConflict: 'user_id,symbol' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sym = (req.nextUrl.searchParams.get('symbol') ?? '').toUpperCase().trim()
  if (!sym) return NextResponse.json({ error: 'Missing symbol' }, { status: 400 })
  const { error } = await supabase.from('academy_watchlist').delete().eq('user_id', user.id).eq('symbol', sym)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
