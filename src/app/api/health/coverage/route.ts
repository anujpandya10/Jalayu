import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface CoverageBody {
  question: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body: CoverageBody = await request.json()

    if (!body.question?.trim()) {
      return Response.json({ error: 'question is required' }, { status: 400 })
    }

    const [profileRes, medsRes] = await Promise.all([
      supabase.from('health_profiles').select('*').eq('user_id', user.id).single(),
      supabase.from('medications').select('name, dosage_mg, frequency, purpose').eq('user_id', user.id).eq('is_active', true),
    ])

    if (!profileRes.data) {
      return Response.json({
        answer:
          "It looks like you haven't set up your health profile yet. To get coverage estimates, please add your insurance details in your Health Profile first — including your plan type, carrier, copays, and deductible.",
      })
    }

    const p = profileRes.data
    const activeMeds = medsRes.data ?? []

    const planDetails = [
      p.insurance_carrier && `Carrier: ${p.insurance_carrier}`,
      p.plan_name && `Plan: ${p.plan_name}`,
      p.plan_type && `Type: ${p.plan_type}`,
      p.member_id && `Member ID: ${p.member_id}`,
      p.deductible_cents != null && `Deductible: $${(p.deductible_cents / 100).toFixed(2)}`,
      p.deductible_met_cents != null && `Deductible met so far: $${(p.deductible_met_cents / 100).toFixed(2)}`,
      p.out_of_pocket_max_cents != null && `Out-of-pocket max: $${(p.out_of_pocket_max_cents / 100).toFixed(2)}`,
      p.copay_primary_cents != null && `Primary care copay: $${(p.copay_primary_cents / 100).toFixed(2)}`,
      p.copay_specialist_cents != null && `Specialist copay: $${(p.copay_specialist_cents / 100).toFixed(2)}`,
      p.copay_er_cents != null && `ER copay: $${(p.copay_er_cents / 100).toFixed(2)}`,
    ]
      .filter(Boolean)
      .join('\n')

    const activeMedsList =
      activeMeds.length > 0
        ? activeMeds
            .map((m) => {
              const parts = [m.name]
              if (m.dosage_mg) parts.push(`${m.dosage_mg}mg`)
              if (m.frequency) parts.push(m.frequency)
              if (m.purpose) parts.push(`(${m.purpose})`)
              return parts.join(' ')
            })
            .join(', ')
        : 'None on file'

    const conditionsList =
      p.conditions?.length > 0 ? p.conditions.join(', ') : 'None on file'

    const allergiesList =
      p.allergies?.length > 0 ? p.allergies.join(', ') : 'None on file'

    const confirmLine =
      p.insurance_carrier && p.insurance_phone
        ? `Always confirm with ${p.insurance_carrier} at ${p.insurance_phone} before proceeding.`
        : p.insurance_carrier
        ? `Always confirm with ${p.insurance_carrier} before proceeding.`
        : 'Always confirm with your insurance carrier before proceeding.'

    const systemPrompt = `You are a helpful health insurance assistant. You help the user understand their coverage based on their specific plan details. Be clear, practical, and honest about uncertainty. Never give legal or definitive medical advice. Always recommend calling their insurance for confirmation.

Their insurance:
${planDetails || 'No insurance details on file.'}

Active medications: ${activeMedsList}
Conditions: ${conditionsList}
Allergies: ${allergiesList}

Answer the user's question about their coverage. Give a direct answer first, then explain. If relevant, estimate out-of-pocket costs based on their copay/deductible info. End with: "${confirmLine}"`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: body.question }],
    })

    const answer =
      message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    return Response.json({ answer })
  } catch (err) {
    console.error('Coverage POST error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
