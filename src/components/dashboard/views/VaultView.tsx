'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Lock, Unlock, Loader2, Eye, EyeOff, Plus, Trash2, Pencil,
  Copy, Check, ShieldAlert, KeyRound, Shield,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  initVaultMaterial, unlockVault, encryptString, decryptString,
} from '@/lib/vault-crypto'

interface VaultEntry {
  id: string
  name: string
  kind: string
  ciphertext: string
  iv: string
  created_at: string
  updated_at: string
}

interface VaultSettings {
  initialized: boolean
  salt?: string
  iterations?: number
  verification_blob?: string
  verification_iv?: string
  locked_seconds_remaining?: number
}

const KIND_LABEL: Record<string, string> = {
  password: 'Password',
  note: 'Note',
  card: 'Card',
  secret: 'Secret',
}

type DecryptedMap = Record<string, { value: string; visible: boolean } | undefined>

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function VaultView() {
  const [settings, setSettings] = useState<VaultSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null)
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [decrypted, setDecrypted] = useState<DecryptedMap>({})

  // ── Unlock state ──────────────────────────────────────────────────────────
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')           // second PIN for setup confirmation
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const pinInputRef = useRef<HTMLInputElement>(null)

  // ── Add entry state ───────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<'password' | 'note' | 'card' | 'secret'>('password')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editValue, setEditValue] = useState('')

  // ── Load settings ─────────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch('/api/vault/settings', { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        // 500 with this message specifically means the DB tables don't exist
        const msg = body.error || `Vault unavailable (status ${res.status})`
        setLoadError(msg)
        toast.error('Vault not ready')
        return
      }
      const json = await res.json() as VaultSettings
      setSettings(json)
    } catch {
      setLoadError('Could not reach vault service')
      toast.error('Could not load vault')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadSettings() }, [loadSettings])

  // Re-focus PIN input on mount
  useEffect(() => {
    if (!vaultKey && pinInputRef.current && settings) {
      pinInputRef.current.focus()
    }
  }, [vaultKey, settings])

  // ── Load entries (after unlock) ───────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/entries', { cache: 'no-store' })
      if (!res.ok) throw new Error('load failed')
      const { entries } = await res.json() as { entries: VaultEntry[] }
      setEntries(entries ?? [])
    } catch {
      toast.error('Could not load entries')
    }
  }, [])

  // ── Lock vault ───────────────────────────────────────────────────────────
  const lockVault = useCallback(() => {
    setVaultKey(null)
    setDecrypted({})
    setEntries([])
    setPin('')
    setPin2('')
  }, [])

  // ── Auto-lock after 5 min of inactivity ──────────────────────────────────
  const activityRef = useRef<number>(Date.now())
  useEffect(() => {
    if (!vaultKey) return
    const markActivity = () => { activityRef.current = Date.now() }
    window.addEventListener('mousemove', markActivity)
    window.addEventListener('keydown', markActivity)
    window.addEventListener('click', markActivity)
    const timer = setInterval(() => {
      if (Date.now() - activityRef.current > 5 * 60 * 1000) {
        lockVault()
        toast('Vault auto-locked after 5 min idle', { icon: '🔒' })
      }
    }, 30000)
    return () => {
      window.removeEventListener('mousemove', markActivity)
      window.removeEventListener('keydown', markActivity)
      window.removeEventListener('click', markActivity)
      clearInterval(timer)
    }
  }, [vaultKey, lockVault])

  // ── Initialize new vault ──────────────────────────────────────────────────
  const handleSetup = async () => {
    if (pin.length < 4) {
      setUnlockError('PIN must be at least 4 digits')
      return
    }
    if (pin !== pin2) {
      setUnlockError('PINs don\'t match')
      return
    }
    setUnlocking(true)
    setUnlockError(null)
    try {
      const { material, key } = await initVaultMaterial(pin)
      const res = await fetch('/api/vault/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(material),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Setup failed')
      }
      setVaultKey(key)
      setSettings({
        initialized: true,
        salt: material.salt,
        iterations: material.iterations,
        verification_blob: material.verification_blob,
        verification_iv: material.verification_iv,
      })
      setPin('')
      setPin2('')
      await loadEntries()
      toast.success('Vault created')
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setUnlocking(false)
    }
  }

  // ── Unlock existing vault ─────────────────────────────────────────────────
  const handleUnlock = async () => {
    if (!settings || !settings.initialized || !settings.salt) return
    if (settings.locked_seconds_remaining && settings.locked_seconds_remaining > 0) {
      setUnlockError(`Locked. Try again in ${Math.ceil(settings.locked_seconds_remaining / 60)} min.`)
      return
    }
    if (!pin) {
      setUnlockError('Enter your PIN')
      return
    }
    setUnlocking(true)
    setUnlockError(null)
    try {
      const key = await unlockVault(pin, {
        salt: settings.salt!,
        iterations: settings.iterations!,
        verification_blob: settings.verification_blob!,
        verification_iv: settings.verification_iv!,
      })
      // Report attempt to server (for brute-force tracking)
      void fetch('/api/vault/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: !!key }),
      })
      if (key) {
        setVaultKey(key)
        setPin('')
        await loadEntries()
      } else {
        setUnlockError('Wrong PIN')
      }
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Unlock failed')
    } finally {
      setUnlocking(false)
    }
  }

  // ── Reveal a single entry (decrypt) ───────────────────────────────────────
  const toggleReveal = async (entry: VaultEntry) => {
    if (!vaultKey) return
    const cached = decrypted[entry.id]
    if (cached) {
      setDecrypted((m) => ({ ...m, [entry.id]: { value: cached.value, visible: !cached.visible } }))
      return
    }
    try {
      const value = await decryptString(vaultKey, { ciphertext: entry.ciphertext, iv: entry.iv })
      setDecrypted((m) => ({ ...m, [entry.id]: { value, visible: true } }))
    } catch {
      toast.error('Could not decrypt — vault key invalid')
    }
  }

  // ── Copy decrypted value ──────────────────────────────────────────────────
  const copyValue = async (entry: VaultEntry) => {
    if (!vaultKey) return
    try {
      const value = decrypted[entry.id]?.value
        ?? await decryptString(vaultKey, { ciphertext: entry.ciphertext, iv: entry.iv })
      await navigator.clipboard.writeText(value)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy')
    }
  }

  // ── Add new entry ─────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!vaultKey) return
    if (!newName.trim() || !newValue.trim()) {
      toast.error('Name and value required')
      return
    }
    setSaving(true)
    try {
      const blob = await encryptString(vaultKey, newValue)
      const res = await fetch('/api/vault/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          kind: newKind,
          ciphertext: blob.ciphertext,
          iv: blob.iv,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Save failed')
      }
      const { entry } = await res.json() as { entry: VaultEntry }
      setEntries((prev) => [entry, ...prev])
      setNewName('')
      setNewValue('')
      setNewKind('password')
      setAddOpen(false)
      toast.success('Saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  // ── Edit entry ────────────────────────────────────────────────────────────
  const startEdit = async (entry: VaultEntry) => {
    if (!vaultKey) return
    try {
      const value = await decryptString(vaultKey, { ciphertext: entry.ciphertext, iv: entry.iv })
      setEditingId(entry.id)
      setEditName(entry.name)
      setEditValue(value)
    } catch {
      toast.error('Could not load entry for editing')
    }
  }
  const saveEdit = async () => {
    if (!vaultKey || !editingId) return
    if (!editName.trim() || !editValue.trim()) {
      toast.error('Name and value required')
      return
    }
    setSaving(true)
    try {
      const blob = await encryptString(vaultKey, editValue)
      const res = await fetch(`/api/vault/entries/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          ciphertext: blob.ciphertext,
          iv: blob.iv,
        }),
      })
      if (!res.ok) throw new Error('Update failed')
      const { entry } = await res.json() as { entry: VaultEntry }
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)))
      setDecrypted((m) => ({ ...m, [entry.id]: { value: editValue, visible: false } }))
      setEditingId(null)
      setEditName('')
      setEditValue('')
      toast.success('Updated')
    } catch {
      toast.error('Could not update')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (entry: VaultEntry) => {
    if (!confirm(`Delete "${entry.name}"? This cannot be undone.`)) return
    const prev = entries
    setEntries((p) => p.filter((e) => e.id !== entry.id))
    try {
      const res = await fetch(`/api/vault/entries/${entry.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Deleted')
    } catch {
      setEntries(prev)
      toast.error('Could not delete')
    }
  }

  // ── Reset vault (forgot PIN) ──────────────────────────────────────────────
  const handleReset = async () => {
    const ok = confirm(
      'Reset vault?\n\nThis will permanently delete:\n• Your PIN setup\n• ALL stored entries\n\nThis cannot be undone. Continue?'
    )
    if (!ok) return
    try {
      const res = await fetch('/api/vault', { method: 'DELETE' })
      if (!res.ok) throw new Error('Reset failed')
      lockVault()
      setSettings({ initialized: false })
      toast.success('Vault reset')
    } catch {
      toast.error('Could not reset')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const wrapStyle: React.CSSProperties = {
    padding: '16px max(14px, env(safe-area-inset-right)) 20px max(14px, env(safe-area-inset-left))',
    maxWidth: 720, margin: '0 auto', boxSizing: 'border-box',
  }

  if (loading) {
    return (
      <div style={wrapStyle}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={20} className="animate-spin" color="var(--text-3)" />
        </div>
      </div>
    )
  }

  // ── Load error (e.g. DB tables missing, network issue) ────────────────────
  if (loadError && !settings) {
    return (
      <div style={wrapStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ShieldAlert size={20} color="#ef4444" />
          <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Vault unavailable
          </h2>
        </div>
        <div style={{
          padding: 16, marginTop: 14,
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12,
          background: 'rgba(239,68,68,0.05)',
        }}>
          <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.6 }}>
            <strong>{loadError}</strong>
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 12px', lineHeight: 1.6 }}>
            The vault database tables haven&apos;t been created yet. An administrator needs to apply
            migration <code style={{ background: 'var(--morning)', padding: '1px 5px', borderRadius: 4 }}>019_vault.sql</code> to
            the Supabase project.
          </p>
          <button
            type="button"
            onClick={() => { setLoading(true); void loadSettings() }}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 500,
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Setup screen (first time) ─────────────────────────────────────────────
  if (settings && !settings.initialized) {
    return (
      <div style={wrapStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Shield size={20} color="var(--accent)" />
          <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Vault</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 12px', lineHeight: 1.5 }}>
          A PIN-protected, encrypted place for passwords and secrets.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {[
            { icon: <Shield size={12} />, label: 'Your PIN is the only key' },
            { icon: <ShieldAlert size={12} />, label: 'We never see it' },
            { icon: <Lock size={12} />, label: 'Forgot PIN = unrecoverable', warn: true },
          ].map((b) => (
            <span key={b.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500,
              background: b.warn ? 'rgba(239,68,68,0.08)' : 'var(--morning)',
              color: b.warn ? '#ef4444' : 'var(--text-2)',
              border: `1px solid ${b.warn ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
            }}>
              {b.icon} {b.label}
            </span>
          ))}
        </div>

        <div style={{
          padding: 18, border: '1px solid var(--border)', borderRadius: 14,
          background: 'var(--surface)',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>
            Create your vault PIN
          </h3>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 14px' }}>
            6+ digits recommended. Numbers or letters.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              ref={pinInputRef}
              type="password"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setUnlockError(null) }}
              placeholder="Enter PIN"
              maxLength={64}
              inputMode="text"
              style={{
                padding: '10px 12px', fontSize: 14,
                border: '1px solid var(--border)', borderRadius: 9,
                background: 'var(--surface)', color: 'var(--text)',
                outline: 'none',
              }}
            />
            <input
              type="password"
              autoComplete="new-password"
              value={pin2}
              onChange={(e) => { setPin2(e.target.value); setUnlockError(null) }}
              placeholder="Confirm PIN"
              maxLength={64}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSetup() }}
              style={{
                padding: '10px 12px', fontSize: 14,
                border: '1px solid var(--border)', borderRadius: 9,
                background: 'var(--surface)', color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>

          {unlockError && (
            <div style={{
              marginTop: 10, padding: '8px 10px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8, fontSize: 12, color: '#ef4444',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <ShieldAlert size={13} /> {unlockError}
            </div>
          )}

          <button
            type="button"
            onClick={handleSetup}
            disabled={unlocking}
            style={{
              marginTop: 14, width: '100%', padding: '11px',
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 9,
              fontSize: 13, fontWeight: 500,
              cursor: unlocking ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {unlocking && <Loader2 size={13} className="animate-spin" />}
            Create vault
          </button>

          <p style={{ fontSize: 10.5, color: 'var(--text-3)', margin: '12px 0 0' }}>
            <Shield size={10} style={{ verticalAlign: 'middle' }} /> Your PIN never leaves this browser.
          </p>
        </div>
      </div>
    )
  }

  // ── Unlock screen ─────────────────────────────────────────────────────────
  // Only reachable if settings loaded AND vault is initialized AND not unlocked yet.
  if (!vaultKey && settings?.initialized) {
    const isLocked = (settings?.locked_seconds_remaining ?? 0) > 0
    return (
      <div style={wrapStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Lock size={20} color="var(--accent)" />
          <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Vault locked</h2>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '0 0 20px' }}>
          Enter your PIN to access your secrets.
        </p>

        <div style={{
          padding: 18, border: '1px solid var(--border)', borderRadius: 14,
          background: 'var(--surface)',
        }}>
          <input
            ref={pinInputRef}
            type="password"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setUnlockError(null) }}
            placeholder="Enter PIN"
            maxLength={64}
            disabled={isLocked}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock() }}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '12px 14px', fontSize: 16,
              border: '1px solid var(--border)', borderRadius: 9,
              background: 'var(--surface)', color: 'var(--text)',
              outline: 'none',
            }}
          />
          {unlockError && (
            <div style={{
              marginTop: 10, padding: '8px 10px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8, fontSize: 12, color: '#ef4444',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <ShieldAlert size={13} /> {unlockError}
            </div>
          )}
          <button
            type="button"
            onClick={handleUnlock}
            disabled={unlocking || isLocked}
            style={{
              marginTop: 12, width: '100%', padding: '11px',
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 9,
              fontSize: 13, fontWeight: 500,
              cursor: unlocking || isLocked ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {unlocking ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />}
            Unlock
          </button>

          <button
            type="button"
            onClick={handleReset}
            style={{
              marginTop: 12, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--text-3)',
              textDecoration: 'underline',
            }}
          >
            Forgot PIN? Reset vault (wipes all entries)
          </button>
        </div>
      </div>
    )
  }

  // ── Defensive fallback: if we got here without vaultKey, show loading
  //    (covers the case where load just succeeded but key isn't set yet)
  if (!vaultKey) {
    return (
      <div style={wrapStyle}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={20} className="animate-spin" color="var(--text-3)" />
        </div>
      </div>
    )
  }

  // ── Main vault view (unlocked) ────────────────────────────────────────────
  return (
    <div style={wrapStyle}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 4, gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Unlock size={18} color="var(--accent)" />
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Vault</h2>
        </div>
        <button
          type="button"
          onClick={lockVault}
          title="Lock vault now"
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
            fontSize: 11, color: 'var(--text-2)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <Lock size={11} /> Lock
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
        Encrypted on this device. Auto-locks after 5 min idle.
      </p>

      {/* Add entry */}
      {addOpen ? (
        <div style={{
          padding: 14, marginBottom: 14,
          border: '1px solid var(--border)', borderRadius: 12,
          background: 'var(--surface)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (e.g. Gmail password)"
              maxLength={200}
              style={{
                padding: '8px 10px', fontSize: 13,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--surface)', color: 'var(--text)', outline: 'none',
              }}
            />
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as typeof newKind)}
              style={{
                padding: '8px 10px', fontSize: 13,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--surface)', color: 'var(--text)', outline: 'none',
              }}
            >
              <option value="password">Password</option>
              <option value="note">Secure note</option>
              <option value="card">Card</option>
              <option value="secret">Other secret</option>
            </select>
            <textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value to encrypt"
              rows={3}
              maxLength={20000}
              style={{
                padding: '8px 10px', fontSize: 13,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--surface)', color: 'var(--text)',
                outline: 'none', resize: 'vertical',
                fontFamily: 'monospace',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => { setAddOpen(false); setNewName(''); setNewValue('') }}
              style={{
                padding: '6px 12px', fontSize: 12,
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 7, color: 'var(--text-2)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !newName.trim() || !newValue.trim()}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 500,
                background: newName.trim() && newValue.trim() ? 'var(--accent)' : 'var(--border)',
                color: newName.trim() && newValue.trim() ? '#fff' : 'var(--text-3)',
                border: 'none', borderRadius: 7,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <KeyRound size={11} />}
              Save encrypted
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          style={{
            width: '100%', padding: 12, marginBottom: 14,
            background: 'transparent',
            border: '1px dashed var(--border)', borderRadius: 12,
            color: 'var(--accent)', fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontFamily: 'inherit',
          }}
        >
          <Plus size={14} /> Add new secret
        </button>
      )}

      {/* Entries list */}
      {entries.length === 0 ? (
        <div style={{
          padding: '32px 16px', textAlign: 'center',
          color: 'var(--text-3)', fontSize: 13,
        }}>
          Nothing in your vault yet. Click <strong>Add new secret</strong> above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((entry) => {
            const isEditing = editingId === entry.id
            const dec = decrypted[entry.id]
            return (
              <div
                key={entry.id}
                style={{
                  padding: 12,
                  border: '1px solid var(--border)', borderRadius: 12,
                  background: 'var(--surface)',
                }}
              >
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '7px 9px', fontSize: 13,
                        border: '1px solid var(--border)', borderRadius: 7,
                        background: 'var(--surface)', color: 'var(--text)',
                        outline: 'none', marginBottom: 8,
                      }}
                    />
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '7px 9px', fontSize: 13,
                        border: '1px solid var(--border)', borderRadius: 7,
                        background: 'var(--surface)', color: 'var(--text)',
                        outline: 'none', resize: 'vertical',
                        fontFamily: 'monospace',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditName(''); setEditValue('') }}
                        style={{
                          padding: '5px 10px', fontSize: 11,
                          background: 'transparent', border: '1px solid var(--border)',
                          borderRadius: 6, color: 'var(--text-2)', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={saving}
                        style={{
                          padding: '5px 12px', fontSize: 11, fontWeight: 500,
                          background: 'var(--accent)', color: '#fff',
                          border: 'none', borderRadius: 6,
                          cursor: saving ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                        Save
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                            {entry.name}
                          </span>
                          <span style={{
                            padding: '1px 6px', fontSize: 9, fontWeight: 600,
                            background: 'var(--morning)', color: 'var(--text-2)',
                            borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}>
                            {KIND_LABEL[entry.kind] ?? entry.kind}
                          </span>
                        </div>
                        {dec?.visible ? (
                          <div style={{
                            fontSize: 12.5, color: 'var(--text)',
                            fontFamily: 'monospace',
                            padding: '6px 8px', marginTop: 4,
                            background: 'var(--morning)', borderRadius: 6,
                            wordBreak: 'break-all', whiteSpace: 'pre-wrap',
                          }}>
                            {dec.value}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                            ••••••••••
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                          {formatDate(entry.created_at)}
                          {entry.updated_at !== entry.created_at && ' · edited'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => toggleReveal(entry)}
                          title={dec?.visible ? 'Hide' : 'Reveal'}
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            padding: 4, color: 'var(--text-3)',
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          {dec?.visible ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyValue(entry)}
                          title="Copy"
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            padding: 4, color: 'var(--text-3)',
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          title="Edit"
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            padding: 4, color: 'var(--text-3)',
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry)}
                          title="Delete"
                          style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            padding: 4, color: 'var(--text-3)',
                            display: 'flex', alignItems: 'center',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
