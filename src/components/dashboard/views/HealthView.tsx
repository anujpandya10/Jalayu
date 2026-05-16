'use client'

import { useState, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import type { HealthProfile, Medication, HealthAppointment, MedicalRecord, Reminder } from '@/lib/types'
import HealthCoverageChat from './HealthCoverageChat'

interface HealthViewProps {
  healthProfiles: HealthProfile[]
  medications: Medication[]
  appointments: HealthAppointment[]
  records: MedicalRecord[]
}

async function healthApiData<T>(res: Response): Promise<{ data?: T; error?: string }> {
  const json = await res.json().catch(() => ({} as { error?: string; data?: T }))
  if (!res.ok) {
    return { error: json.error ?? `Request failed (${res.status})` }
  }
  return { data: json.data as T }
}

type Tab = 'overview' | 'medications' | 'appointments' | 'records' | 'coverage'

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '$0'
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
  placeholder,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
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
        placeholder={placeholder}
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

function SaveBtn({ loading }: { loading?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
        background: loading ? 'var(--text-3)' : 'var(--accent)',
        border: 'none',
        borderRadius: 8,
        padding: '8px 16px',
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? 'Saving…' : 'Save'}
    </button>
  )
}

function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 13,
        color: 'var(--text-2)',
        background: 'none',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 16px',
        cursor: 'pointer',
      }}
    >
      Cancel
    </button>
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

// ── Insurance Card (Overview) ─────────────────────────────────────────────────
const BLANK_INS = {
  profile_label: 'Mine',
  relationship: 'self',
  insurance_carrier: '',
  plan_name: '',
  plan_type: '',
  member_id: '',
  group_number: '',
  deductible_cents: '',
  deductible_met_cents: '',
  copay_primary_cents: '',
  copay_specialist_cents: '',
  copay_er_cents: '',
  insurance_phone: '',
  insurance_website: '',
}

type InsFormState = typeof BLANK_INS

function toInsBody(f: InsFormState) {
  return {
    profile_label: f.profile_label || 'Mine',
    relationship: f.relationship || 'self',
    insurance_carrier: f.insurance_carrier || null,
    plan_name: f.plan_name || null,
    plan_type: f.plan_type || null,
    member_id: f.member_id || null,
    group_number: f.group_number || null,
    deductible_cents: f.deductible_cents ? Math.round(parseFloat(f.deductible_cents) * 100) : null,
    deductible_met_cents: f.deductible_met_cents ? Math.round(parseFloat(f.deductible_met_cents) * 100) : null,
    copay_primary_cents: f.copay_primary_cents ? Math.round(parseFloat(f.copay_primary_cents) * 100) : null,
    copay_specialist_cents: f.copay_specialist_cents ? Math.round(parseFloat(f.copay_specialist_cents) * 100) : null,
    copay_er_cents: f.copay_er_cents ? Math.round(parseFloat(f.copay_er_cents) * 100) : null,
    insurance_phone: f.insurance_phone || null,
    insurance_website: f.insurance_website || null,
  }
}

function profileToForm(p: HealthProfile): InsFormState {
  return {
    profile_label: p.profile_label ?? 'Mine',
    relationship: p.relationship ?? 'self',
    insurance_carrier: p.insurance_carrier ?? '',
    plan_name: p.plan_name ?? '',
    plan_type: p.plan_type ?? '',
    member_id: p.member_id ?? '',
    group_number: p.group_number ?? '',
    deductible_cents: p.deductible_cents != null ? String(p.deductible_cents / 100) : '',
    deductible_met_cents: p.deductible_met_cents != null ? String(p.deductible_met_cents / 100) : '',
    copay_primary_cents: p.copay_primary_cents != null ? String(p.copay_primary_cents / 100) : '',
    copay_specialist_cents: p.copay_specialist_cents != null ? String(p.copay_specialist_cents / 100) : '',
    copay_er_cents: p.copay_er_cents != null ? String(p.copay_er_cents / 100) : '',
    insurance_phone: p.insurance_phone ?? '',
    insurance_website: p.insurance_website ?? '',
  }
}

