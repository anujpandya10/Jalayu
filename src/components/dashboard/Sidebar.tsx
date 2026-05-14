'use client'

import {
  LayoutDashboard,
  Calendar,
  Bell,
  Brain,
  TrendingUp,
  Heart,
  BookOpen,
  History,
  Users,
  Puzzle,
  Search,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { getDisplayName, getDayNumber } from '@/lib/utils'
import type { SidebarView } from '@/lib/types'

interface NavItem {
  key: SidebarView
  icon: React.ComponentType<{ size?: number; color?: string }>
  label: string
  badge?: 'dot-red' | 'dot-green' | 'new-pill'
}

const NAV_SECTIONS: { section: string; items: NavItem[] }[] = [
  {
    section: 'Today',
    items: [
      { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { key: 'calendar', icon: Calendar, label: 'My day' },
      { key: 'reminders', icon: Bell, label: 'Reminders', badge: 'dot-red' },
      { key: 'mind', icon: Brain, label: 'My mind' },
    ],
  },
  {
    section: 'Grow',
    items: [
      { key: 'progress', icon: TrendingUp, label: 'Progress', badge: 'dot-green' },
      { key: 'wellness', icon: Heart, label: 'Wellness' },
      { key: 'learning', icon: BookOpen, label: 'Learning' },
    ],
  },
  {
    section: 'Life',
    items: [
      { key: 'memory', icon: History, label: 'Memory' },
      { key: 'people', icon: Users, label: 'People' },
      { key: 'widgets', icon: Puzzle, label: 'Widgets', badge: 'new-pill' },
    ],
  },
]

export default function Sidebar() {
  const { profile, sidebarView, setSidebarView, setShowChatPanel } = useStore()
  const name = getDisplayName(profile)
  const dayNumber = profile ? getDayNumber(profile.created_at) : 1

  return (
    <div
      style={{
        width: 200,
        minWidth: 200,
        background: '#F8F7FF',
        borderRight: '0.5px solid #E5E3FF',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flexShrink: 0,
      }}
    >
      {/* Top: logo + search */}
      <div
        style={{
          padding: '14px 12px',
          borderBottom: '0.5px solid #E5E3FF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#111827' }}>Jala</span>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#534AB7' }}>yu</span>
        </div>
        <button
          onClick={() => setShowChatPanel(true)}
          style={{
            width: '100%',
            background: '#fff',
            border: '0.5px solid #E5E3FF',
            borderRadius: 8,
            padding: '6px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          <Search size={12} color="#9CA3AF" />
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Ask anything…</span>
        </button>
      </div>

      {/* Nav */}
      <div
        style={{
          flex: 1,
          padding: '8px 6px',
          overflowY: 'auto',
        }}
      >
        {NAV_SECTIONS.map(({ section, items }) => (
          <div key={section}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: '#9CA3AF',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '8px 6px 3px',
              }}
            >
              {section}
            </div>
            {items.map(({ key, icon: Icon, label, badge }) => {
              const isActive = sidebarView === key
              return (
                <button
                  key={key}
                  onClick={() => setSidebarView(key)}
                  className="sidebar-nav-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '6px 8px',
                    borderRadius: 8,
                    fontSize: 12,
                    width: '100%',
                    background: isActive ? '#fff' : 'transparent',
                    color: isActive ? '#111827' : '#6b7280',
                    fontWeight: isActive ? 500 : 400,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={15} color={isActive ? '#111827' : '#6b7280'} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
                  {badge === 'dot-red' && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#EF4444',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {badge === 'dot-green' && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#22C55E',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {badge === 'new-pill' && (
                    <span
                      style={{
                        background: '#EEEDFE',
                        color: '#534AB7',
                        fontSize: 9,
                        padding: '1px 6px',
                        borderRadius: 99,
                        fontWeight: 500,
                        flexShrink: 0,
                      }}
                    >
                      New
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Bottom: user info */}
      <div
        style={{
          padding: '10px 8px',
          borderTop: '0.5px solid #E5E3FF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#EEEDFE',
              color: '#534AB7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: '#111827',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
            <div style={{ fontSize: 10, color: '#9CA3AF' }}>
              Day {dayNumber} of your journey
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
