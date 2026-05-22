'use client'

import { useState, useEffect, useCallback } from 'react'
import { Lock, Shield, ChevronRight, Plus } from 'lucide-react'
import type { SidebarView } from '@/lib/types'
import type { WidgetSize } from '@/lib/dashboard-layout'

const ACCENT = '#8B5CF6'  // purple — distinct from notes (orange) and others

interface Props {
  size: WidgetSize
  setSidebarView: (v: SidebarView) => void
}

interface VaultMeta {
  initialized: boolean
  entry_count?: number
}

export default function VaultWidget({ size, setSidebarView }: Props) {
  const [meta, setMeta] = useState<VaultMeta | null>(null)

  // Load minimal meta: is vault initialized? how many entries?
  // We DON'T fetch any encrypted content here — that's gated by PIN unlock.
  const load = useCallback(async () => {
    try {
      const [settingsRes, entriesRes] = await Promise.all([
        fetch('/api/vault/settings', { cache: 'no-store' }),
        fetch('/api/vault/entries', { cache: 'no-store' }),
      ])
      const settings = settingsRes.ok ? await settingsRes.json() : { initialized: false }
      // Note: if vault is locked client-side, entries endpoint still returns
      // the ciphertext list (it's RLS-scoped to the user). Counting is fine.
      const entries = entriesRes.ok ? (await entriesRes.json()).entries ?? [] : []
      setMeta({ initialized: settings.initialized, entry_count: entries.length })
    } catch {
      setMeta({ initialized: false })
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const open = () => setSidebarView('vault')

  return (
    <div
      className="hwidget"
      style={{
        display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '14px 16px',
        position: 'relative', overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 90, height: 90,
        background: `radial-gradient(circle at 100% 0%, ${ACCENT}1A 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={open}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          }}
        >
          <div style={{
            width: 24, height: 24, borderRadius: 7, background: `${ACCENT}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield size={12} color={ACCENT} />
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            Vault
          </span>
        </button>
        <ChevronRight size={12} color="var(--text-3)" />
      </div>

      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'flex-start',
      }}>
        {!meta ? (
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Loading…</div>
        ) : !meta.initialized ? (
          <button
            type="button"
            onClick={open}
            style={{
              width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none', padding: 0,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <p style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text)',
              margin: '0 0 4px',
            }}>
              Set up vault
            </p>
            <p style={{
              fontSize: 11, color: 'var(--text-3)',
              margin: 0, lineHeight: 1.5,
            }}>
              PIN-protected, end-to-end encrypted. For passwords and secrets.
            </p>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginTop: 8, fontSize: 11, color: ACCENT, fontWeight: 600,
            }}>
              <Plus size={11} /> Create
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={open}
            style={{
              width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none', padding: 0,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `${ACCENT}14`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Lock size={16} color={ACCENT} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{
                fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 2px',
              }}>
                {meta.entry_count ?? 0} {meta.entry_count === 1 ? 'secret' : 'secrets'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
                {size === 'small' ? 'Locked' : 'Enter PIN to unlock'}
              </p>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