function InsuranceForm({
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial: InsFormState
  onSave: (f: InsFormState) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}) {
  const [form, setForm] = useState<InsFormState>(initial)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  const set = (k: keyof InsFormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 0 }}>
        <div style={{ flex: 1 }}>
          <InlineInput label="Label (Mine / Spouse / Child name)" name="profile_label" value={form.profile_label} onChange={set('profile_label')} placeholder="Mine" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>Relationship</label>
          <select
            value={form.relationship}
            onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
            style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
          >
            <option value="self">Self</option>
            <option value="spouse">Spouse</option>
            <option value="child">Child</option>
            <option value="parent">Parent</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <InlineInput label="Insurance carrier" name="insurance_carrier" value={form.insurance_carrier} onChange={set('insurance_carrier')} placeholder="e.g. Blue Cross Blue Shield" />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><InlineInput label="Plan name" name="plan_name" value={form.plan_name} onChange={set('plan_name')} placeholder="e.g. Blue Choice PPO" /></div>
        <div style={{ flex: 1 }}><InlineInput label="Plan type" name="plan_type" value={form.plan_type} onChange={set('plan_type')} placeholder="HMO / PPO / HDHP" /></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><InlineInput label="Member ID" name="member_id" value={form.member_id} onChange={set('member_id')} /></div>
        <div style={{ flex: 1 }}><InlineInput label="Group #" name="group_number" value={form.group_number} onChange={set('group_number')} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><InlineInput label="Deductible ($)" name="deductible_cents" type="number" value={form.deductible_cents} onChange={set('deductible_cents')} /></div>
        <div style={{ flex: 1 }}><InlineInput label="Deductible met ($)" name="deductible_met_cents" type="number" value={form.deductible_met_cents} onChange={set('deductible_met_cents')} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><InlineInput label="Copay primary ($)" name="copay_primary_cents" type="number" value={form.copay_primary_cents} onChange={set('copay_primary_cents')} /></div>
        <div style={{ flex: 1 }}><InlineInput label="Copay specialist ($)" name="copay_specialist_cents" type="number" value={form.copay_specialist_cents} onChange={set('copay_specialist_cents')} /></div>
        <div style={{ flex: 1 }}><InlineInput label="Copay ER ($)" name="copay_er_cents" type="number" value={form.copay_er_cents} onChange={set('copay_er_cents')} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><InlineInput label="Insurance phone" name="insurance_phone" value={form.insurance_phone} onChange={set('insurance_phone')} /></div>
        <div style={{ flex: 1 }}><InlineInput label="Insurance website" name="insurance_website" value={form.insurance_website} onChange={set('insurance_website')} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <SaveBtn loading={saving} />
        <CancelBtn onClick={onCancel} />
      </div>
    </form>
  )
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────
function OverviewTab({
  profiles,
  onProfileAdd,
  onProfileUpdate,
  onProfileDelete,
  onReloadProfiles,
  showToast,
}: {
  profiles: HealthProfile[]
  onProfileAdd: (p: HealthProfile) => void
  onProfileUpdate: (p: HealthProfile) => void
  onProfileDelete: (id: string) => void
  onReloadProfiles: () => Promise<void>
  showToast: (m: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editPcp, setEditPcp] = useState(false)
  const [editHistory, setEditHistory] = useState(false)

  // PCP/history from first (self) profile
  const baseProfile = profiles.find((p) => p.relationship === 'self') ?? profiles[0] ?? null

  const [pcpForm, setPcpForm] = useState({
    primary_care_name: baseProfile?.primary_care_name ?? '',
    primary_care_phone: baseProfile?.primary_care_phone ?? '',
    primary_care_address: baseProfile?.primary_care_address ?? '',
  })
  const [histForm, setHistForm] = useState({
    conditions: baseProfile?.conditions?.join(', ') ?? '',
    allergies: baseProfile?.allergies?.join(', ') ?? '',
    blood_type: baseProfile?.blood_type ?? '',
  })

  async function handleAddInsurance(f: InsFormState) {
    const res = await fetch('/api/health/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toInsBody(f)),
    })
    const { data, error } = await healthApiData<HealthProfile>(res)
    if (data) {
      onProfileAdd(data)
      await onReloadProfiles()
      setShowAddForm(false)
      showToast('Insurance added')
    } else {
      showToast(error ?? 'Failed to save')
    }
  }

  async function handleUpdateInsurance(id: string, f: InsFormState) {
    const res = await fetch('/api/health/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...toInsBody(f) }),
    })
    const { data, error } = await healthApiData<HealthProfile>(res)
    if (data) {
      onProfileUpdate(data)
      await onReloadProfiles()
      setEditingId(null)
      showToast('Insurance updated')
    } else {
      showToast(error ?? 'Failed to save')
    }
  }

  async function handleDeleteInsurance(id: string) {
    if (!confirm('Delete this insurance profile?')) return
    const res = await fetch('/api/health/profile', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const { error } = await healthApiData<{ id: string }>(res)
    if (!error) {
      onProfileDelete(id)
      await onReloadProfiles()
      showToast('Deleted')
    } else {
      showToast(error)
    }
  }

  async function submitPcp(e: React.FormEvent) {
    e.preventDefault()
    if (!baseProfile) {
      const res = await fetch('/api/health/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pcpForm, profile_label: 'Mine', relationship: 'self' }),
      })
      const { data, error } = await healthApiData<HealthProfile>(res)
      if (data) {
        onProfileAdd(data)
        await onReloadProfiles()
        setEditPcp(false)
        showToast('Provider saved')
      } else {
        showToast(error ?? 'Failed to save')
      }
      return
    }
    const res = await fetch('/api/health/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: baseProfile.id, ...pcpForm }),
    })
    const { data, error } = await healthApiData<HealthProfile>(res)
    if (data) {
      onProfileUpdate(data)
      await onReloadProfiles()
      setEditPcp(false)
      showToast('Provider updated')
    } else {
      showToast(error ?? 'Failed to save')
    }
  }

  async function submitHistory(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      conditions: histForm.conditions ? histForm.conditions.split(',').map((s) => s.trim()).filter(Boolean) : [],
      allergies: histForm.allergies ? histForm.allergies.split(',').map((s) => s.trim()).filter(Boolean) : [],
      blood_type: histForm.blood_type,
    }
    if (!baseProfile) {
      const res = await fetch('/api/health/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, profile_label: 'Mine', relationship: 'self' }),
      })
      const { data, error } = await healthApiData<HealthProfile>(res)
      if (data) {
        onProfileAdd(data)
        await onReloadProfiles()
        setEditHistory(false)
        showToast('Health history saved')
      } else {
        showToast(error ?? 'Failed to save')
      }
      return
    }
    const res = await fetch('/api/health/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: baseProfile.id, ...body }),
    })
    const { data, error } = await healthApiData<HealthProfile>(res)
    if (data) {
      onProfileUpdate(data)
      await onReloadProfiles()
      setEditHistory(false)
      showToast('Health history updated')
    } else {
      showToast(error ?? 'Failed to save')
    }
  }

  return (
    <>
      {/* Insurance profiles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
          Insurance Profiles
        </p>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}
          >
            + Add
          </button>
        )}
      </div>

      {profiles.length === 0 && !showAddForm && (
        <SectionCard style={{ textAlign: 'center', padding: 28 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>No insurance profiles yet</p>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 12px', lineHeight: 1.6 }}>
            Add your own, your spouse&apos;s, or your children&apos;s insurance.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
          >
            + Add insurance
          </button>
        </SectionCard>
      )}

      {profiles.map((prof) => (
        <SectionCard key={prof.id}>
          {editingId === prof.id ? (
            <>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Edit insurance</p>
              <InsuranceForm
                initial={profileToForm(prof)}
                onSave={(f) => handleUpdateInsurance(prof.id, f)}
                onCancel={() => setEditingId(null)}
              />
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {prof.profile_label || 'Mine'}
                  </span>
                  {prof.relationship && prof.relationship !== 'self' && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>({prof.relationship})</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setEditingId(prof.id)}
                    style={{ fontSize: 12, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteInsurance(prof.id)}
                    style={{ fontSize: 12, color: '#DC2626', background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <FieldRow label="Carrier" value={prof.insurance_carrier} />
              {prof.plan_name && <FieldRow label="Plan" value={prof.plan_name} />}
              <FieldRow label="Type" value={prof.plan_type} />
              <FieldRow label="Member ID" value={maskMemberId(prof.member_id)} />
              {prof.group_number && <FieldRow label="Group #" value={prof.group_number} />}
              <FieldRow label="Deductible" value={`${formatCents(prof.deductible_met_cents)} / ${formatCents(prof.deductible_cents)}`} />
              <FieldRow label="Copay Primary" value={formatCents(prof.copay_primary_cents)} />
              <FieldRow label="Copay Specialist" value={formatCents(prof.copay_specialist_cents)} />
              <FieldRow label="Copay ER" value={formatCents(prof.copay_er_cents)} />
              {prof.insurance_phone && <FieldRow label="Phone" value={prof.insurance_phone} />}
            </>
          )}
        </SectionCard>
      ))}

      {showAddForm && (
        <SectionCard style={{ background: 'var(--morning)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Add insurance profile</p>
          <InsuranceForm
            initial={{ ...BLANK_INS }}
            onSave={handleAddInsurance}
            onCancel={() => setShowAddForm(false)}
          />
        </SectionCard>
      )}

      {/* Primary Care */}
      <SectionCard style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Primary Care</span>
          <button
            onClick={() => { setPcpForm({ primary_care_name: baseProfile?.primary_care_name ?? '', primary_care_phone: baseProfile?.primary_care_phone ?? '', primary_care_address: baseProfile?.primary_care_address ?? '' }); setEditPcp(!editPcp) }}
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
            <div style={{ display: 'flex', gap: 8 }}><SaveBtn /><CancelBtn onClick={() => setEditPcp(false)} /></div>
          </form>
        ) : (
          <>
            <FieldRow label="Provider" value={baseProfile?.primary_care_name} />
            <FieldRow label="Phone" value={baseProfile?.primary_care_phone} />
            <FieldRow label="Address" value={baseProfile?.primary_care_address} />
          </>
        )}
      </SectionCard>

      {/* Health History */}
      <SectionCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health History</span>
          <button
            onClick={() => { setHistForm({ conditions: baseProfile?.conditions?.join(', ') ?? '', allergies: baseProfile?.allergies?.join(', ') ?? '', blood_type: baseProfile?.blood_type ?? '' }); setEditHistory(!editHistory) }}
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
            <div style={{ display: 'flex', gap: 8 }}><SaveBtn /><CancelBtn onClick={() => setEditHistory(false)} /></div>
          </form>
        ) : (
          <>
            <FieldRow label="Conditions" value={baseProfile?.conditions?.join(', ') || '—'} />
            <FieldRow label="Allergies" value={baseProfile?.allergies?.join(', ') || '—'} />
            <FieldRow label="Blood type" value={baseProfile?.blood_type} />
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
  onUpdate,
  onDelete,
  onAddReminder,
  showToast,
}: {
  medications: Medication[]
  onAdd: (m: Medication) => void
  onUpdate: (m: Medication) => void
  onDelete: (id: string) => void
  onAddReminder: (r: Reminder) => void
  showToast: (m: string) => void
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({ name: '', dosage_mg: '', frequency: '', prescriber: '', purpose: '', notes: '' })
  const [editForm, setEditForm] = useState({ name: '', dosage_mg: '', frequency: '', prescriber: '', purpose: '', notes: '' })
  const [reminderPrompt, setReminderPrompt] = useState<{ medName: string } | null>(null)
  const [reminderTime, setReminderTime] = useState('08:00')
  const [savingReminder, setSavingReminder] = useState(false)

  async function createMedReminder(medName: string, time: string) {
    const { buildMedicationReminderFields } = await import('@/lib/medication-reminder')
    const { createClient } = await import('@/lib/supabase')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const fields = buildMedicationReminderFields(medName, time)
    const { data, error } = await supabase
      .from('reminders')
      .insert({ user_id: user.id, ...fields })
      .select()
      .single()
    if (!error && data) {
      onAddReminder(data as Reminder)
      showToast('Daily reminder added to calendar')
    } else {
      showToast('Could not save reminder')
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const medName = addForm.name.trim()
    const body = {
      name: medName,
      dosage_mg: addForm.dosage_mg ? parseFloat(addForm.dosage_mg) : null,
      frequency: addForm.frequency || null,
      prescriber: addForm.prescriber || null,
      purpose: addForm.purpose || null,
      notes: addForm.notes || null,
    }
    try {
      const res = await fetch('/api/health/medications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.data) {
        onAdd(data.data)
        setReminderPrompt({ medName })
        setReminderTime('08:00')
      }
      setAddForm({ name: '', dosage_mg: '', frequency: '', prescriber: '', purpose: '', notes: '' })
      setShowAddForm(false)
      showToast('Medication added')
    } catch {
      showToast('Failed to add')
    }
  }

  async function handleUpdate(e: React.FormEvent, id: string) {
    e.preventDefault()
    const body = {
      id,
      name: editForm.name,
      dosage_mg: editForm.dosage_mg ? parseFloat(editForm.dosage_mg) : null,
      frequency: editForm.frequency || null,
      prescriber: editForm.prescriber || null,
      purpose: editForm.purpose || null,
      notes: editForm.notes || null,
    }
    try {
      const res = await fetch('/api/health/medications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.data) onUpdate(data.data)
      setEditingId(null)
      showToast('Updated')
    } catch {
      showToast('Failed to update')
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch('/api/health/medications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
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
    } catch { /* ignore */ }
    showToast('Dose logged')
  }

  function startEdit(med: Medication) {
    setEditForm({
      name: med.name,
      dosage_mg: med.dosage_mg != null ? String(med.dosage_mg) : '',
      frequency: med.frequency ?? '',
      prescriber: med.prescriber ?? '',
      purpose: med.purpose ?? '',
      notes: med.notes ?? '',
    })
    setEditingId(med.id)
  }

  const setA = (k: keyof typeof addForm) => (v: string) => setAddForm((f) => ({ ...f, [k]: v }))
  const setE = (k: keyof typeof editForm) => (v: string) => setEditForm((f) => ({ ...f, [k]: v }))

  return (
    <>
      {reminderPrompt && (
        <SectionCard>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>
            Daily reminder for {reminderPrompt.medName}?
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px' }}>
            Shows on your home calendar every day.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              style={{ fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--morning)', color: 'var(--text)' }}
            />
            <button
              type="button"
              disabled={savingReminder}
              onClick={async () => {
                setSavingReminder(true)
                try {
                  await createMedReminder(reminderPrompt.medName, reminderTime)
                } finally {
                  setSavingReminder(false)
                  setReminderPrompt(null)
                }
              }}
              style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}
            >
              {savingReminder ? 'Saving…' : 'Set reminder'}
            </button>
            <button
              type="button"
              onClick={() => setReminderPrompt(null)}
              style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Skip
            </button>
          </div>
        </SectionCard>
      )}

      {medications.length === 0 && !showAddForm && (
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 12px' }}>No medications tracked yet.</p>
      )}

      {medications.map((med) => (
        <SectionCard key={med.id}>
          {editingId === med.id ? (
            <>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Edit medication</p>
              <form onSubmit={(e) => handleUpdate(e, med.id)}>
                <InlineInput label="Name *" name="name" value={editForm.name} onChange={setE('name')} required />
                <InlineInput label="Dosage (mg)" name="dosage_mg" type="number" value={editForm.dosage_mg} onChange={setE('dosage_mg')} />
                <InlineInput label="Frequency" name="frequency" value={editForm.frequency} onChange={setE('frequency')} />
                <InlineInput label="Prescriber" name="prescriber" value={editForm.prescriber} onChange={setE('prescriber')} />
                <InlineInput label="Purpose" name="purpose" value={editForm.purpose} onChange={setE('purpose')} />
                <InlineInput label="Notes" name="notes" value={editForm.notes} onChange={setE('notes')} />
                <div style={{ display: 'flex', gap: 8 }}><SaveBtn /><CancelBtn onClick={() => setEditingId(null)} /></div>
              </form>
            </>
          ) : (
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
                {med.purpose && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{med.purpose}</p>}
              </div>
              <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleLogDose(med.id)}
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                >
                  Log dose
                </button>
                <button
                  onClick={() => startEdit(med)}
                  style={{ fontSize: 11, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(med.id)}
                  style={{ fontSize: 11, color: '#DC2626', background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      ))}

      {showAddForm ? (
        <SectionCard style={{ background: 'var(--morning)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Add medication</p>
          <form onSubmit={handleAdd}>
            <InlineInput label="Name *" name="name" value={addForm.name} onChange={setA('name')} required />
            <InlineInput label="Dosage (mg)" name="dosage_mg" type="number" value={addForm.dosage_mg} onChange={setA('dosage_mg')} />
            <InlineInput label="Frequency" name="frequency" value={addForm.frequency} onChange={setA('frequency')} placeholder="e.g. Once daily" />
            <InlineInput label="Prescriber" name="prescriber" value={addForm.prescriber} onChange={setA('prescriber')} />
            <InlineInput label="Purpose" name="purpose" value={addForm.purpose} onChange={setA('purpose')} />
            <InlineInput label="Notes" name="notes" value={addForm.notes} onChange={setA('notes')} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Add</button>
              <CancelBtn onClick={() => setShowAddForm(false)} />
            </div>
          </form>
        </SectionCard>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
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
  onUpdate,
  onDelete,
  showToast,
}: {
  appointments: HealthAppointment[]
  onAdd: (a: HealthAppointment) => void
  onUpdate: (a: HealthAppointment) => void
  onDelete: (id: string) => void
  showToast: (m: string) => void
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  const blankForm = { title: '', provider_name: '', appointment_date: '', location: '', reason: '', notes: '' }
  const [addForm, setAddForm] = useState(blankForm)
  const [editForm, setEditForm] = useState(blankForm)

  const now = new Date()
  const upcoming = appointments.filter((a) => new Date(a.appointment_date) >= now).sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
  const past = appointments.filter((a) => new Date(a.appointment_date) < now).sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime())

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/health/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: addForm.title,
          provider_name: addForm.provider_name || null,
          appointment_date: addForm.appointment_date,
          location: addForm.location || null,
          reason: addForm.reason || null,
          notes: addForm.notes || null,
        }),
      })
      const data = await res.json()
      if (data.data) onAdd(data.data)
      setAddForm(blankForm)
      setShowAddForm(false)
      showToast('Appointment added')
    } catch {
      showToast('Failed to add')
    }
  }

  async function handleUpdate(e: React.FormEvent, id: string) {
    e.preventDefault()
    try {
      const res = await fetch('/api/health/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          title: editForm.title,
          provider_name: editForm.provider_name || null,
          appointment_date: editForm.appointment_date,
          location: editForm.location || null,
          reason: editForm.reason || null,
          notes: editForm.notes || null,
        }),
      })
      const data = await res.json()
      if (data.data) onUpdate(data.data)
      setEditingId(null)
      showToast('Updated')
    } catch {
      showToast('Failed to update')
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch('/api/health/appointments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      onDelete(id)
      showToast('Removed')
    } catch {
      showToast('Failed to remove')
    }
  }

  function startEdit(appt: HealthAppointment) {
    // Format date for datetime-local input
    const dateStr = appt.appointment_date.slice(0, 16) // 'YYYY-MM-DDTHH:MM'
    setEditForm({
      title: appt.title,
      provider_name: appt.provider_name ?? '',
      appointment_date: dateStr,
      location: appt.location ?? '',
      reason: appt.reason ?? '',
      notes: appt.notes ?? '',
    })
    setEditingId(appt.id)
  }

  const setA = (k: keyof typeof blankForm) => (v: string) => setAddForm((f) => ({ ...f, [k]: v }))
  const setE = (k: keyof typeof blankForm) => (v: string) => setEditForm((f) => ({ ...f, [k]: v }))

  function ApptRow({ appt }: { appt: HealthAppointment }) {
    const d = new Date(appt.appointment_date)
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return (
      <SectionCard>
        {editingId === appt.id ? (
          <>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Edit appointment</p>
            <form onSubmit={(e) => handleUpdate(e, appt.id)}>
              <InlineInput label="Title *" name="title" value={editForm.title} onChange={setE('title')} required />
              <InlineInput label="Provider" name="provider_name" value={editForm.provider_name} onChange={setE('provider_name')} />
              <InlineInput label="Date & Time *" name="appointment_date" type="datetime-local" value={editForm.appointment_date} onChange={setE('appointment_date')} required />
              <InlineInput label="Location" name="location" value={editForm.location} onChange={setE('location')} />
              <InlineInput label="Reason" name="reason" value={editForm.reason} onChange={setE('reason')} />
              <InlineInput label="Notes" name="notes" value={editForm.notes} onChange={setE('notes')} />
              <div style={{ display: 'flex', gap: 8 }}><SaveBtn /><CancelBtn onClick={() => setEditingId(null)} /></div>
            </form>
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 3px' }}>{appt.title}</p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 2px' }}>{dateStr} at {timeStr}</p>
              {appt.provider_name && <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 2px' }}>{appt.provider_name}</p>}
              {appt.location && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 2px' }}>{appt.location}</p>}
              {appt.reason && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{appt.reason}</p>}
            </div>
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <button
                onClick={() => startEdit(appt)}
                style={{ fontSize: 11, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(appt.id)}
                style={{ fontSize: 11, color: '#DC2626', background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    )
  }

  return (
    <>
      {upcoming.length === 0 && !showAddForm && (
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 12px' }}>No upcoming appointments.</p>
      )}
      {upcoming.map((a) => <ApptRow key={a.id} appt={a} />)}

      {past.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={() => setShowPast(!showPast)}
            style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 8 }}
          >
            {showPast ? '▲' : '▼'} Past ({past.length})
          </button>
          {showPast && past.map((a) => <ApptRow key={a.id} appt={a} />)}
        </div>
      )}

      {showAddForm ? (
        <SectionCard style={{ background: 'var(--morning)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Add appointment</p>
          <form onSubmit={handleAdd}>
            <InlineInput label="Title *" name="title" value={addForm.title} onChange={setA('title')} required />
            <InlineInput label="Provider" name="provider_name" value={addForm.provider_name} onChange={setA('provider_name')} />
            <InlineInput label="Date & Time *" name="appointment_date" type="datetime-local" value={addForm.appointment_date} onChange={setA('appointment_date')} required />
            <InlineInput label="Location" name="location" value={addForm.location} onChange={setA('location')} />
            <InlineInput label="Reason" name="reason" value={addForm.reason} onChange={setA('reason')} />
            <InlineInput label="Notes" name="notes" value={addForm.notes} onChange={setA('notes')} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Add</button>
              <CancelBtn onClick={() => setShowAddForm(false)} />
            </div>
          </form>
        </SectionCard>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
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

const RECORD_TYPE_COLORS: Record<RecordType, string | undefined> = {
  lab: '#1D4ED8',
  imaging: '#7C3AED',
  prescription: '#15803D',
  visit_summary: '#92400E',
  other: undefined,
}

function RecordsTab({
  records,
  onAdd,
  onUpdate,
  onDelete,
  showToast,
}: {
  records: MedicalRecord[]
  onAdd: (r: MedicalRecord) => void
  onUpdate: (r: MedicalRecord) => void
  onDelete: (id: string) => void
  showToast: (m: string) => void
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const blankForm = { title: '', record_type: 'lab', record_date: '', file_url: '', notes: '' }
  const [addForm, setAddForm] = useState(blankForm)
  const [editForm, setEditForm] = useState(blankForm)

  const setA = (k: keyof typeof blankForm) => (v: string) => setAddForm((f) => ({ ...f, [k]: v }))
  const setE = (k: keyof typeof blankForm) => (v: string) => setEditForm((f) => ({ ...f, [k]: v }))

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/health/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: addForm.title,
          record_type: addForm.record_type,
          record_date: addForm.record_date || null,
          file_url: addForm.file_url || null,
          notes: addForm.notes || null,
        }),
      })
      const data = await res.json()
      if (data.data) onAdd(data.data)
      setAddForm(blankForm)
      setShowAddForm(false)
      showToast('Record added')
    } catch {
      showToast('Failed to add')
    }
  }

  async function handleUpdate(e: React.FormEvent, id: string) {
    e.preventDefault()
    try {
      const res = await fetch('/api/health/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          title: editForm.title,
          record_type: editForm.record_type,
          record_date: editForm.record_date || null,
          file_url: editForm.file_url || null,
          notes: editForm.notes || null,
        }),
      })
      const data = await res.json()
      if (data.data) onUpdate(data.data)
      setEditingId(null)
      showToast('Updated')
    } catch {
      showToast('Failed to update')
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch('/api/health/records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      onDelete(id)
      showToast('Removed')
    } catch {
      showToast('Failed to remove')
    }
  }

  function startEdit(rec: MedicalRecord) {
    setEditForm({
      title: rec.title,
      record_type: rec.record_type,
      record_date: rec.record_date ?? '',
      file_url: rec.file_url ?? '',
      notes: rec.notes ?? '',
    })
    setEditingId(rec.id)
  }

  function TypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>Type</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
        >
          {RECORD_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace('_', ' ')}</option>
          ))}
        </select>
      </div>
    )
  }

  const grouped = RECORD_TYPES.reduce<Record<RecordType, MedicalRecord[]>>((acc, type) => {
    acc[type] = records.filter((r) => r.record_type === type)
    return acc
  }, { lab: [], imaging: [], prescription: [], visit_summary: [], other: [] })

  return (
    <>
      {records.length === 0 && !showAddForm && (
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
                {editingId === rec.id ? (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Edit record</p>
                    <form onSubmit={(e) => handleUpdate(e, rec.id)}>
                      <InlineInput label="Title *" name="title" value={editForm.title} onChange={setE('title')} required />
                      <TypeSelect value={editForm.record_type} onChange={setE('record_type')} />
                      <InlineInput label="Date" name="record_date" type="date" value={editForm.record_date} onChange={setE('record_date')} />
                      <InlineInput label="File URL" name="file_url" value={editForm.file_url} onChange={setE('file_url')} />
                      <InlineInput label="Notes" name="notes" value={editForm.notes} onChange={setE('notes')} />
                      <div style={{ display: 'flex', gap: 8 }}><SaveBtn /><CancelBtn onClick={() => setEditingId(null)} /></div>
                    </form>
                  </>
                ) : (
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
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      <button
                        onClick={() => startEdit(rec)}
                        style={{ fontSize: 11, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(rec.id)}
                        style={{ fontSize: 11, color: '#DC2626', background: 'none', border: '1px solid #FCA5A5', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </SectionCard>
            ))}
          </div>
        )
      })}

      {showAddForm ? (
        <SectionCard style={{ background: 'var(--morning)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Add record</p>
          <form onSubmit={handleAdd}>
            <InlineInput label="Title *" name="title" value={addForm.title} onChange={setA('title')} required />
            <TypeSelect value={addForm.record_type} onChange={setA('record_type')} />
            <InlineInput label="Date" name="record_date" type="date" value={addForm.record_date} onChange={setA('record_date')} />
            <InlineInput label="File URL" name="file_url" value={addForm.file_url} onChange={setA('file_url')} />
            <InlineInput label="Notes" name="notes" value={addForm.notes} onChange={setA('notes')} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Add</button>
              <CancelBtn onClick={() => setShowAddForm(false)} />
            </div>
          </form>
        </SectionCard>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', width: '100%' }}
        >
          + Add record
        </button>
      )}
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function HealthView({
  healthProfiles,
  medications,
  appointments,
  records,
}: HealthViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const {
    setHealthProfiles,
    addHealthProfile,
    updateHealthProfile,
    removeHealthProfile,
    addMedication,
    updateMedication,
    removeMedication,
    addHealthAppointment,
    updateHealthAppointment,
    removeHealthAppointment,
    addMedicalRecord,
    updateMedicalRecord,
    removeMedicalRecord,
    addReminder,
  } = useStore()
  const { toast, showToast } = useToast()

  const reloadProfiles = useCallback(async () => {
    const res = await fetch('/api/health/profile')
    const { data, error } = await healthApiData<HealthProfile[]>(res)
    if (data) setHealthProfiles(data)
    else if (error) console.error('[Health] reload profiles:', error)
  }, [setHealthProfiles])

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'medications', label: 'Medications' },
    { id: 'appointments', label: 'Appointments' },
    { id: 'records', label: 'Records' },
    { id: 'coverage', label: 'Coverage AI' },
  ]

  return (
    <div style={{ padding: '16px 14px', maxWidth: 640, margin: '0 auto' }}>
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
        <OverviewTab
          profiles={healthProfiles}
          onProfileAdd={addHealthProfile}
          onProfileUpdate={updateHealthProfile}
          onProfileDelete={removeHealthProfile}
          onReloadProfiles={reloadProfiles}
          showToast={showToast}
        />
      )}
      {activeTab === 'medications' && (
        <MedicationsTab
          medications={medications}
          onAdd={addMedication}
          onUpdate={updateMedication}
          onDelete={removeMedication}
          onAddReminder={addReminder}
          showToast={showToast}
        />
      )}
      {activeTab === 'appointments' && (
        <AppointmentsTab
          appointments={appointments}
          onAdd={addHealthAppointment}
          onUpdate={updateHealthAppointment}
          onDelete={removeHealthAppointment}
          showToast={showToast}
        />
      )}
      {activeTab === 'records' && (
        <RecordsTab
          records={records}
          onAdd={addMedicalRecord}
          onUpdate={updateMedicalRecord}
          onDelete={removeMedicalRecord}
          showToast={showToast}
        />
      )}
      {activeTab === 'coverage' && <HealthCoverageChat showToast={showToast} />}

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
