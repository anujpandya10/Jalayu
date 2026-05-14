import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type BadgeVariant = 'green' | 'amber' | 'red' | 'purple' | 'blue' | 'teal' | 'pink'

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  green: { background: '#EAF3DE', color: '#27500A', border: '0.5px solid #97C459' },
  amber: { background: '#FAEEDA', color: '#633806', border: '0.5px solid #FAC775' },
  red: { background: '#FCEBEB', color: '#791F1F', border: '0.5px solid #F09595' },
  purple: { background: '#EEEDFE', color: '#534AB7', border: '0.5px solid #AFA9EC' },
  blue: { background: '#E6F1FB', color: '#0C447C', border: '0.5px solid #93C5E8' },
  teal: { background: '#E1F5EE', color: '#0F6E56', border: '0.5px solid #7DD4B8' },
  pink: { background: '#FBEAF0', color: '#993556', border: '0.5px solid #E8A0B4' },
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
