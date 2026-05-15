interface ProgressBarProps {
  value: number // 0-100
  color?: string
  height?: number
  label?: string
  valueLabel?: string
}

export function ProgressBar({
  value,
  color = 'var(--accent)',
  height = 4,
  label,
  valueLabel,
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value))

  return (
    <div>
      {(label || valueLabel) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          {label && (
            <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{label}</span>
          )}
          {valueLabel && (
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text)' }}>
              {valueLabel}
            </span>
          )}
        </div>
      )}
      <div
        style={{
          height,
          background: 'var(--border)',
          borderRadius: 99,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${clampedValue}%`,
            background: color,
            borderRadius: 99,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  )
}
