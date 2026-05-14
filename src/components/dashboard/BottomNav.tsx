'use client'

import type { ComponentType } from 'react'
import { Home, CheckSquare, BookOpen, Sparkles } from 'lucide-react'
import { useStore } from '@/store/useStore'
import type { SidebarView } from '@/lib/types'

const TABS: { key: string; icon: ComponentType<{ size?: number }>; label: string; view: SidebarView }[] = [
  { key: 'home', icon: Home, label: 'Home', view: 'dashboard' },
  { key: 'tasks', icon: CheckSquare, label: 'Tasks', view: 'calendar' },
  { key: 'memory', icon: BookOpen, label: 'Memory', view: 'memory' },
  { key: 'reflect', icon: Sparkles, label: 'Reflect', view: 'reflect' },
]

export default function BottomNav() {
  const { sidebarView, setSidebarView } = useStore()

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
      {TABS.map(({ key, icon: Icon, label, view }) => {
        const isActive = sidebarView === view
        return (
          <button
            key={key}
            type="button"
            onClick={() => setSidebarView(view)}
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
