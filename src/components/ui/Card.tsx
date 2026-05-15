import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function Card({ children, className, style, onClick }: CardProps) {
  return (
    <div
      className={cn('card', className)}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  icon: ReactNode
  label: string
  right?: ReactNode
}

export function CardHeader({ icon, label, right }: CardHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
      }}
    >
      <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
        {icon}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text)',
          flex: 1,
        }}
      >
        {label}
      </span>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{right}</div>}
    </div>
  )
}
