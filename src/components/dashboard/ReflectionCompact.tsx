'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import type { Reflection } from '@/lib/types'
import type { WidgetSize } from '@/lib/dashboard-layout'

const AMBER = '#00C9A7'

function hasContent(r: Reflection): boolean {
  return Boolean(r.one_word?.trim() || r.win_of_day?.trim() || r.tomorrow_note?.trim())
}

export default function ReflectionCompact({
  reflection,
  onOpenReflect,
  variant = 'default',
  size = 'medium',
}: {
  reflection: Reflection | null
  onOpenReflect: () => void
  variant?: 'default' | 'sidebar'
  size?: WidgetSize
}) {
  const [collapsed, setCollapsed] = useState(size === 'small')
  const compact = variant === 'sidebar' || size === 'small'
  const expanded = size === 'large'

  if (!reflection || !hasContent(reflection)) {
    return (
      <button
        type="button"
        onClick={onOpenReflect}
        className="hwidget touch-target"
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          background: `linear-gradient(135deg, ${AMBER}10 0%, var(--surface) 70%)`,
          border: `1px dashed ${AMBER}40`, borderRadius: compact ? 14 : 18,
          padding: compact ? '12px 14px' : '14px 16px', fontFamily: 'inherit',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: compact ? 28 : 32, height: compact ? 28 : 32, borderRadius: '50%', background: `${AMBER}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Sparkles size={compact ? 13 : 15} color={AMBER} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 2px' }}>
              Close out your day
            </p>
            {!compact && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.45 }}>
                One word, one win, one note for tomorrow
              </p>
            )}
          </div>
          <span style={{ fontSize: 11, color: AMBER, fontWeight: 600, flexShrink: 0 }}>→</span>
        </div>
      </button>
    )
  }

  const word = reflection.one_word?.trim()
  const win = reflection.win_of_day?.trim()
  const tomorrow = reflection.tomorrow_note?.trim()

  if (compact && !collapsed) {
    return (
      <div
        style={{
          background: `linear-gradient(145deg, ${AMBER}14 0%, var(--surface) 60%)`,
          border: `1px solid ${AMBER}35`,
          borderRadius: 14,
          padding: '12px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={12} color={AMBER} />
            <p style={{ fontSize: 9, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Today
            </p>
          </div>
          <button type="button" onClick={onOpenReflect} style={{ fontSize: 10, color: AMBER, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
            Edit
          </button>
        </div>
        {word && (
          <p style={{
            fontFamily: 'var(--font-lora), Georgia, serif',
            fontSize: 22, fontWeight: 700, color: 'var(--text)',
            margin: '0 0 8px', lineHeight: 1.1,
          }}>
            {word}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {win && (
            <p style={{ fontSize: 12, color: 'var(--text)', margin: 0, lineHeight: 1.4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Win · </span>
              {win}
            </p>
          )}
          {tomorrow && (
            <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0, lineHeight: 1.45, fontStyle: 'italic' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', fontStyle: 'normal' }}>Tomorrow · </span>
              {tomorrow}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        background: `linear-gradient(145deg, ${AMBER}14 0%, var(--surface) 55%)`,
        border: `1px solid ${AMBER}35`,
        borderRadius: compact ? 14 : 18,
        padding: compact ? '12px 14px' : '14px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {!compact && (
        <div style={{
          position: 'absolute', top: -20, right: -10, fontSize: 72, fontWeight: 800,
          color: AMBER, opacity: 0.06, lineHeight: 1, pointerEvents: 'none',
          fontFamily: 'var(--font-lora), Georgia, serif',
        }}>
          {word?.charAt(0) ?? '✦'}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: collapsed ? 0 : compact ? 6 : 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand reflection' : 'Collapse reflection'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-3)', display: 'flex' }}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <Sparkles size={13} color={AMBER} />
          <p style={{ fontSize: 9, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
            Today&apos;s reflection
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenReflect}
          className="touch-target"
          style={{ fontSize: 11, color: AMBER, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px', fontWeight: 600, WebkitTapHighlightColor: 'transparent' }}
        >
          Edit →
        </button>
      </div>

      {!collapsed && (
        <>
          {word && (
            <p style={{
              fontFamily: 'var(--font-lora), Georgia, serif',
              fontSize: expanded ? 32 : compact ? 22 : 28, fontWeight: 700, color: 'var(--text)',
              margin: '0 0 8px', lineHeight: 1.15, letterSpacing: '-0.02em',
            }}>
              {word}
            </p>
          )}

          {win && (
            <div style={{ marginBottom: tomorrow ? 6 : 0 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>
                Win today
              </p>
              <p style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.45 }}>
                {win}
              </p>
            </div>
          )}

          {tomorrow && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${AMBER}22` }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>
                Tomorrow-you
              </p>
              <p style={{
                fontFamily: 'var(--font-lora), Georgia, serif',
                fontStyle: 'italic', fontSize: compact ? 11 : 12, color: 'var(--text-2)',
                margin: 0, lineHeight: 1.55,
              }}>
                {tomorrow}
              </p>
            </div>
          )}

          {!compact && (
            <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '10px 0 0', fontStyle: 'italic' }}>
              You showed up today. That counts.
            </p>
          )}
        </>
      )}

      {collapsed && word && (
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{word}</p>
      )}
    </div>
  )
}
