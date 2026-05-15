import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'pill-primary' | 'pill-ghost'

const styles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 500,
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--text-2)',
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 400,
    border: '1px solid var(--border-2)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--accent)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
  },
  'pill-primary': {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 99,
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: 500,
    border: 'none',
  },
  'pill-ghost': {
    background: 'transparent',
    color: 'var(--accent)',
    borderRadius: 99,
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: 500,
    border: '0.5px solid var(--border-2)',
  },
}

interface ButtonProps {
  children: ReactNode
  variant?: Variant
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  className?: string
  type?: 'button' | 'submit' | 'reset'
  style?: React.CSSProperties
}

export function Button({
  children,
  variant = 'primary',
  onClick,
  disabled,
  loading,
  fullWidth,
  className,
  type = 'button',
  style,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(className)}
      style={{
        ...styles[variant],
        ...(fullWidth ? { width: '100%' } : {}),
        ...(disabled || loading ? { opacity: 0.6, cursor: 'not-allowed' } : { cursor: 'pointer' }),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        transition: 'opacity 0.15s, background 0.15s',
        ...style,
      }}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}
