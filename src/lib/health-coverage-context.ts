import type { HealthProfile, Medication } from '@/lib/types'

export function formatInsuranceProfiles(profiles: HealthProfile[]): string {
  if (!profiles.length) return 'No insurance profiles on file.'
  return profiles
    .map((p, i) => {
      const label = p.profile_label || (i === 0 ? 'Mine' : `Profile ${i + 1}`)
      const parts = [
        `[${label} — ${p.relationship || 'self'}]`,
        p.insurance_carrier && `Carrier: ${p.insurance_carrier}`,
        p.plan_name && `Plan: ${p.plan_name}`,
        p.plan_type && `Type: ${p.plan_type}`,
        p.member_id && `Member ID: ${p.member_id}`,
        p.group_number && `Group #: ${p.group_number}`,
        p.deductible_cents != null &&
          `Deductible: $${(p.deductible_cents / 100).toFixed(0)}${p.deductible_met_cents != null ? ` (met: $${(p.deductible_met_cents / 100).toFixed(0)})` : ''}`,
        p.out_of_pocket_max_cents != null && `Out-of-pocket max: $${(p.out_of_pocket_max_cents / 100).toFixed(0)}`,
        p.copay_primary_cents != null && `Primary copay: $${(p.copay_primary_cents / 100).toFixed(0)}`,
        p.copay_specialist_cents != null && `Specialist copay: $${(p.copay_specialist_cents / 100).toFixed(0)}`,
        p.copay_er_cents != null && `ER copay: $${(p.copay_er_cents / 100).toFixed(0)}`,
        p.insurance_phone && `Phone: ${p.insurance_phone}`,
        p.insurance_website && `Website: ${p.insurance_website}`,
        p.primary_care_name && `PCP: ${p.primary_care_name}`,
        p.primary_care_address && `PCP address: ${p.primary_care_address}`,
      ].filter(Boolean)
      return parts.join('\n  ')
    })
    .join('\n\n')
}

export function formatMedications(meds: Medication[]): string {
  if (!meds.length) return 'None on file.'
  return meds
    .map((m) => {
      const parts = [m.name]
      if (m.dosage_mg) parts.push(`${m.dosage_mg}mg`)
      if (m.frequency) parts.push(m.frequency)
      if (m.purpose) parts.push(`(${m.purpose})`)
      if (m.prescriber) parts.push(`prescriber: ${m.prescriber}`)
      return parts.join(' ')
    })
    .join('\n')
}

export function locationHintFromProfiles(profiles: HealthProfile[]): string | null {
  for (const p of profiles) {
    if (p.primary_care_address) {
      const m = p.primary_care_address.match(/\b\d{5}\b/)
      if (m) return m[0]
      const cityState = p.primary_care_address.split(',').slice(-2).join(',').trim()
      if (cityState) return cityState
    }
  }
  return null
}

export function primaryPlanContext(profiles: HealthProfile[]) {
  const p = profiles[0]
  if (!p) return { carrier: null, plan: null, planType: null }
  return {
    carrier: p.insurance_carrier,
    plan: p.plan_name,
    planType: p.plan_type,
  }
}

export function buildCoverageSystemPrompt(
  profiles: HealthProfile[],
  activeMeds: Medication[],
  webResearch: string,
): string {
  const first = profiles[0]
  const insuranceText = formatInsuranceProfiles(profiles)
  const medsText = formatMedications(activeMeds)

  return `You are Jalayu's Health Coverage Advisor — an expert on US health insurance who combines the member's saved plan data with live web research when provided.

THEIR INSURANCE PROFILES:
${insuranceText}

Active medications:
${medsText}
${first?.conditions?.length ? `Conditions: ${first.conditions.join(', ')}` : ''}
${first?.allergies?.length ? `Allergies: ${first.allergies.join(', ')}` : ''}

${webResearch ? `LIVE WEB RESEARCH (use these findings; cite URLs when you reference them):\n${webResearch}\n` : 'No live web results for this turn — rely on their saved plan data and standard plan-type rules. If they need provider lookup, suggest their carrier website or member services.'}

RULES:
- Answer directly using their actual deductible, copays, and plan type when available.
- For "find a doctor/hospital in my plan": use web research + carrier directory links; give concrete next steps (call member services, use find-a-doctor URL).
- For medications: address coverage tier, prior auth, generics, and interactions cautiously. Say "confirm with your pharmacy benefits manager" for formulary specifics you cannot verify.
- Show cost math when estimating (deductible remaining, copay vs coinsurance).
- NEVER claim you called a doctor's office or verified a specific provider is in-network unless web research states it — say "likely" or "verify on [carrier] directory."
- Include a brief disclaimer when giving medical or coverage advice: final determination is from the insurer.
- Be thorough, specific, and actionable. Use bullet points for steps and options.`
}
