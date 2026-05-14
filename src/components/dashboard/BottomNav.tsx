'use client'

import { Home, CheckSquare, BookOpen, Sparkles } from 'lucide-react'
import { useStore } from '@/store/useStore'
import type { BottomTab } from '@/lib/types'

const TABS: { key: BottomTab; icon: React.ComponentType<{ size?: number }>; label: string }[] = [
  { key: 'home', icon: Home, label: 'Home' },
  { key: 'tasks', icon: CheckSquare, label: 'Tasks' },
  { key: 'memory', icon: BookOpen, label: 'Memory' },
  { key: 'reflect', icon: Sparkles, label: 'Reflect' },
]

export default function BottomNav() {
  const { activeBottomTab, setActiveBottomTab } = useStore()

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#fff',
        borderTop: '0.5px solid #E5E3FF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingTop: 8,
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        zIndex: 40,
      }}
    >
      {TABS.map(({ key, icon: Icon, label }) => {
        const isActive = activeBottomTab === key
        return (
          <button
            key={key}
            onClick={() => setActiveBottomTab(key)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '4px 12px',
              borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: isActive ? '#534AB7' : '#9CA3AF',
              cursor: 'pointer',
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 500 : 400 }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
