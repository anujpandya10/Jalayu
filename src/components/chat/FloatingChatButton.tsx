'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { Sparkles, MessageSquare } from 'lucide-react'

/**
 * Floating "Ask Jalayu" button. Fixed bottom-right on every view.
 *
 * Unified surface: the chat panel handles Talk, Capture, Search, and Ask
 * modes via tabs. Both this button and ⌘K open the same panel.
 *
 * Long-press the button (hold 500ms) opens chat with the mic engaged for
 * a quick voice capture.
 *
 * Hidden when chat panel is already open (don't overlap), and on Home
 * since the chat input is inline there.
 */
export default function FloatingChatButton() {
  const { showChatPanel, setShowChatPanel, sidebarView, chatContext } = useStore()
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const longPressFired = useRef(false)

  // ⌘K / Ctrl+K global hotkey — opens the unified chat panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowChatPanel(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setShowChatPanel])

  // Long-press detection — placeholder for voice mode (chat panel handles voice itself)
  const handlePressStart = () => {
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setShowChatPanel(true)
      // The chat panel auto-focuses; voice button is available there
    }, 500)
  }
  const handlePressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    if (!longPressFired.current) {
      setShowChatPanel(true)
    }
  }
  const handlePressCancel = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressFired.current = false
  }

  if (showChatPanel) return null
  if (sidebarView === 'dashboard') return null  // Home has its own chat input

  const ctxLabel: string | null = (() => {
    if (chatContext.noteName) return `with "${chatContext.noteName}"`
    if (chatContext.folderName) return `in "${chatContext.folderName}"`
    if (chatContext.label) return chatContext.label
    return null
  })()

  return (
    <button
      type="button"
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressCancel}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressCancel}
      onContextMenu={(e) => e.preventDefault()}
      title={ctxLabel ? `Ask Jalayu ${ctxLabel} · ⌘K` : 'Ask Jalayu · ⌘K'}
      aria-label="Open Jalayu"
      style={{
        position: 'fixed',
        right: 'max(16px, env(safe-area-inset-right))',
        bottom: 'max(20px, env(safe-area-inset-bottom))',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '11px 16px',
        background: 'var(--accent)',
        color: '#fff',
        border: 'none',
        borderRadius: 999,
        cursor: 'pointer',
        boxShadow: '0 6px 20px rgba(10, 123, 106, 0.35), 0 2px 8px rgba(0,0,0,0.08)',
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'inherit',
        transition: 'transform 0.15s, box-shadow 0.15s',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 10px 28px rgba(10,123,106,0.45), 0 3px 10px rgba(0,0,0,0.1)'
      }}
    >
      <Sparkles size={15} />
      <span>Ask Jalayu</span>
      {ctxLabel && (
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            marginLeft: 4,
            padding: '2px 8px',
            background: 'rgba(255,255,255,0.18)',
            borderRadius: 999,
            fontSize: 10.5,
            fontWeight: 500,
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <MessageSquare size={9} />
          {ctxLabel}
        </span>
      )}
    </button>
  )
}
