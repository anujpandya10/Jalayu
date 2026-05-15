'use client'

import { useState } from 'react'
import type { HealthProfile, Medication, HealthAppointment, MedicalRecord } from '@/lib/types'

interface HealthViewProps {
  healthProfile: HealthProfile | null
  medications: Medication[]
  appointments: HealthAppointment[]
  records: MedicalRecord[]
}

type Tab = 'overview' | 'medications' | 'appointments' | 'records' | 'coverage'

function formatCents(cents: number | null): string {
  if (cents === null || cents === undefined) return '$0'
  return '$' + (cents / 100).toFixed(0)
}

function maskMemberId(id: string | null): string {
  if (!id) return '—'
  if (id.length <= 4) return id
  return '•••• ' + id.slice(-4)
}

function Badge({ label, color }: { label: string; color?: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 600,
        color: color ?? 'var(--text-2)',
        background: color ? `${color}18` : 'var(--morning)',
        border: `1px solid ${color ? `${color}33` : 'var(--border)'}`,
        borderRadius: 6,
        padding: '2px 7px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {label}
    </span>
  )
}

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px 18px',
        marginBottom: 10,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{value || '—'}</span>
    </div>
  )
}

function InlineInput({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>{label}</label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        style={{
          width: '100%',
          fontSize: 13,
          padding: '7px 10px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg)',
          color: 'var(--text)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }
  return { toast, showToast }
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────
function OverviewTab({
  profile,
  onProfileUpdate,
  showToast,
}: {
  profile: HealthProfile | null
  onProfileUpdate: (p: HealthProfile) => void
  showToast: (m: string) => void
}) {
  const [editInsurance, setEditInsurance] = useState(false)
  const [editPcp, setEditPcp] = useState(false)
  const [editHistory, setEditHistory] = useState(false)

  // Insurance form state
  const [insForm, setInsForm] = useState({
    insurance_carrier: profile?.insurance_carrier ?? '',
    plan_type: profile?.plan_type ?? '',
    member_id: profile?.member_id ?? '',
    deductible_cents: profile?.deductible_cents != null ? String(profile.deductible_cents / 100) : '',
    deductible_met_cents: profile?.deductible_met_cents != null ? String(profile.deductible_met_cents / 100) : '',
    copay_primary_cents: profile?.copay_primary_cents != null ? String(profile.copay_primary_cents / 100) : '',
    copay_specialist_cents:
      profile?.copay_specialist_cents != null ? String(profile.copay_specialist_cents / 100) : '',
    copay_er_cents: profile?.copay_er_cents != null ? String(profile.copay_er_cents / 100) : '',
  })

  // PCP form state
  const [pcpForm, setPcpForm] = useState({
    primary_care_name: profile?.primary_care_name ?? '',
    primary_care_phone: profile?.primary_care_phone ?? '',
    primary_care_address: profile?.primary_care_address ?? '',
  })

  // History form state
  const [histForm, setHistForm] = useState({
    conditions: profile?.conditions?.join(', ') ?? '',
    allergies: profile?.allergies?.join(', ') ?? '',
    blood_type: profile?.blood_type ?? '',
  })

  async function submitInsurance(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      insurance_carrier: insForm.insurance_carrier,
      plan_type: insForm.plan_type,
      member_id: insForm.member_id,
      deductible_cents: insForm.deductible_cents ? Math.round(parseFloat(insForm.deductible_cents) * 100) : null,
      deductible_met_cents: insForm.deductible_met_cents
        ? Math.round(parseFloat(insForm.deductible_met_cents) * 100)
        : null,
      copay_primary_cents: insForm.copay_primary_cents
        ? Math.round(parseFloat(insForm.copay_primary_cents) * 100)
        : null,
      copay_specialist_cents: insForm.copay_specialist_cents
        ? Math.round(parseFloat(insForm.copay_specialist_cents) * 100)
        : null,
      copay_er_cents: insForm.copay_er_cents ? Math.round(parseFloat(insForm.copay_er_cents) * 100) : null,
    }
    try {
      const res = await fetch('/api/health/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.profile) onProfileUpdate(data.profile)
      setEditInsurance(false)
      showToast('Insurance updated')
    } catch {
      showToast('Failed to save')
    }
  }

  async function submitPcp(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/health/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pcpForm) })
      const data = await res.json()
      if (data.profile) onProfileUpdate(data.profile)
      setEditPcp(false)
      showToast('Provider updated')
    } catch {
      showToast('Failed to save')
    }
  }

  async function submitHistory(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      conditions: histForm.conditions ? histForm.conditions.split(',').map((s) => s.trim()).filter(Boolean) : [],
      allergies: histForm.allergies ? histForm.allergies.split(',').map((s) => s.trim()).filter(Boolean) : [],
      blood_type: histForm.blood_type,
    }
    try {
      const res = await fetch('/api/health/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.profile) onProfileUpdate(data.profile)
      setEditHistory(false)
      showToast('Health history updated')
    } catch {
      showToast('Failed to save')
    }
  }

  if (!profile) {
    return (
      <SectionCard style={{ textAlign: 'center', padding: 32 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>No health profile yet</p>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
          Set up your insurance, primary care provider, and health history to get started.
        </p>
      </SectionCard>
    )
  }

  return (
    <>
      {/* Insurance Card */}
      <SectionCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Insurance</span>
          <button
            onClick={() => setEditInsurance(!editInsurance)}
            style={{ fontSize: 12, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
          >
            {editInsurance ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editInsurance ? (
          <form onSubmit={submitInsurance}>
            <InlineInput label="Carrier" name="insurance_carrier" value={insForm.insurance_carrier} onChange={(v) => setInsForm((f) => ({ ...f, insurance_carrier: v }))} />
            <InlineInput label="Plan type (HMO/PPO/etc)" name="plan_type" value={insForm.plan_type} onChange={(v) => setInsForm((f) => ({ ...f, plan_type: v }))} />
            <InlineInput label="Member ID" name="member_id" value={insForm.member_id} onChange={(v) => setInsForm((f) => ({ ...f, member_id: v }))} />
            <InlineInput label="Deductible ($)" name="deductible_cents" value={insForm.deductible_cents} onChange={(v) => setInsForm((f) => ({ ...f, deductible_cents: v }))} type="number" />
            <InlineInput label="Deductible met ($)" name="deductible_met_cents" value={insForm.deductible_met_cents} onChange={(v) => setInsForm((f) => ({ ...f, deductible_met_cents: v }))} type="number" />
            <InlineInput label="Copay primary ($)" name="copay_primary_cents" value={insForm.copay_primary_cents} onChange={(v) => setInsForm((f) => ({ ...f, copay_primary_cents: v }))} type="number" />
            <InlineInput label="Copay specialist ($)" name="copay_specialist_cents" value={insForm.copay_specialist_cents} onChange={(v) => setInsForm((f) => ({ ...f, copay_specialist_cents: v }))} type="number" />
            <InlineInput label="Copay ER ($)" name="copay_er_cents" value={insForm.copay_er_cents} onChange={(v) => setInsForm((f) => ({ ...f, copay_er_cents: v }))} type="number" />
            <button type="submit" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Save</button>
          </form>
        ) : (
          <>
            <FieldRow label="Carrier" value={profile.insurance_carrier} />
            <FieldRow label="Plan" value={profile.plan_type} />
            <FieldRow label="Member ID" value={maskMemberId(profile.member_id)} />
            <FieldRow label="Deductible" value={`${formatCents(profile.deductible_met_cents)} / ${formatCents(profile.deductible_cents)}`} />
            <FieldRow label="Copay Primary" value={formatCents(profile.copay_primary_cents)} />
            <FieldRow label="Copay Specialist" value={formatCents(profile.copay_specialist_cents)} />
            <FieldRow label="Copay ER" value={formatCents(profile.copay_er_cents)} />
          </>
        )}
      </SectionCard>

      {/* Primary Care Card */}
      <SectionCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Primary Care</span>
          <button
            onClick={() => setEditPcp(!editPcp)}
            style={{ fontSize: 12, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
          >
            {editPcp ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editPcp ? (
          <form onSubmit={submitPcp}>
            <InlineInput label="Provider name" name="primary_care_name" value={pcpForm.primary_care_name} onChange={(v) => setPcpForm((f) => ({ ...f, primary_care_name: v }))} />
            <InlineInput label="Phone" name="primary_care_phone" value={pcpForm.primary_care_phone} onChange={(v) => setPcpForm((f) => ({ ...f, primary_care_phone: v }))} />
            <InlineInput label="Address" name="primary_care_address" value={pcpForm.primary_care_address} onChange={(v) => setPcpForm((f) => ({ ...f, primary_care_address: v }))} />
            <button type="submit" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Save</button>
          </form>
        ) : (
          <>
            <FieldRow label="Provider" value={profile.primary_care_name} />
            <FieldRow label="Phone" value={profile.primary_care_phone} />
            <FieldRow label="Address" value={profile.primary_care_address} />
          </>
        )}
      </SectionCard>

      {/* Health History Card */}
      <SectionCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health History</span>
          <button
            onClick={() => setEditHistory(!editHistory)}
            style={{ fontSize: 12, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
          >
            {editHistory ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editHistory ? (
          <form onSubmit={submitHistory}>
            <InlineInput label="Conditions (comma separated)" name="conditions" value={histForm.conditions} onChange={(v) => setHistForm((f) => ({ ...f, conditions: v }))} />
            <InlineInput label="Allergies (comma separated)" name="allergies" value={histForm.allergies} onChange={(v) => setHistForm((f) => ({ ...f, allergies: v }))} />
            <InlineInput label="Blood type" name="blood_type" value={histForm.blood_type} onChange={(v) => setHistForm((f) => ({ ...f, blood_type: v }))} />
            <button type="submit" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Save</button>
          </form>
        ) : (
          <>
            <FieldRow label="Conditions" value={profile.conditions?.join(', ') || '—'} />
            <FieldRow label="Allergies" value={profile.allergies?.join(', ') || '—'} />
            <FieldRow label="Blood type" value={profile.blood_type} />
          </>
        )}
      </SectionCard>
    </>
  )
}

// ── Tab: Medications ──────────────────────────────────────────────────────────
function MedicationsTab({
  medications,
  onAdd,
  onDelete,
  showToast,
}: {
  medications: Medication[]
  onAdd: (m: Medication) => void
  onDelete: (id: string) => void
  showToast: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', dosage_mg: '', frequency: '', prescriber: '', purpose: '', notes: '' })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      name: form.name,
      dosage_mg: form.dosage_mg ? parseFloat(form.dosage_mg) : null,
      frequency: form.frequency || null,
      prescriber: form.prescriber || null,
      purpose: form.purpose || null,
      notes: form.notes || null,
    }
    try {
      const res = await fetch('/api/health/medications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.medication) onAdd(data.medication)
      setForm({ name: '', dosage_mg: '', frequency: '', prescriber: '', purpose: '', notes: '' })
      setShowForm(false)
      showToast('Medication added')
    } catch {
      showToast('Failed to add')
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/health/medications/${id}`, { method: 'DELETE' })
      onDelete(id)
      showToast('Removed')
    } catch {
      showToast('Failed to remove')
    }
  }

  async function handleLogDose(medId: string) {
    try {
      await fetch('/api/health/medication-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medication_id: medId, taken_at: new Date().toISOString() }),
      })
    } catch {
      // ignore
    }
    showToast('Dose logged')
  }

  return (
    <>
      {medications.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 12px' }}>No medications tracked yet.</p>
      )}

      {medications.map((med) => (
        <SectionCard key={med.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {med.name}{med.dosage_mg ? ` ${med.dosage_mg}mg` : ''}
                </span>
                <Badge label={med.is_active ? 'Active' : 'Inactive'} color={med.is_active ? '#15803D' : undefined} />
              </div>
              {med.frequency && (
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 2px' }}>
                  {med.frequency}{med.prescriber ? ` · ${med.prescriber}` : ''}
                </p>
              )}
              {med.purpose && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{med.purpose}</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => handleLogDose(med.id)}
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
              >
                Log dose
              </button>
              <button
                onClick={() => handleDelete(med.id)}
                style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
          </div>
        </SectionCard>
      ))}

      {showForm ? (
        <SectionCard style={{ background: 'var(--morning)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Add medication</p>
          <form onSubmit={handleAdd}>
            <InlineInput label="Name *" name="name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
            <InlineInput label="Dosage (mg)" name="dosage_mg" value={form.dosage_mg} onChange={(v) => setForm((f) => ({ ...f, dosage_mg: v }))} type="number" />
            <InlineInput label="Frequency" name="frequency" value={form.frequency} onChange={(v) => setForm((f) => ({ ...f, frequency: v }))} />
            <InlineInput label="Prescriber" name="prescriber" value={form.prescriber} onChange={(v) => setForm((f) => ({ ...f, prescriber: v }))} />
            <InlineInput label="Purpose" name="purpose" value={form.purpose} onChange={(v) => setForm((f) => ({ ...f, purpose: v }))} />
            <InlineInput label="Notes" name="notes" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Add</button>
              <button type="button" onClick={() => setShowForm(false)} style={{ fontSize: 13, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </SectionCard>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', width: '100%' }}
        >
          + Add medication
        </button>
      )}
    </>
  )
}

// ── Tab: Appointments ─────────────────────────────────────────────────────────
function AppointmentsTab({
  appointments,
  onAdd,
  onDelete,
  showToast,
}: {
  appointments: HealthAppointment[]
  onAdd: (a: HealthAppointment) => void
  onDelete: (id: string) => void
  showToast: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [form, setForm] = useState({ title: '', provider_name: '', appointment_date: '', location: '', reason: '', notes: '' })

  const now = new Date()
  const upcoming = appointments.filter((a) => new Date(a.appointment_date) >= now).sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
  const past = appointments.filter((a) => new Date(a.appointment_date) < now).sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime())

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      title: form.title,
      provider_name: form.provider_name || null,
      appointment_date: form.appointment_date,
      location: form.location || null,
      reason: form.reason || null,
      notes: form.notes || null,
    }
    try {
      const res = await fetch('/api/health/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.appointment) onAdd(data.appointment)
      setForm({ title: '', provider_name: '', appointment_date: '', location: '', reason: '', notes: '' })
      setShowForm(false)
      showToast('Appointment added')
    } catch {
      showToast('Failed to add')
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/health/appointments/${id}`, { method: 'DELETE' })
      onDelete(id)
      showToast('Removed')
    } catch {
      showToast('Failed to remove')
    }
  }

  function AppointmentRow({ appt }: { appt: HealthAppointment }) {
    const d = new Date(appt.appointment_date)
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return (
      <SectionCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>{appt.title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 2px' }}>{dateStr} at {timeStr}</p>
            {appt.provider_name && <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 2px' }}>{appt.provider_name}</p>}
            {appt.location && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 2px' }}>{appt.location}</p>}
            {appt.reason && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{appt.reason}</p>}
          </div>
          <button
            onClick={() => handleDelete(appt.id)}
            style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      </SectionCard>
    )
  }

  return (
    <>
      {upcoming.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 12px' }}>No upcoming appointments.</p>
      )}
      {upcoming.map((a) => <AppointmentRow key={a.id} appt={a} />)}

      {past.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={() => setShowPast(!showPast)}
            style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 8 }}
          >
            {showPast ? '▲' : '▼'} Past ({past.length})
          </button>
          {showPast && past.map((a) => <AppointmentRow key={a.id} appt={a} />)}
        </div>
      )}

      {showForm ? (
        <SectionCard style={{ background: 'var(--morning)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Add appointment</p>
          <form onSubmit={handleAdd}>
            <InlineInput label="Title *" name="title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} required />
            <InlineInput label="Provider" name="provider_name" value={form.provider_name} onChange={(v) => setForm((f) => ({ ...f, provider_name: v }))} />
            <InlineInput label="Date & Time *" name="appointment_date" value={form.appointment_date} onChange={(v) => setForm((f) => ({ ...f, appointment_date: v }))} type="datetime-local" required />
            <InlineInput label="Location" name="location" value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} />
            <InlineInput label="Reason" name="reason" value={form.reason} onChange={(v) => setForm((f) => ({ ...f, reason: v }))} />
            <InlineInput label="Notes" name="notes" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Add</button>
              <button type="button" onClick={() => setShowForm(false)} style={{ fontSize: 13, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </SectionCard>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', width: '100%' }}
        >
          + Add appointment
        </button>
      )}
    </>
  )
}

// ── Tab: Records ──────────────────────────────────────────────────────────────
const RECORD_TYPES = ['lab', 'imaging', 'prescription', 'visit_summary', 'other'] as const
type RecordType = typeof RECORD_TYPES[number]

const RECORD_TYPE_COLORS: Record<RecordType, string> = {
  lab: '#1D4ED8',
  imaging: '#7C3AED',
  prescription: '#15803D',
  visit_summary: '#92400E',
  other: undefined as unknown as string,
}

function RecordsTab({
  records,
  onAdd,
  onDelete,
  showToast,
}: {
  records: MedicalRecord[]
  onAdd: (r: MedicalRecord) => void
  onDelete: (id: string) => void
  showToast: (m: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', record_type: 'lab', record_date: '', file_url: '', notes: '' })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      title: form.title,
      record_type: form.record_type,
      record_date: form.record_date || null,
      file_url: form.file_url || null,
      notes: form.notes || null,
    }
    try {
      const res = await fetch('/api/health/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.record) onAdd(data.record)
      setForm({ title: '', record_type: 'lab', record_date: '', file_url: '', notes: '' })
      setShowForm(false)
      showToast('Record added')
    } catch {
      showToast('Failed to add')
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/health/records/${id}`, { method: 'DELETE' })
      onDelete(id)
      showToast('Removed')
    } catch {
      showToast('Failed to remove')
    }
  }

  const grouped = RECORD_TYPES.reduce<Record<RecordType, MedicalRecord[]>>((acc, type) => {
    acc[type] = records.filter((r) => r.record_type === type)
    return acc
  }, { lab: [], imaging: [], prescription: [], visit_summary: [], other: [] })

  return (
    <>
      {records.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 12px' }}>No records yet.</p>
      )}

      {RECORD_TYPES.map((type) => {
        const group = grouped[type]
        if (group.length === 0) return null
        const color = RECORD_TYPE_COLORS[type]
        return (
          <div key={type} style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
              {type.replace('_', ' ')}
            </p>
            {group.map((rec) => (
              <SectionCard key={rec.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{rec.title}</span>
                      <Badge label={type.replace('_', ' ')} color={color} />
                    </div>
                    {rec.record_date && <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 2px' }}>{new Date(rec.record_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                    {rec.notes && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 2px' }}>{rec.notes}</p>}
                    {rec.file_name && <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>📎 {rec.file_name}</p>}
                  </div>
                  <button
                    onClick={() => handleDelete(rec.id)}
                    style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              </SectionCard>
            ))}
          </div>
        )
      })}

      {showForm ? (
        <SectionCard style={{ background: 'var(--morning)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Add record</p>
          <form onSubmit={handleAdd}>
            <InlineInput label="Title *" name="title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} required />
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>Type</label>
              <select
                value={form.record_type}
                onChange={(e) => setForm((f) => ({ ...f, record_type: e.target.value }))}
                style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <InlineInput label="Date" name="record_date" value={form.record_date} onChange={(v) => setForm((f) => ({ ...f, record_date: v }))} type="date" />
            <InlineInput label="File URL" name="file_url" value={form.file_url} onChange={(v) => setForm((f) => ({ ...f, file_url: v }))} />
            <InlineInput label="Notes" name="notes" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Add</button>
              <button type="button" onClick={() => setShowForm(false)} style={{ fontSize: 13, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </SectionCard>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', width: '100%' }}
        >
          + Add record
        </button>
      )}
    </>
  )
}

// ── Tab: Ask Coverage ─────────────────────────────────────────────────────────
interface QA { question: string; answer: string }

function CoverageTab({ showToast }: { showToast: (m: string) => void }) {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<QA[]>([])

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    const q = question.trim()
    setLoading(true)
    setQuestion('')
    try {
      const res = await fetch('/api/health/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      const answer = data.answer ?? data.message ?? 'No response received.'
      setHistory((h) => [{ question: q, answer }, ...h].slice(0, 3))
    } catch {
      showToast('Failed to get answer')
      setHistory((h) => [{ question: q, answer: 'Something went wrong. Please try again.' }, ...h].slice(0, 3))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <SectionCard style={{ background: 'var(--morning)', marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>Ask about your coverage</p>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Ask questions about what your insurance covers, copays, deductibles, and more.
        </p>
        <form onSubmit={handleAsk} style={{ display: 'flex', gap: 8 }}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your coverage..."
            disabled={loading}
            style={{
              flex: 1,
              fontSize: 13,
              padding: '9px 12px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface)',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: loading ? 'var(--text-3)' : 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              padding: '9px 16px',
              cursor: loading ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            {loading ? '...' : 'Ask'}
          </button>
        </form>
      </SectionCard>

      {loading && (
        <SectionCard>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Thinking...</p>
        </SectionCard>
      )}

      {history.map((qa, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>Q: {qa.question}</p>
          <div
            style={{
              background: 'var(--morning)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, lineHeight: 1.7, fontFamily: 'Lora, Georgia, serif' }}>
              {qa.answer}
            </p>
          </div>
        </div>
      ))}
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function HealthView({
  healthProfile: initialProfile,
  medications: initialMedications,
  appointments: initialAppointments,
  records: initialRecords,
}: HealthViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [profile, setProfile] = useState<HealthProfile | null>(initialProfile)
  const [medications, setMedications] = useState<Medication[]>(initialMedications)
  const [appointments, setAppointments] = useState<HealthAppointment[]>(initialAppointments)
  const [records, setRecords] = useState<MedicalRecord[]>(initialRecords)
  const { toast, showToast } = useToast()

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'medications', label: 'Medications' },
    { id: 'appointments', label: 'Appointments' },
    { id: 'records', label: 'Records' },
    { id: 'coverage', label: 'Ask Coverage' },
  ]

  return (
    <div style={{ padding: '16px 14px', maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Health</h2>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 16px' }}>
        Insurance, medications, appointments, and records
      </p>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 3,
          marginBottom: 18,
          overflowX: 'auto',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              fontSize: 12,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--text)' : 'var(--text-2)',
              background: activeTab === tab.id ? 'var(--morning)' : 'transparent',
              border: activeTab === tab.id ? '1px solid var(--border)' : '1px solid transparent',
              borderRadius: 7,
              padding: '6px 10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab profile={profile} onProfileUpdate={setProfile} showToast={showToast} />
      )}
      {activeTab === 'medications' && (
        <MedicationsTab
          medications={medications}
          onAdd={(m) => setMedications((prev) => [...prev, m])}
          onDelete={(id) => setMedications((prev) => prev.filter((m) => m.id !== id))}
          showToast={showToast}
        />
      )}
      {activeTab === 'appointments' && (
        <AppointmentsTab
          appointments={appointments}
          onAdd={(a) => setAppointments((prev) => [...prev, a])}
          onDelete={(id) => setAppointments((prev) => prev.filter((a) => a.id !== id))}
          showToast={showToast}
        />
      )}
      {activeTab === 'records' && (
        <RecordsTab
          records={records}
          onAdd={(r) => setRecords((prev) => [...prev, r])}
          onDelete={(id) => setRecords((prev) => prev.filter((r) => r.id !== id))}
          showToast={showToast}
        />
      )}
      {activeTab === 'coverage' && <CoverageTab showToast={showToast} />}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            padding: '10px 20px',
            borderRadius: 10,
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
