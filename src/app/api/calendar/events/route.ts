import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

function appOrigin() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const v = process.env.VERCEL_URL
  if (v) return `https://${v.replace(/^https?:\/\//, '')}`
  return 'http://localhost:3000'
}

type CalRow = {
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
}

async function refreshIfNeeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  row: CalRow,
): Promise<string | null> {
  const exp = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  if (exp > Date.now() + 60_000) return row.access_token
  if (!row.refresh_token) return row.access_token

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return row.access_token

  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const j = (await tr.json()) as { access_token?: string; expires_in?: number }
  if (!j.access_token) return null

  const expiresAt = j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null
  await supabase
    .from('calendar_connections')
    .update({ access_token: j.access_token, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  return j.access_token
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: row, error } = await supabase
    .from('calendar_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ connected: false, events: [] })
  }

  const access = await refreshIfNeeded(supabase, user.id, row as CalRow)
  if (!access) return NextResponse.json({ connected: true, events: [], error: 'token' })

  const timeMin = new Date().toISOString()
  const url =
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
    new URLSearchParams({
      maxResults: '8',
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
    })

  const cal = await fetch(url, { headers: { Authorization: `Bearer ${access}` } })
  const json = (await cal.json()) as { items?: { summary?: string; start?: { dateTime?: string; date?: string } }[] }

  if (!cal.ok) {
    return NextResponse.json({ connected: true, events: [], error: 'calendar_api' })
  }

  const events = (json.items || []).map((e) => ({
    title: e.summary || '(no title)',
    start: e.start?.dateTime || e.start?.date || null,
  }))

  return NextResponse.json({ connected: true, events })
}
