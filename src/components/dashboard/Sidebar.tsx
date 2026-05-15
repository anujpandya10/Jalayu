'use client'

import { Search } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { getDisplayName, getDayNumber } from '@/lib/utils'
import { NAV_SECTIONS } from '@/components/dashboard/navConfig'

export default function Sidebar() {
  const { profile, sidebarView, setSidebarView, setShowChatPanel } = useStore()
  const name = getDisplayName(profile)
  const dayNumber = profile ? getDayNumber(profile.created_at) : 1

  return (
    <div
      style={{
        width: 200,
        minWidth: 200,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flexShrink: 0,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          padding: '14px 12px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>Jalayu</span>
        </div>
        <button
          type="button"
          onClick={() => setShowChatPanel(true)}
          style={{
            width: '100%',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          <Search size={12} color="var(--text-3)" />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Ask anything…</span>
        </button>
      </div>

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
                fontWeight: 600,
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
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
                  type="button"
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
                    background: isActive ? 'var(--morning)' : 'transparent',
                    color: isActive ? 'var(--text)' : 'var(--text-2)',
                    fontWeight: isActive ? 500 : 400,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 0 8px rgba(99,102,241,0.15)' : undefined,
                  }}
                >
                  <Icon size={15} color={isActive ? 'var(--text)' : 'var(--text-3)'} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
                  {badge === 'dot-red' && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                  )}
                  {badge === 'dot-green' && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
                  )}
                  {badge === 'new-pill' && (
                    <span
                      style={{
                        background: 'var(--morning)',
                        color: 'var(--text-2)',
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

      <div
        style={{
          padding: '10px 8px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--morning)',
              color: 'var(--text-2)',
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
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
              Day {dayNumber}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
