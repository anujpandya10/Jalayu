import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { format } from 'date-fns'

interface ReflectionBody {
  one_word?: string
  win_of_day?: string
  tomorrow_note?: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const body = (await request.json()) as ReflectionBody
    const one_word = body.one_word?.trim() || null
    const win_of_day = body.win_of_day?.trim() || null
    const tomorrow_note = body.tomorrow_note?.trim() || null

    if (!one_word && !win_of_day && !tomorrow_note) {
      return NextResponse.json({ error: 'Fill in at least one field' }, { status: 400 })
    }

    // Reflections FK → profiles(id); ensure row exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, growth_score')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) {
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: user.id,
        full_name: user.user_metadata?.full_name ?? null,
        onboarding_complete: false,
      })
      if (profileErr) {
        console.error('[reflections] profile insert:', profileErr)
        return NextResponse.json({ error: 'Could not initialize profile' }, { status: 500 })
      }
    }

    const date = format(new Date(), 'yyyy-MM-dd')
    const payload = { user_id: user.id, date, one_word, win_of_day, tomorrow_note }

    const { data: existing } = await supabase
      .from('reflections')
      .select('id')
      .eq('user_id', user.id)
      .eq('date', date)
      .maybeSingle()

    let saved = null
    let saveError = null

    if (existing?.id) {
      const res = await supabase
        .from('reflections')
        .update({ one_word, win_of_day, tomorrow_note })
        .eq('id', existing.id)
        .select()
        .single()
      saved = res.data
      saveError = res.error
    } else {
      const res = await supabase
        .from('reflections')
        .insert(payload)
        .select()
        .single()
      saved = res.data
      saveError = res.error
    }

    if (saveError || !saved) {
      console.error('[reflections] save:', saveError)
      return NextResponse.json(
        { error: saveError?.message ?? 'Could not save reflection' },
        { status: 500 },
      )
    }

    const growthScore = (profile?.growth_score ?? 0) + (existing?.id ? 0 : 10)
    const { data: updatedProfile, error: growthErr } = await supabase
      .from('profiles')
      .update({ growth_score: growthScore, last_active: date })
      .eq('id', user.id)
      .select('growth_score')
      .single()

    if (growthErr) {
      console.error('[reflections] growth_score update:', growthErr)
    }

    return NextResponse.json({
      reflection: saved,
      growth_score: updatedProfile?.growth_score ?? growthScore,
      is_update: !!existing?.id,
    })
  } catch (err) {
    console.error('[reflections] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
