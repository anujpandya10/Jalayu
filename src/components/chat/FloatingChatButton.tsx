'use client'

import { useStore } from '@/store/useStore'
import { Sparkles, MessageSquare } from 'lucide-react'

/**
 * Floating "Ask Jalayu" button. Fixed bottom-right on every view.
 *
 * Hidden when:
 *  • Chat panel is already open (don't overlap)
 *  • User is on Home — chat input is already inline there
 */
export default function FloatingChatButton() {
  const { showChatPanel, setShowChatPanel, sidebarView, chatContext } = useStore()

  if (showChatPanel) return null
  if (sidebarView === 'dashboard') return null  // Home has the chat input built in

  // Compose a one-line context badge so user sees what Jalayu can "see"
  const ctxLabel: string | null = (() => {
    if (chatContext.noteName) return `with "${chatContext.noteName}"`
    if (chatContext.folderName) return `in "${chatContext.folderName}"`
    if (chatContext.label) return chatContext.label
    return null
  })()

  return (
    <button
      type="button"
      onClick={() => setShowChatPanel(true)}
      title={ctxLabel ? `Ask Jalayu ${ctxLabel}` : 'Ask Jalayu'}
      aria-label="Open Jalayu chat"
      className="floating-chat-btn"
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
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 10px 28px rgba(10,123,106,0.45), 0 3px 10px rgba(0,0,0,0.1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(10,123,106,0.35), 0 2px 8px rgba(0,0,0,0.08)'
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
