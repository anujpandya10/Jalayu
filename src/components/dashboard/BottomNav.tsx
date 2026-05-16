'use client'

import type { ComponentType } from 'react'
import { Home, CheckSquare, BookOpen } from 'lucide-react'
import { useStore } from '@/store/useStore'
import type { SidebarView } from '@/lib/types'

const TABS: { key: string; icon: ComponentType<{ size?: number }>; label: string; view: SidebarView }[] = [
  { key: 'home', icon: Home, label: 'Home', view: 'dashboard' },
  { key: 'today', icon: CheckSquare, label: 'Calendar', view: 'calendar' },
  { key: 'memory', icon: BookOpen, label: 'Memory', view: 'memory' },
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
        background: 'rgba(245,243,238,0.96)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--border)',
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
            className="touch-target"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '8px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--text-3)',
              cursor: 'pointer',
              filter: 'none',
              transition: 'color 0.2s, filter 0.2s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
