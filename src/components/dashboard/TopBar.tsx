'use client'

import { useState, useRef, useEffect } from 'react'
import { Bell, Menu, X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { NAV_SECTIONS } from '@/components/dashboard/navConfig'

export default function TopBar() {
  const { setShowChatPanel, sidebarView, setSidebarView } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        flexShrink: 0,
      }}
    >
      {/* Wordmark */}
      <span
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text)',
          letterSpacing: '-0.01em',
        }}
      >
        Jala<span style={{ color: 'var(--accent)' }}>yu</span>
      </span>

      {/* Right: chat + hamburger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={() => setShowChatPanel(true)}
          style={{
            width: 32,
            height: 32,
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="Open chat"
        >
          <Bell size={16} color="var(--text-3)" />
        </button>

        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              width: 32,
              height: 32,
              background: 'transparent',
              border: 'none',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            aria-expanded={menuOpen}
            aria-label="Open navigation"
          >
            {menuOpen ? <X size={18} color="var(--text-2)" /> : <Menu size={18} color="var(--text-2)" />}
          </button>

          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                right: 0,
                width: 'min(92vw, 240px)',
                maxHeight: 'min(70vh, 400px)',
                overflowY: 'auto',
                background: 'rgba(12,18,32,0.95)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
                padding: '6px',
                zIndex: 50,
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
                      padding: '8px 8px 3px',
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
                          padding: '7px 10px',
                          borderRadius: 8,
                          fontSize: 13,
                          width: '100%',
                          background: isActive ? 'var(--morning)' : 'transparent',
                          color: isActive ? 'var(--text)' : 'var(--text-2)',
                          fontWeight: isActive ? 500 : 400,
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <Icon size={15} color={isActive ? 'var(--text)' : 'var(--text-3)'} />
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
                              background: 'var(--morning)',
                              color: 'var(--text-2)',
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
      </div>
    </div>
  )
}
