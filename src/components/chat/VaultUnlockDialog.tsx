'use client'

import { useState, useEffect, useRef } from 'react'
import { Lock, ShieldAlert, Loader2, Eye, EyeOff, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  unlockVault, encryptString, initVaultMaterial,
} from '@/lib/vault-crypto'

interface VaultPayload {
  name: string
  value: string
  kind?: 'password' | 'note' | 'card' | 'secret'
}

interface VaultSettings {
  initialized: boolean
  salt?: string
  iterations?: number
  verification_blob?: string
  verification_iv?: string
  locked_seconds_remaining?: number
}

interface VaultUnlockDialogProps {
  open: boolean
  payload: VaultPayload | null
  /** Called after the entry is successfully saved to the vault. */
  onSuccess: () => void
  /** Called when user cancels — nothing was saved. */
  onClose: () => void
  /**
   * Optional: a note id that should be deleted on success (used when
   * migrating an existing sensitive note INTO the vault).
   */
  deleteNoteOnSuccess?: string | null
}

export default function VaultUnlockDialog({
  open, payload, onSuccess, onClose, deleteNoteOnSuccess,
}: VaultUnlockDialogProps) {
  const [settings, setSettings] = useState<VaultSettings | null>(null)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showValue, setShowValue] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [editedValue, setEditedValue] = useState('')
  const [loadingSettings, setLoadingSettings] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  // Load vault settings when opened
  useEffect(() => {
    if (!open) return
    setError(null)
    setPin('')
    setPin2('')
    setLoadingSettings(true)
    setEditedName(payload?.name ?? '')
    setEditedValue(payload?.value ?? '')
    fetch('/api/vault/settings', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((s: VaultSettings | null) => {
        setSettings(s ?? { initialized: false })
        setTimeout(() => pinRef.current?.focus(), 60)
      })
      .catch(() => {
        setError('Could not reach vault')
        setSettings({ initialized: false })
      })
      .finally(() => setLoadingSettings(false))
  }, [open, payload])

  if (!open || !payload) return null

  // ── Save: encrypt + insert + (optionally) delete the source note ────────
  const persistEncrypted = async (key: CryptoKey) => {
    const finalName = editedName.trim() || 'Secret'
    const finalValue = editedValue
    if (!finalValue) {
      setError('Nothing to encrypt')
      return
    }
    const blob = await encryptString(key, finalValue)
    const res = await fetch('/api/vault/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: finalName,
        kind: payload.kind ?? 'secret',
        ciphertext: blob.ciphertext,
        iv: blob.iv,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Could not save to vault')
    }
    // If we're migrating an existing note, delete it now that the value is safe
    if (deleteNoteOnSuccess) {
      await fetch(`/api/notes/${deleteNoteOnSuccess}`, { method: 'DELETE' })
    }
  }

  // ── First-time setup ────────────────────────────────────────────────────
  const handleSetup = async () => {
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return }
    if (pin !== pin2)   { setError('PINs don\'t match'); return }
    setBusy(true); setError(null)
    try {
      const { material, key } = await initVaultMaterial(pin)
      const setupRes = await fetch('/api/vault/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(material),
      })
      if (!setupRes.ok) {
        const err = await setupRes.json().catch(() => ({}))
        throw new Error(err.error || 'Vault setup failed')
      }
      await persistEncrypted(key)
      toast.success('Vault created & secret encrypted')
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setBusy(false)
    }
  }

  // ── Unlock + encrypt ────────────────────────────────────────────────────
  const handleUnlock = async () => {
    if (!settings?.initialized || !settings.salt) return
    if (!pin) { setError('Enter your PIN'); return }
    setBusy(true); setError(null)
    try {
      const key = await unlockVault(pin, {
        salt: settings.salt,
        iterations: settings.iterations!,
        verification_blob: settings.verification_blob!,
        verification_iv: settings.verification_iv!,
      })
      // Track attempt for brute-force protection
      void fetch('/api/vault/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: !!key }),
      })
      if (!key) { setError('Wrong PIN'); setBusy(false); return }
      await persistEncrypted(key)
      toast.success('Encrypted & saved to vault')
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const isSetup = settings && !settings.initialized
  const isLocked = (settings?.locked_seconds_remaining ?? 0) > 0

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 11000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 14,
          width: 420, maxWidth: '95vw',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={16} color="var(--accent)" />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {isSetup ? 'Create vault to encrypt' : 'Encrypt to vault'}
            </span>
          </div>
          <button type="button" onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', padding: 4, display: 'flex',
          }}>
            <X size={14} />
          </button>
        </div>

        {loadingSettings ? (
          <div style={{ padding: 30, display: 'flex', justifyContent: 'center' }}>
            <Loader2 size={18} className="animate-spin" color="var(--text-3)" />
          </div>
        ) : (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Editable preview of what's being saved */}
            <div>
              <label style={fieldLabelStyle}>Name (label, not encrypted)</label>
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                maxLength={200}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={{ ...fieldLabelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Secret value (will be encrypted)</span>
                <button
                  type="button"
                  onClick={() => setShowValue((v) => !v)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', padding: 2, display: 'flex',
                  }}
                  title={showValue ? 'Hide' : 'Show'}
                >
                  {showValue ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </label>
              {showValue ? (
                <textarea
                  value={editedValue}
                  onChange={(e) => setEditedValue(e.target.value)}
                  rows={2}
                  style={{ ...fieldStyle, fontFamily: 'ui-monospace, SFMono-Regular, monospace', resize: 'vertical' }}
                />
              ) : (
                <input
                  type="password"
                  value={editedValue}
                  onChange={(e) => setEditedValue(e.target.value)}
                  style={{ ...fieldStyle, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
                />
              )}
            </div>

            {/* PIN entry */}
            {isSetup ? (
              <>
                <div style={{
                  padding: '8px 10px', fontSize: 11, color: 'var(--text-2)',
                  background: 'var(--morning)', borderRadius: 8, lineHeight: 1.5,
                }}>
                  No vault yet. Set a PIN — 6+ digits recommended. <strong>If you forget it, the data is unrecoverable</strong> (that&apos;s how end-to-end encryption works).
                </div>
                <div>
                  <label style={fieldLabelStyle}>Create PIN</label>
                  <input
                    ref={pinRef}
                    type="password"
                    value={pin}
                    onChange={(e) => { setPin(e.target.value); setError(null) }}
                    maxLength={64}
                    autoComplete="new-password"
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={fieldLabelStyle}>Confirm PIN</label>
                  <input
                    type="password"
                    value={pin2}
                    onChange={(e) => { setPin2(e.target.value); setError(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSetup() }}
                    maxLength={64}
                    autoComplete="new-password"
                    style={fieldStyle}
                  />
                </div>
              </>
            ) : (
              <div>
                <label style={fieldLabelStyle}>Vault PIN</label>
                <input
                  ref={pinRef}
                  type="password"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock() }}
                  maxLength={64}
                  disabled={isLocked || busy}
                  autoComplete="current-password"
                  style={fieldStyle}
                />
                {isLocked && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>
                    Vault is locked. Try again in {Math.ceil((settings!.locked_seconds_remaining ?? 0) / 60)} min.
                  </div>
                )}
              </div>
            )}

            {error && (
              <div style={{
                padding: '7px 10px', background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7,
                fontSize: 11.5, color: '#ef4444',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <ShieldAlert size={11} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
              <button type="button" onClick={onClose} style={{
                padding: '7px 14px', fontSize: 12,
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 7, color: 'var(--text-2)', cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={isSetup ? handleSetup : handleUnlock}
                disabled={busy || isLocked}
                style={{
                  padding: '7px 16px', fontSize: 12, fontWeight: 500,
                  background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 7,
                  cursor: busy || isLocked ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {busy && <Loader2 size={11} className="animate-spin" />}
                {isSetup ? 'Create + encrypt' : 'Unlock + encrypt'}
              </button>
            </div>

            <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>
              Your PIN never leaves this browser. Server stores only ciphertext.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 7,
  background: 'var(--surface)', color: 'var(--text)',
  outline: 'none',
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 600,
  color: 'var(--text-3)', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 4,
}
