'use client'

import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { Sparkles, MessageSquare, Zap, Mic } from 'lucide-react'
import CommandPalette from '@/components/chat/CommandPalette'

/**
 * Floating action area. Pair of buttons + ⌘K command palette.
 *
 *   ⚡ Capture (left)  — opens command palette (also via ⌘K anywhere)
 *   ✨ Ask Jalayu (right) — opens chat panel
 *      • Long-press / hold = voice-only quick capture (no UI, just talk)
 *
 * Hidden when chat panel is open. The capture button is always available.
 */
export default function FloatingChatButton() {
  const { showChatPanel, setShowChatPanel, sidebarView, chatContext } = useStore()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteVoice, setPaletteVoice] = useState(false)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const longPressFired = useRef(false)

  // ⌘K / Ctrl+K global hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteVoice(false)
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Long-press detection on chat button = voice quick-capture
  const handleChatPressStart = () => {
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setPaletteVoice(true)
      setPaletteOpen(true)
    }, 500)  // 500ms = "hold"
  }
  const handleChatPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    if (!longPressFired.current) {
      // It was a regular click — open chat
      setShowChatPanel(true)
    }
  }
  const handleChatPressCancel = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressFired.current = false
  }

  // Compose a one-line context badge so user sees what Jalayu can "see"
  const ctxLabel: string | null = (() => {
    if (chatContext.noteName) return `with "${chatContext.noteName}"`
    if (chatContext.folderName) return `in "${chatContext.folderName}"`
    if (chatContext.label) return chatContext.label
    return null
  })()

  const hideButtons = showChatPanel || sidebarView === 'dashboard'

  return (
    <>
      {/* Floating buttons */}
      {!hideButtons && (
        <div
          style={{
            position: 'fixed',
            right: 'max(16px, env(safe-area-inset-right))',
            bottom: 'max(20px, env(safe-area-inset-bottom))',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* Capture button — opens ⌘K palette */}
          <button
            type="button"
            onClick={() => { setPaletteVoice(false); setPaletteOpen(true) }}
            title="Quick capture (⌘K) — type or speak any thought"
            aria-label="Quick capture"
            style={{
              width: 44, height: 44, borderRadius: 999,
              background: 'var(--surface)',
              color: 'var(--accent)',
              border: '1px solid var(--border-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 22px rgba(0,0,0,0.12)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)'
            }}
          >
            <Zap size={17} />
          </button>

          {/* Ask Jalayu — click = chat, hold = voice quick-capture */}
          <button
            type="button"
            onMouseDown={handleChatPressStart}
            onMouseUp={handleChatPressEnd}
            onMouseLeave={handleChatPressCancel}
            onTouchStart={handleChatPressStart}
            onTouchEnd={handleChatPressEnd}
            onTouchCancel={handleChatPressCancel}
            onContextMenu={(e) => e.preventDefault()}
            title={ctxLabel ? `Ask Jalayu ${ctxLabel} · hold for voice` : 'Ask Jalayu · hold for voice'}
            aria-label="Open Jalayu chat"
            style={{
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
        </div>
      )}

      {/* Command Palette (controlled here so ⌘K works globally on every view, even home) */}
      <CommandPalette
        open={paletteOpen}
        voiceOnOpen={paletteVoice}
        onClose={() => { setPaletteOpen(false); setPaletteVoice(false) }}
      />
    </>
  )
}
