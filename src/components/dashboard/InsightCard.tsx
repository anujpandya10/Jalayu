import { Lightbulb, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { CardHeader } from '@/components/ui/Card'
import type { Profile } from '@/lib/types'

interface InsightCardProps {
  profile: Profile | null
  daysSinceSignup: number
}

function getFirstInsight(profile: Profile | null): string {
  if (!profile) return 'Complete your profile to get personalized insights.'

  const peak = (profile.peak_hours || '').toLowerCase()
  const structure = (profile.day_structure || '').toLowerCase()
  const struggles = profile.struggles || []

  if (struggles.includes('energy') && peak.includes('morning')) {
    return `You lose energy before the day ends, but your brain is sharpest in the ${peak}. Front-load your hardest tasks — don't save them for later.`
  }
  if (struggles.includes('forget') && structure.includes('chaotic')) {
    return `Chaotic days + forgetting things = a dangerous combo. Even just writing down 3 things at the start of each day could change everything.`
  }
  if (struggles.includes('time') && peak) {
    return `You feel like there's never enough time — but your peak is ${peak}. That window is sacred. Protect it for work only you can do.`
  }
  if (struggles.includes('mood')) {
    return `Your mood affects everything you do. This is actually a superpower — once you understand your patterns, you can predict and prepare for low days.`
  }
  if (peak) {
    return `Based on your ${peak} peak, your best work happens then. Everything else can be scheduled around it.`
  }
  return `You just started. The most important thing you can do right now is log your mood daily — even once a day. Patterns take 7 days to emerge.`
}

export default function InsightCard({ profile, daysSinceSignup }: InsightCardProps) {
  return (
    <div className="card">
      <CardHeader
        icon={<Lightbulb size={13} />}
        label="First insight for you"
        right={<Badge variant="green">Just for you</Badge>}
      />

      <div
        style={{
          background: 'var(--warning-bg)',
          border: '0.5px solid #FAC775',
          borderRadius: 8,
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 7,
          marginBottom: 8,
        }}
      >
        <AlertTriangle size={12} color="var(--warning-text)" style={{ marginTop: 1, flexShrink: 0 }} />
        <p style={{ fontSize: 11, color: 'var(--warning-text)', margin: 0, lineHeight: 1.6 }}>
          {getFirstInsight(profile)}
        </p>
      </div>

      <p style={{ fontSize: 10, color: 'var(--text-2)', margin: 0 }}>
        Tomorrow&apos;s insight will be based on what you actually did.
      </p>
    </div>
  )
}
