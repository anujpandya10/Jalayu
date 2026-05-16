'use client'

import { GripVertical, X } from 'lucide-react'
import type { HomeWidgetId } from '@/lib/dashboard-layout'
import { WIDGET_LABELS } from '@/lib/dashboard-layout'

export default function HomeWidgetShell({
  id,
  editMode,
  onHide,
  children,
  className = '',
  dragHandleRef,
  dragListeners,
  dragAttributes,
}: {
  id: HomeWidgetId
  editMode: boolean
  onHide?: () => void
  children: React.ReactNode
  className?: string
  dragHandleRef?: (el: HTMLElement | null) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragListeners?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragAttributes?: any
}) {
  if (!editMode) {
    return <div className={className}>{children}</div>
  }

  return (
    <div
      className={`home-widget-shell ${className}`.trim()}
      style={{
        position: 'relative',
        borderRadius: 18,
        outline: '2px dashed var(--accent)',
        outlineOffset: 2,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 10px',
          background: 'var(--morning)',
          borderBottom: '1px solid var(--border)',
          borderRadius: '16px 16px 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <button
            type="button"
            ref={dragHandleRef}
            {...dragAttributes}
            {...dragListeners}
            className="widget-drag-handle"
            aria-label={`Drag ${WIDGET_LABELS[id]}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'grab',
              color: 'var(--text-3)',
              touchAction: 'none',
            }}
          >
            <GripVertical size={14} />
          </button>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {WIDGET_LABELS[id]}
          </span>
        </div>
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            aria-label={`Hide ${WIDGET_LABELS[id]}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-3)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div style={{ pointerEvents: editMode ? 'none' : 'auto' }}>{children}</div>
    </div>
  )
}
