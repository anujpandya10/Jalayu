import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

function appOrigin() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const v = process.env.VERCEL_URL
  if (v) return `https://${v.replace(/^https?:\/\//, '')}`
  return 'http://localhost:3000'
}

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Google Calendar is not configured (GOOGLE_CLIENT_ID)' }, { status: 503 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const origin = appOrigin()
  const redirectUri = `${origin}/api/calendar/google/callback`
  const state = crypto.randomUUID()
  const cookieStore = await cookies()
  cookieStore.set('gcal_oauth_state', state, {
    httpOnly: true,
    secure: origin.startsWith('https'),
    path: '/',
    maxAge: 600,
    sameSite: 'lax',
  })

  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString()

  return NextResponse.redirect(url)
}
