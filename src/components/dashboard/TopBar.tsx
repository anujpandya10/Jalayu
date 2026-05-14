'use client'

import { useState, useRef, useEffect } from 'react'
import { Bell, Settings, Menu, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { getGreeting, getDisplayName, formatDate, getDayNumber } from '@/lib/utils'
import { NAV_SECTIONS } from '@/components/dashboard/navConfig'

export default function TopBar() {
  const { profile, setShowChatPanel, sidebarView, setSidebarView } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const name = getDisplayName(profile)
  const dayNumber = profile ? getDayNumber(profile.created_at) : 1

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <div
      style={{
        background: '#fff',
        borderBottom: '0.5px solid #E5E3FF',
        padding: '10px 16px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              width: 32,
              height: 32,
              background: '#F8F7FF',
              border: '0.5px solid #E5E3FF',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            aria-expanded={menuOpen}
            aria-label="Open navigation"
          >
            {menuOpen ? <X size={16} color="#534AB7" /> : <Menu size={16} color="#534AB7" />}
          </button>
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                left: 0,
                width: 'min(92vw, 260px)',
                maxHeight: 'min(70vh, 420px)',
                overflowY: 'auto',
                background: '#fff',
                border: '0.5px solid #E5E3FF',
                borderRadius: 12,
                boxShadow: '0 8px 24px rgba(83, 74, 183, 0.12)',
                padding: '8px 6px',
                zIndex: 50,
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
                      padding: '8px 8px 4px',
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
                        onClick={() => {
                          setSidebarView(key)
                          setMenuOpen(false)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 8,
                          fontSize: 13,
                          width: '100%',
                          background: isActive ? '#EEEDFE' : 'transparent',
                          color: isActive ? '#26215C' : '#374151',
                          fontWeight: isActive ? 500 : 400,
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <Icon size={16} color={isActive ? '#534AB7' : '#6b7280'} />
                        <span style={{ flex: 1 }}>{label}</span>
                        {badge === 'dot-red' && (
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
                        )}
                        {badge === 'dot-green' && (
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
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
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: '#26215C',
              lineHeight: 1.3,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {getGreeting()}, {name}
          </p>
          <p
            style={{
              fontSize: 11,
              color: '#9CA3AF',
              margin: 0,
            }}
          >
            {formatDate()} · Day {dayNumber}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => setShowChatPanel(true)}
          style={{
            width: 28,
            height: 28,
            background: '#F8F7FF',
            border: '0.5px solid #E5E3FF',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="Notifications"
        >
          <Bell size={13} color="#6b7280" />
        </button>
        <button
          type="button"
          style={{
            width: 28,
            height: 28,
            background: '#F8F7FF',
            border: '0.5px solid #E5E3FF',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="Settings"
        >
          <Settings size={13} color="#6b7280" />
        </button>
      </div>
    </div>
  )
}
