import { createClient } from '@/lib/supabase-server'
import { getUserAnthropic } from '@/lib/user-ai'

interface ScenarioDetectBody {
  message: string
  chapter?: string
  dayOnPlatform?: number
}

interface DetectionResult {
  tags: string[]
  chapter: string
  situation_summary: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScenarioDetectBody
    const { message, chapter, dayOnPlatform } = body

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
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

    const detectionPrompt = `You are a scenario-detection system for a personal AI companion. Your job is to analyze what someone says and extract the life scenarios they are navigating.

Analyze the following message and return a JSON object with:
- "tags": an array of descriptive kebab-case strings describing the scenarios present (e.g. "job-loss", "identity-crisis", "financial-anxiety", "relationship-breakdown", "immigration-adjustment", "grief", "burnout", "new-city-loneliness", "career-pivot", "substance-recovery", "family-conflict", "startup-failure", "caregiver-stress"). These are examples — detect whatever is actually present. Do NOT use a fixed list. Generate accurate tags for any situation.
- "chapter": a short phrase describing the life chapter (e.g. "rebuilding after loss", "navigating major transition", "career crossroads")
- "situation_summary": exactly one sentence describing the situation with NO names, locations, or any identifying information — fully anonymized

Return ONLY valid JSON, no other text.

Message to analyze:
"${message.replace(/"/g, '\\"')}"`

    const anthropic = await getUserAnthropic(user.id)
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: detectionPrompt,
        },
      ],
    })

    const rawContent = response.content[0]
    if (rawContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    let result: DetectionResult
    try {
      result = JSON.parse(rawContent.text) as DetectionResult
    } catch {
      throw new Error(`Failed to parse Claude response as JSON: ${rawContent.text}`)
    }

    if (!Array.isArray(result.tags) || !result.chapter || !result.situation_summary) {
      throw new Error('Invalid detection result structure')
    }

    // Save to community_patterns (fully anonymous — no user_id)
    const patternInsert = supabase.from('community_patterns').insert({
      scenario_tags: result.tags,
      situation_summary: result.situation_summary,
      life_chapter: result.chapter ?? chapter,
      day_on_platform: dayOnPlatform ?? null,
    })

    // Update user's detected_scenarios in profiles
    const profileUpdate = supabase
      .from('profiles')
      .update({
        detected_scenarios: result.tags,
        scenario_updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    // Fire both writes concurrently but don't block response
    Promise.all([patternInsert, profileUpdate]).catch((err) => {
      console.error('Failed to persist scenario detection:', err)
    })

    return new Response(
      JSON.stringify({
        tags: result.tags,
        chapter: result.chapter,
        situation_summary: result.situation_summary,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('Scenario detect error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
