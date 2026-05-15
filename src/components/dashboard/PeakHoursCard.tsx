import { Clock, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { CardHeader } from '@/components/ui/Card'

interface PeakHoursCardProps {
  peakHours: string | null | undefined
  wakeTime: string | null | undefined
}

function getPeakDisplay(peakHours: string | null | undefined): string {
  if (!peakHours) return 'Not set'
  const map: Record<string, string> = {
    'early morning': '5–8am',
    'late morning': '9–11am',
    afternoon: '1–4pm',
    evening: '6–9pm',
    'late night': '10pm–1am',
  }
  return map[peakHours.toLowerCase()] || peakHours
}

function getInsight(peakHours: string | null | undefined): string {
  if (!peakHours) return 'Log your peak hours in settings to get personalized insights.'
  const lower = peakHours.toLowerCase()
  if (lower.includes('morning'))
    return 'Schedule your hardest thinking tasks before noon. Protect this time ruthlessly.'
  if (lower.includes('afternoon'))
    return 'Your best work happens mid-day. Block your calendar for deep work after lunch.'
  if (lower.includes('evening'))
    return 'You come alive in the evening. Save complex tasks for after 6pm.'
  return 'Use your peak hours for your most demanding work — everything else can wait.'
}

export default function PeakHoursCard({ peakHours, wakeTime }: PeakHoursCardProps) {
  const isCurrentlyPeak = (() => {
    const h = new Date().getHours()
    const lower = (peakHours || '').toLowerCase()
    if (lower.includes('morning') && h >= 6 && h < 12) return true
    if (lower.includes('afternoon') && h >= 12 && h < 17) return true
    if (lower.includes('evening') && h >= 17 && h < 21) return true
    if (lower.includes('night') && (h >= 21 || h < 2)) return true
    return false
  })()

  return (
    <div className="card" style={{ minHeight: 110 }}>
      <CardHeader
        icon={<Clock size={13} />}
        label="Your peak window"
        right={
          <Badge variant={isCurrentlyPeak ? 'green' : 'purple'}>
            {isCurrentlyPeak ? '⚡ Active now' : 'Detected'}
          </Badge>
        }
      />

      <p
        style={{
          fontSize: 22,
          fontWeight: 500,
          color: 'var(--text)',
          margin: '0 0 4px',
          lineHeight: 1.2,
        }}
      >
        {getPeakDisplay(peakHours)}
      </p>
      <p style={{ fontSize: 10, color: 'var(--text-2)', margin: '0 0 10px' }}>
        When you said you feel sharpest
      </p>

      <div
        style={{
          background: 'var(--morning)',
          borderRadius: 8,
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
        }}
      >
        <Sparkles size={12} color="var(--accent)" style={{ marginTop: 1, flexShrink: 0 }} />
        <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
          {getInsight(peakHours)}
        </p>
      </div>
    </div>
  )
}
