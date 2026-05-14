'use client'

import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Puzzle, Heart, Target, Sparkles, Brain } from 'lucide-react'
import { useStore } from '@/store/useStore'
import type { SidebarView } from '@/lib/types'

const TILES: { id: string; title: string; description: string; icon: ComponentType<{ size?: number; color?: string }>; view: SidebarView }[] = [
  {
    id: 'mood',
    title: 'Mood & streak',
    description: 'Log how you feel and keep your streak visible on Dashboard.',
    icon: Heart,
    view: 'wellness',
  },
  {
    id: 'goal',
    title: "Today's north star",
    description: 'See your goal and tasks together on My day.',
    icon: Target,
    view: 'calendar',
  },
  {
    id: 'reflect',
    title: 'End of day',
    description: 'Close the loop with a two-minute reflection.',
    icon: Sparkles,
    view: 'reflect',
  },
  {
    id: 'mind',
    title: 'Brain dump',
    description: 'Clear mental clutter in My mind.',
    icon: Brain,
    view: 'mind',
  },
]

type Registry = { widgets: { id: string; title: string; src: string; height: number }[] }

export default function WidgetsView() {
  const { setSidebarView } = useStore()
  const [registry, setRegistry] = useState<Registry['widgets']>([])

  useEffect(() => {
    fetch('/widgets/registry.json')
      .then((r) => r.json())
      .then((d: Registry) => setRegistry(d.widgets || []))
      .catch(() => setRegistry([]))
  }, [])

  return (
    <div style={{ padding: '16px 14px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Puzzle size={20} color="#534AB7" />
        Widgets
      </h2>
      <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 16px' }}>
        Built-in shortcuts and sandboxed embeds from this origin only — third-party manifests will follow the same contract.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        {TILES.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSidebarView(t.view)}
              style={{
                textAlign: 'left',
                padding: 14,
                borderRadius: 12,
                border: '0.5px solid #E5E3FF',
                background: '#fff',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxShadow: '0 1px 2px rgba(83, 74, 183, 0.06)',
              }}
            >
              <Icon size={18} color="#534AB7" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{t.title}</span>
              <span style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>{t.description}</span>
            </button>
          )
        })}
      </div>

      {registry.length > 0 && (
        <>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 10 }}>Sandboxed embeds</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {registry.map((w) => (
              <div key={w.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#111827', padding: '10px 12px', margin: 0, borderBottom: '0.5px solid #E5E3FF' }}>
                  {w.title}
                </p>
                <iframe
                  title={w.title}
                  src={w.src}
                  sandbox="allow-scripts allow-same-origin"
                  style={{ width: '100%', border: 'none', height: w.height || 200, display: 'block' }}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
