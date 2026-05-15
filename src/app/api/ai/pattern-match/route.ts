import { createClient } from '@/lib/supabase-server'

interface PatternRow {
  situation_summary: string | null
  advice_given: string | null
  mood_delta: number | null
  user_came_back: boolean | null
  scenario_tags: string[]
  life_chapter: string | null
  overlap_count?: number
}

interface RankedPattern {
  situation_summary: string | null
  advice_given: string | null
  mood_delta: number | null
  user_came_back: boolean | null
  tags: string[]
  life_chapter: string | null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tagsParam = searchParams.get('tags')
    const chapter = searchParams.get('chapter')

    if (!tagsParam) {
      return new Response(JSON.stringify({ error: 'tags parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const tags = tagsParam
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    if (tags.length === 0) {
      return new Response(JSON.stringify({ patterns: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Query patterns with overlapping tags using the && (overlap) operator
    // Only return patterns that have advice_given (useful patterns)
    let query = supabase
      .from('community_patterns')
      .select('situation_summary, advice_given, mood_delta, user_came_back, scenario_tags, life_chapter')
      .overlaps('scenario_tags', tags)
      .not('advice_given', 'is', null)
      .limit(50)

    if (chapter) {
      // Optionally filter/boost by chapter — fetch broader set and rank locally
      query = query.or(`life_chapter.eq.${chapter},life_chapter.is.null`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Pattern match query error:', error)
      return new Response(JSON.stringify({ error: 'Database query failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const rows = (data ?? []) as PatternRow[]

    // Rank by overlap count + positive outcome signals
    const ranked = rows
      .map((row) => {
        const overlap = row.scenario_tags.filter((t) => tags.includes(t)).length
        // Score: overlap is primary, positive outcomes boost
        const outcomeBonus = (row.mood_delta != null && row.mood_delta > 0 ? 2 : 0) +
          (row.user_came_back === true ? 1 : 0)
        const chapterBonus = chapter && row.life_chapter === chapter ? 1 : 0
        return {
          ...row,
          _score: overlap * 3 + outcomeBonus + chapterBonus,
        }
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 3)

    const patterns: RankedPattern[] = ranked.map((row) => ({
      situation_summary: row.situation_summary,
      advice_given: row.advice_given,
      mood_delta: row.mood_delta,
      user_came_back: row.user_came_back,
      tags: row.scenario_tags,
      life_chapter: row.life_chapter,
    }))

    return new Response(JSON.stringify({ patterns }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Pattern match error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
