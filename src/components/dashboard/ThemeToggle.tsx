'use client'

import { useEffect } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { getStoredTheme, applyTheme } from '@/lib/theme'

/** Small icon toggle — reads the persisted theme on mount (the inline anti-flash script in
 * layout.tsx already applied it to the DOM; this just syncs the store for the icon state). */
export default function ThemeToggle({ size = 15 }: { size?: number }) {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

  useEffect(() => {
    setTheme(getStoredTheme())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 8,
        border: '1px solid var(--border)', background: 'var(--surface)',
        color: 'var(--text-2)', cursor: 'pointer', flexShrink: 0,
      }}
    >
      {theme === 'dark' ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  )
}
