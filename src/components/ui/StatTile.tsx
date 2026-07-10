import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface StatTileProps {
  icon?: ReactNode
  value: ReactNode
  label: string
  accent?: string
  sub?: string
  className?: string
  style?: React.CSSProperties
}

/** A number/label tile — the visual replacement for "let me explain what this feature
 * does" paragraphs. Show the number the paragraph was building up to instead. */
export function StatTile({ icon, value, label, accent = 'var(--accent)', sub, className, style }: StatTileProps) {
  return (
    <div
      className={cn('card', className)}
      style={{ padding: '12px 14px', ...style }}
    >
      {icon && (
        <div style={{ width: 26, height: 26, borderRadius: 8, background: `${accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, color: accent }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

/** A row of StatTiles with even spacing — the standard "summary at a glance" strip
 * that replaces an opening paragraph at the top of a view. */
export function StatRow({ children, minWidth = 110 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: 10 }}>
      {children}
    </div>
  )
}
