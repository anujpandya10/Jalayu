'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Stethoscope } from 'lucide-react'
import type { HealthProfile, Medication, Reminder } from '@/lib/types'

const AMBER = '#00C9A7'

function selfProfile(profiles: HealthProfile[]): HealthProfile | null {
  return profiles.find((p) => p.relationship === 'self') ?? profiles[0] ?? null
}

export default function HealthCompact({
  healthProfiles,
  medications,
  reminders,
  onOpenHealth,
}: {
  healthProfiles: HealthProfile[]
  medications: Medication[]
  reminders: Reminder[]
  onOpenHealth: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  const profile = selfProfile(healthProfiles)
  const pcpName = profile?.primary_care_name?.trim()
  const pcpPhone = profile?.primary_care_phone?.trim()
  const pcpAddress = profile?.primary_care_address?.trim()
  const hasPcp = Boolean(pcpName || pcpPhone || pcpAddress)

  const activeMeds = medications.filter((m) => m.is_active)
  const medReminders = reminders.filter((r) => r.is_active && r.type === 'medication')

  const lines = useMemo(() => {
    const out: { label: string; value: string }[] = []
    if (pcpName) out.push({ label: 'PCP', value: pcpName })
    if (pcpPhone) out.push({ label: 'Phone', value: pcpPhone })
    if (pcpAddress) out.push({ label: 'Address', value: pcpAddress })
    if (activeMeds.length > 0) {
      out.push({ label: 'Meds', value: `${activeMeds.length} active` })
    }
    if (medReminders.length > 0) {
      out.push({ label: 'Reminders', value: `${medReminders.length} daily` })
    }
    return out
  }, [pcpName, pcpPhone, pcpAddress, activeMeds.length, medReminders.length])

  const hasContent = hasPcp || activeMeds.length > 0

  return (
    <button
      type="button"
      onClick={onOpenHealth}
      style={{
        width: '100%', height: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18,
        padding: '14px 16px', fontFamily: 'inherit', boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: collapsed ? 0 : 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {hasContent && (
            <span
              role="presentation"
              onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed) }}
              style={{ color: 'var(--text-3)', display: 'flex', marginTop: 2, cursor: 'pointer' }}
            >
              {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </span>
          )}
          <span style={{
            width: 28, height: 28, borderRadius: '50%', background: `${AMBER}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Stethoscope size={14} color={AMBER} />
          </span>
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>Health</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {hasPcp ? pcpName : 'Insurance & meds'}
            </p>
            {collapsed && hasContent && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>Tap to open health</p>
            )}
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>→</span>
      </div>

      {!collapsed && (
        hasContent ? (
          <div style={{ paddingLeft: 36 }}>
            {lines.map((line) => (
              <p key={line.label} style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 4px', lineHeight: 1.45 }}>
                <span style={{ color: 'var(--text-3)' }}>{line.label}: </span>
                {line.value}
              </p>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, paddingLeft: 36, lineHeight: 1.5 }}>
            Coverage, appointments & records
          </p>
        )
      )}
    </button>
  )
}
