'use client'

import { useState, useRef, useEffect } from 'react'
import { Menu, X, LogOut, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase'
import { useStore } from '@/store/useStore'
import { visibleNavSections } from '@/components/dashboard/navConfig'
import { isOwnerEmail } from '@/lib/owner'
import JalayuLogo from '@/components/JalayuLogo'

export default function TopBar() {
  const {
    sidebarView, setSidebarView,
    enabledModules, setEnabledModules, grantedPremiumModules, setGrantedPremiumModules,
  } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const navSections = visibleNavSections(
    enabledModules ? new Set(enabledModules) : null,
    grantedPremiumModules ? new Set(grantedPremiumModules) : null,
  )

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data }) => setIsOwner(isOwnerEmail(data.user?.email)))
  }, [])

  // This is the app's actual nav (no persistent desktop sidebar is mounted) — load the
  // user's module personalization + premium grants once, same "show everything until
  // loaded" fallback as everywhere else this is read.
  useEffect(() => {
    if (enabledModules !== null) return
    let cancelled = false
    fetch('/api/modules')
      .then((r) => r.json())
      .then((d: { enabled?: string[]; grantedPremium?: string[] }) => {
        if (cancelled) return
        setEnabledModules(d.enabled ?? [])
        setGrantedPremiumModules(d.grantedPremium ?? [])
      })
      .catch(() => { if (!cancelled) { setEnabledModules([]); setGrantedPremiumModules([]) } })
    return () => { cancelled = true }
  }, [enabledModules, setEnabledModules, setGrantedPremiumModules])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setMenuOpen(false)
    router.push('/')
    router.refresh()
  }

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
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        height: 56,
        minHeight: 'calc(56px + env(safe-area-inset-top, 0px))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        flexShrink: 0,
      }}
    >
      {/* Left spacer — balances the hamburger so the logo stays truly centered */}
      <div style={{ width: 32, flexShrink: 0 }} />

      {/* Brand logo — absolutely centered, tappable to go home */}
      <button
        type="button"
        onClick={() => setSidebarView('dashboard')}
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
        }}
        aria-label="Go to home"
      >
        <JalayuLogo size={36} />
      </button>

      {/* Right: hamburger menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                background: 'rgba(255,255,255,0.98)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(28,25,23,0.12)',
                padding: '6px',
                zIndex: 50,
              }}
            >
              {navSections.map(({ section, items }) => (
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
                  {items.filter((it) => !it.ownerOnly || isOwner).map(({ key, icon: Icon, label, badge }) => {
                    const isActive = sidebarView === key
                    const isLocked = badge === 'premium-lock'
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          if (isLocked) {
                            toast(`${label} is a premium module — ask for access in the Feedback tab.`, { icon: '🔒' })
                            return
                          }
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
                        {badge === 'premium-lock' && (
                          <span
                            title="Premium — request access"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              background: 'var(--morning)',
                              color: 'var(--text-3)',
                              fontSize: 9,
                              padding: '1px 6px',
                              borderRadius: 99,
                              fontWeight: 500,
                            }}
                          >
                            <Lock size={9} /> Premium
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}

              {/* Sign out */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    borderRadius: 8,
                    fontSize: 13,
                    width: '100%',
                    background: 'transparent',
                    color: '#EF4444',
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <LogOut size={15} color="#EF4444" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
