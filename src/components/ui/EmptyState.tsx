import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  /** One short line max — this replaces a paragraph, it isn't a smaller paragraph. */
  hint?: string
  action?: ReactNode
  accent?: string
  className?: string
  style?: React.CSSProperties
}

/** The visual "nothing here yet" card — icon + a short headline + an optional one-line
 * hint and action, instead of two sentences of prose explaining the empty screen. */
export function EmptyState({ icon, title, hint, action, accent = 'var(--accent)', className, style }: EmptyStateProps) {
  return (
    <div
      className={cn(className)}
      style={{
        textAlign: 'center', padding: '32px 20px',
        background: 'var(--surface-2)', border: '1px dashed var(--border-2)', borderRadius: 14,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        ...style,
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${accent}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</p>
        {hint && <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 0' }}>{hint}</p>}
      </div>
      {action}
    </div>
  )
}
