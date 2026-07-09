import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const PROFILE_FIELDS = [
  'full_name',
  'nickname',
  'phone',
  'contact_email',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
  'preferred_language',
  'biggest_goal',
  'peak_hours',
  'wake_time',
  'dashboard_layout',
  'risk_profile',
  'academy_experience_level',
] as const

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      profile,
      auth_email: user.email ?? null,
    })
  } catch (err) {
    console.error('[profile] GET:', err)
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const updates: Record<string, string | null> = { updated_at: new Date().toISOString() }

    for (const key of PROFILE_FIELDS) {
      if (key in body) {
        const v = body[key]
        if (key === 'dashboard_layout') {
          updates[key] = v && typeof v === 'object' ? v : null
        } else {
          updates[key] = typeof v === 'string' ? v.trim() || null : v == null ? null : String(v)
        }
      }
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[profile] PATCH:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (err) {
    console.error('[profile] PATCH:', err)
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 })
  }
}
