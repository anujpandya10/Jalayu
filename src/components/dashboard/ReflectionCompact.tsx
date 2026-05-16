'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import type { Reflection } from '@/lib/types'

const AMBER = '#00C9A7'

function hasContent(r: Reflection): boolean {
  return Boolean(r.one_word?.trim() || r.win_of_day?.trim() || r.tomorrow_note?.trim())
}

export default function ReflectionCompact({
  reflection,
  onOpenReflect,
}: {
  reflection: Reflection | null
  onOpenReflect: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  if (!reflection || !hasContent(reflection)) {
    return (
      <button
        type="button"
        onClick={onOpenReflect}
        className="hwidget"
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          background: `linear-gradient(135deg, ${AMBER}10 0%, var(--surface) 70%)`,
          border: `1px dashed ${AMBER}40`, borderRadius: 18,
          padding: '14px 16px', fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 32, height: 32, borderRadius: '50%', background: `${AMBER}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Sparkles size={15} color={AMBER} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: '0 0 2px' }}>
              Close out your day
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.45 }}>
              One word, one win, one note for tomorrow — takes 2 minutes
            </p>
          </div>
          <span style={{ fontSize: 11, color: AMBER, fontWeight: 600, flexShrink: 0 }}>Memory →</span>
        </div>
      </button>
    )
  }

  const word = reflection.one_word?.trim()
  const win = reflection.win_of_day?.trim()
  const tomorrow = reflection.tomorrow_note?.trim()

  return (
    <div
      style={{
        background: `linear-gradient(145deg, ${AMBER}14 0%, var(--surface) 55%)`,
        border: `1px solid ${AMBER}35`,
        borderRadius: 18,
        padding: '14px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', top: -20, right: -10, fontSize: 72, fontWeight: 800,
        color: AMBER, opacity: 0.06, lineHeight: 1, pointerEvents: 'none',
        fontFamily: 'var(--font-lora), Georgia, serif',
      }}>
        {word?.charAt(0) ?? '✦'}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: collapsed ? 0 : 10 }}>
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
          style={{ fontSize: 11, color: AMBER, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
        >
          Edit →
        </button>
      </div>

      {!collapsed && (
        <>
          {word && (
            <p style={{
              fontFamily: 'var(--font-lora), Georgia, serif',
              fontSize: 28, fontWeight: 700, color: 'var(--text)',
              margin: '0 0 10px', lineHeight: 1.15, letterSpacing: '-0.02em',
            }}>
              {word}
            </p>
          )}

          {win && (
            <div style={{ marginBottom: tomorrow ? 8 : 0 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>
                Win today
              </p>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.45 }}>
                {win}
              </p>
            </div>
          )}

          {tomorrow && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${AMBER}22` }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>
                Tomorrow-you
              </p>
              <p style={{
                fontFamily: 'var(--font-lora), Georgia, serif',
                fontStyle: 'italic', fontSize: 12, color: 'var(--text-2)',
                margin: 0, lineHeight: 1.55,
              }}>
                {tomorrow}
              </p>
            </div>
          )}

          <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '10px 0 0', fontStyle: 'italic' }}>
            You showed up today. That counts.
          </p>
        </>
      )}

      {collapsed && word && (
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{word}</p>
      )}
    </div>
  )
}
