'use client'

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

export default function WidgetsView() {
  const { setSidebarView } = useStore()

  return (
    <div style={{ padding: '16px 14px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Puzzle size={20} color="#534AB7" />
        Widgets
      </h2>
      <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 16px' }}>
        Built-in shortcuts today — an open widget SDK so the community can add trackers, habits, and tools is on the roadmap.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
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
    </div>
  )
}
