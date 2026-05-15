import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type BadgeVariant = 'green' | 'amber' | 'red' | 'purple' | 'blue' | 'teal' | 'pink'

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  green: { background: 'var(--success-bg)', color: 'var(--success-text)', border: '0.5px solid #97C459' },
  amber: { background: 'var(--warning-bg)', color: 'var(--warning-text)', border: '0.5px solid #FAC775' },
  red: { background: 'var(--error-bg)', color: 'var(--error-text)', border: '0.5px solid #F09595' },
  purple: { background: 'var(--morning)', color: 'var(--accent)', border: '0.5px solid var(--accent)' },
  blue: { background: 'rgba(59,130,246,0.1)', color: '#60A5FA', border: '0.5px solid #93C5E8' },
  teal: { background: 'rgba(20,184,166,0.1)', color: '#2DD4BF', border: '0.5px solid #7DD4B8' },
  pink: { background: 'rgba(236,72,153,0.1)', color: '#F472B6', border: '0.5px solid #E8A0B4' },
}

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

export function Badge({ variant = 'purple', children, className }: BadgeProps) {
  return (
    <span
      className={cn(className)}
      style={{
        ...variantStyles[variant],
        fontSize: 10,
        fontWeight: 500,
        padding: '2px 7px',
        borderRadius: 99,
        display: 'inline-flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}
