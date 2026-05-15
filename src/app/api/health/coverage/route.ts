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

    const [profilesRes, medsRes] = await Promise.all([
      supabase.from('health_profiles').select('*').eq('user_id', user.id).order('created_at', { ascending: true }).limit(10),
      supabase.from('medications').select('name, dosage_mg, frequency, purpose').eq('user_id', user.id).eq('is_active', true),
    ])

    const profiles = profilesRes.data ?? []
    const activeMeds = medsRes.data ?? []
    const firstProfile = profiles[0] ?? null

    // Build rich insurance profiles text
    const insuranceText = profiles.length > 0
      ? profiles.map((p, i) => {
          const label = p.profile_label || (i === 0 ? 'Mine' : `Profile ${i + 1}`)
          const parts = [
            `[${label} — ${p.relationship || 'self'}]`,
            p.insurance_carrier && `Carrier: ${p.insurance_carrier}`,
            p.plan_name && `Plan: ${p.plan_name}`,
            p.plan_type && `Type: ${p.plan_type}`,
            p.member_id && `Member ID: ${p.member_id}`,
            p.group_number && `Group #: ${p.group_number}`,
            p.deductible_cents != null && `Deductible: $${(p.deductible_cents / 100).toFixed(0)}${p.deductible_met_cents != null ? ` (met: $${(p.deductible_met_cents / 100).toFixed(0)})` : ''}`,
            p.out_of_pocket_max_cents != null && `Out-of-pocket max: $${(p.out_of_pocket_max_cents / 100).toFixed(0)}`,
            p.copay_primary_cents != null && `Primary copay: $${(p.copay_primary_cents / 100).toFixed(0)}`,
            p.copay_specialist_cents != null && `Specialist copay: $${(p.copay_specialist_cents / 100).toFixed(0)}`,
            p.copay_er_cents != null && `ER copay: $${(p.copay_er_cents / 100).toFixed(0)}`,
            p.insurance_phone && `Phone: ${p.insurance_phone}`,
            p.insurance_website && `Website: ${p.insurance_website}`,
          ].filter(Boolean).join('\n  ')
          return parts
        }).join('\n\n')
      : 'No insurance profiles on file.'

    const activeMedsList = activeMeds.length > 0
      ? activeMeds.map((m) => {
          const parts = [m.name]
          if (m.dosage_mg) parts.push(`${m.dosage_mg}mg`)
          if (m.frequency) parts.push(m.frequency)
          if (m.purpose) parts.push(`(${m.purpose})`)
          return parts.join(' ')
        }).join(', ')
      : 'None on file'

    const systemPrompt = `You are a health insurance expert and personal health advisor. You have this person's complete insurance details on file and deep knowledge of US healthcare.

THEIR INSURANCE PROFILES:
${insuranceText}

Active medications: ${activeMedsList}
${firstProfile?.conditions?.length ? `Conditions: ${firstProfile.conditions.join(', ')}` : ''}
${firstProfile?.allergies?.length ? `Allergies: ${firstProfile.allergies.join(', ')}` : ''}

YOUR APPROACH:
- Answer the question directly and specifically using their actual plan data
- Calculate real out-of-pocket estimates when asked (use their deductible, copay, and what they've met)
- If their plan info is missing a specific detail, explain what's typical for their plan type (PPO/HMO/HDHP/etc.) AND note what to confirm with their carrier
- NEVER say you don't know or can't help — give a real answer based on their data or general plan knowledge
- Show your math when estimating costs (e.g. "Deductible remaining: $1,300. Labs typically cost $150-400, so you'd likely pay $150-400 before insurance kicks in")
- For medications: check if common, know typical formulary tiers, know that generics are usually Tier 1-2

PLAN KNOWLEDGE (apply when relevant):
- PPO: In-network preferred but out-of-network allowed. No referral needed. Copay usually applies to office visits regardless of deductible.
- HMO: In-network ONLY (except ER). PCP referral required for specialists. Often lower costs within network.
- HDHP: High deductible ($1,600+/individual, $3,200+/family in 2025). You pay 100% until deductible met, then coinsurance kicks in. Qualifies for HSA contributions.
- EPO: Like PPO network access but no out-of-network coverage (except emergencies).
- Coinsurance: After deductible, you pay your share % (typically 20%) until you hit the out-of-pocket max.
- Out-of-pocket max: Once hit, insurance pays 100% for the rest of the year. Includes deductible + copays + coinsurance.
- Preventive care: Usually 100% covered even before deductible (ACA-mandated).
- Mental health parity: Must be covered equivalent to physical health (federal law).
- Prior auth: Required for many specialty drugs, some imaging, elective procedures. Call member services or check the carrier website.
- Emergency: ERs must be treated as in-network for stabilization regardless of plan type.

Be thorough. Be specific. Be genuinely helpful. Give them the full picture.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: body.question }],
    })

    const answer = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    return Response.json({ answer })
  } catch (err) {
    console.error('Coverage POST error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
