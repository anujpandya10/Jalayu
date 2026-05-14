import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'

function appOrigin() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const v = process.env.VERCEL_URL
  if (v) return `https://${v.replace(/^https?:\/\//, '')}`
  return 'http://localhost:3000'
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const err = searchParams.get('error')

  const origin = appOrigin()
  const redirectBack = `${origin}/dashboard?calendar=connected`

  if (err) {
    return NextResponse.redirect(`${origin}/dashboard?calendar=error&message=${encodeURIComponent(err)}`)
  }

  const cookieStore = await cookies()
  const expected = cookieStore.get('gcal_oauth_state')?.value
  cookieStore.delete('gcal_oauth_state')
  if (!code || !state || state !== expected) {
    return NextResponse.redirect(`${origin}/dashboard?calendar=error&message=invalid_state`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/dashboard?calendar=error&message=missing_config`)
  }

  const redirectUri = `${origin}/api/calendar/google/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  }

  if (!tokenJson.access_token) {
    return NextResponse.redirect(
      `${origin}/dashboard?calendar=error&message=${encodeURIComponent(tokenJson.error || 'token')}`,
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
    : null

  const { error } = await supabase.from('calendar_connections').upsert(
    {
      user_id: user.id,
      provider: 'google',
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token || null,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    return NextResponse.redirect(`${origin}/dashboard?calendar=error&message=${encodeURIComponent(error.message)}`)
  }

  return NextResponse.redirect(redirectBack)
}
